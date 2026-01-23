"""
Celery tasks for OCR processing pipeline.

Main workflow:
1. process_pdf_job - Orchestrates the entire pipeline
2. process_page_batch - OCR on batches of pages (parallel)
3. structure_questions - Convert OCR to JSON
"""

import asyncio
import base64
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from celery import shared_task
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from app.core.celery_config import celery_app
from app.core.config import settings
from app.models.enums import OCRJobStatus, QuestionReviewStatus, QuestionType
from app.models.ocr import ExtractedQuestion, OCRJob, OCRJobPage
from app.services.ocr_service import ocr_client


def run_async(coro):
    """Helper to run async code in sync context."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def get_task_session_maker():
    """Create a fresh async engine and session maker for Celery tasks.

    This avoids event loop conflicts by creating a new engine for each task.
    """
    engine = create_async_engine(
        settings.database_url,
        echo=False,
        pool_size=5,
        max_overflow=5,
        pool_pre_ping=True,
    )
    return async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )


@celery_app.task(bind=True, max_retries=3)
def process_pdf_job(self, job_id: int, quality: str = "fast"):
    """
    Main orchestrator task for PDF processing.

    Steps:
    1. Download PDF from S3
    2. Split into pages
    3. Process pages in batches (OCR + structure)
    4. Save extracted questions
    5. Update job status

    Args:
        job_id: OCRJob database ID
        quality: "fast" (32B) or "quality" (72B) for OpenRouter vision model
    """
    return run_async(_process_pdf_job_async(self, job_id, quality))


async def _process_pdf_job_async(task, job_id: int, quality: str = "fast"):
    """Async implementation of process_pdf_job."""
    import fitz  # PyMuPDF

    async with get_task_session_maker()() as db:
        # Load job
        result = await db.execute(
            select(OCRJob)
            .where(OCRJob.id == job_id)
            .options(selectinload(OCRJob.pages))
        )
        job = result.scalar_one_or_none()

        if not job:
            return {"error": f"Job {job_id} not found"}

        # Update status
        job.status = OCRJobStatus.PROCESSING
        job.started_at = datetime.now(UTC)
        job.celery_task_id = task.request.id
        await db.commit()

        try:
            # Download PDF to temp file
            # For now, assume PDF is stored locally or we have S3 access
            # TODO: Implement S3 download when storage is configured

            pdf_path = await _download_pdf(job.pdf_s3_key)
            if not pdf_path:
                raise ValueError(f"Could not download PDF: {job.pdf_s3_key}")

            # Open PDF
            doc = fitz.open(pdf_path)
            total_pages = len(doc)
            job.total_pages = total_pages
            await db.commit()

            # Get already processed page numbers
            processed_page_nums = set()
            for page in job.pages:
                if page.ocr_completed:
                    processed_page_nums.add(page.page_number)

            # Process pages in batches
            batch_size = settings.ocr_batch_size
            all_questions = []

            for batch_start in range(0, total_pages, batch_size):
                batch_end = min(batch_start + batch_size, total_pages)
                batch_pages = []

                # Store rendered page images for later cropping (keyed by page_num)
                page_images: dict[int, bytes] = {}

                for page_idx in range(batch_start, batch_end):
                    page_num = page_idx + 1

                    # Skip already processed
                    if page_num in processed_page_nums:
                        continue

                    page = doc.load_page(page_idx)

                    # Always render page image for cropping feature (scale 2.0)
                    crop_pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                    page_images[page_num] = crop_pix.tobytes("jpeg")

                    # Smart detection: try to extract text directly first
                    extracted_text = page.get_text("text").strip()

                    # If page has substantial text (>200 chars), skip vision
                    # This handles text-based PDFs much faster and cheaper
                    if len(extracted_text) > 200:
                        # Text-based page - no need for vision OCR
                        batch_pages.append((page_num, None, extracted_text))
                    else:
                        # Scanned/image page - need vision OCR
                        pix = page.get_pixmap(matrix=fitz.Matrix(3, 3))
                        img_bytes = pix.tobytes("jpeg")
                        img_b64 = base64.b64encode(img_bytes).decode("utf-8")
                        batch_pages.append((page_num, img_b64, None))

                if not batch_pages:
                    continue

                # Determine provider based on job settings
                provider_value = job.ocr_provider.value
                if provider_value == "openrouter":
                    # OpenRouter uses Qwen 2.5 VL for OCR and DeepSeek for structuring
                    ocr_provider = "openrouter"
                    struct_provider = "openrouter"
                elif provider_value == "hybrid":
                    ocr_provider = "openai"
                    struct_provider = "deepinfra"
                elif provider_value == "openai":
                    ocr_provider = "openai"
                    struct_provider = "openai"
                else:
                    ocr_provider = "deepinfra"
                    struct_provider = "deepinfra"

                # Process batch with quality setting
                results = await ocr_client.process_page_batch(
                    batch_pages,
                    ocr_provider=ocr_provider,
                    structuring_provider=struct_provider,
                    quality=quality,
                )

                # Save results to database
                for page_result in results:
                    page_num = page_result["page_number"]

                    # Create or update OCRJobPage
                    page_record = OCRJobPage(
                        job_id=job.id,
                        page_number=page_num,
                        ocr_markdown=page_result.get("ocr_markdown", ""),
                        is_question_page=page_result.get("is_question_page", False),
                        detected_figures=page_result.get("figures"),
                        ocr_completed=True,
                        structuring_completed=page_result.get("is_question_page", False),
                        ocr_cost_cents=int(page_result.get("ocr_cost_cents", 0)),
                        structuring_cost_cents=int(page_result.get("structuring_cost_cents", 0)),
                        error_message=page_result.get("error"),
                        # Store pre-rendered page image for cropping feature
                        page_image_data=page_images.get(page_num),
                    )
                    db.add(page_record)
                    await db.flush()

                    # Save extracted questions
                    for q_data in page_result.get("questions", []):
                        needs_answer = (
                            not q_data.get("correct_answer")
                            or q_data.get("correct_answer") == ["[NEED_ANSWER]"]
                        )

                        question = ExtractedQuestion(
                            job_id=job.id,
                            source_page_id=page_record.id,
                            review_status=QuestionReviewStatus.PENDING,
                            extraction_confidence=q_data.get("confidence", 0.8),
                            answer_confidence=0.0 if needs_answer else q_data.get("confidence", 0.8),
                            question_text=q_data.get("question_text", ""),
                            question_type=_map_question_type(q_data.get("question_type")),
                            passage_text=q_data.get("passage_text"),
                            chart_title=q_data.get("chart_title"),
                            chart_data=q_data.get("chart_data"),
                            table_data=q_data.get("table_data"),  # New structured table format
                            options=q_data.get("options"),
                            correct_answer=q_data.get("correct_answer") if not needs_answer else None,
                            needs_answer=needs_answer,
                            explanation=q_data.get("explanation"),
                            difficulty=_map_difficulty(q_data.get("difficulty")),
                            domain=_map_domain(q_data.get("domain")),
                            needs_image=q_data.get("needs_image", False),
                        )

                        # Validate question and add any errors
                        validation_errors = _validate_question(question)
                        if validation_errors:
                            question.validation_errors = validation_errors

                        db.add(question)
                        all_questions.append(question)

                    # Update progress
                    job.processed_pages += 1
                    if page_result.get("is_question_page"):
                        job.question_pages += 1
                    else:
                        job.skipped_pages += 1

                # Update extracted questions count incrementally (for UI feedback)
                job.extracted_questions = len(all_questions)
                await db.commit()

                # Update task progress
                progress = (job.processed_pages / total_pages) * 100
                task.update_state(
                    state="PROGRESS",
                    meta={
                        "current": job.processed_pages,
                        "total": total_pages,
                        "percent": progress,
                        "questions": len(all_questions),
                    },
                )

            doc.close()

            # NOTE: Keep PDF file for image cropping feature
            # The file will be cleaned up when the job is deleted

            # Update final status
            job.status = OCRJobStatus.REVIEW
            job.completed_at = datetime.now(UTC)
            job.extracted_questions = len(all_questions)

            # Calculate total cost
            total_cost = sum(p.ocr_cost_cents + p.structuring_cost_cents for p in job.pages)
            job.actual_cost_cents = total_cost

            await db.commit()

            return {
                "status": "success",
                "job_id": job_id,
                "total_pages": total_pages,
                "question_pages": job.question_pages,
                "skipped_pages": job.skipped_pages,
                "extracted_questions": len(all_questions),
                "cost_cents": total_cost,
            }

        except Exception as e:
            job.status = OCRJobStatus.FAILED
            job.error_message = str(e)
            job.retry_count += 1
            await db.commit()

            # Retry if under limit
            if job.retry_count < settings.ocr_max_retries:
                raise task.retry(exc=e, countdown=60 * job.retry_count)

            return {"error": str(e), "job_id": job_id}


async def _download_pdf(s3_key: str) -> str | None:
    """
    Download PDF from S3 to temp file.

    For local development, checks if s3_key is a local path.
    """
    # Check if it's a local file path
    if os.path.exists(s3_key):
        return s3_key

    # Check in uploads directory
    local_path = Path(settings.ocr_upload_dir) / Path(s3_key).name
    if local_path.exists():
        return str(local_path)

    # TODO: Implement actual S3 download
    # For now, return None if not found locally
    return None


def _map_question_type(type_str: str | None) -> QuestionType:
    """Map string to QuestionType enum."""
    if not type_str:
        return QuestionType.MULTIPLE_CHOICE

    type_lower = type_str.lower()
    if "student" in type_lower or "produced" in type_lower or "grid" in type_lower:
        return QuestionType.STUDENT_PRODUCED_RESPONSE
    return QuestionType.MULTIPLE_CHOICE


def _map_difficulty(diff_str: str | None):
    """Map string to QuestionDifficulty enum."""
    from app.models.enums import QuestionDifficulty

    if not diff_str:
        return QuestionDifficulty.MEDIUM

    diff_lower = diff_str.lower()
    if "easy" in diff_lower:
        return QuestionDifficulty.EASY
    elif "hard" in diff_lower:
        return QuestionDifficulty.HARD
    return QuestionDifficulty.MEDIUM


def _map_domain(domain_str: str | None):
    """Map string to QuestionDomain enum."""
    from app.models.enums import QuestionDomain

    if not domain_str:
        return None

    domain_lower = domain_str.lower()

    mapping = {
        "algebra": QuestionDomain.ALGEBRA,
        "advanced_math": QuestionDomain.ADVANCED_MATH,
        "geometry_trigonometry": QuestionDomain.GEOMETRY_TRIGONOMETRY,
        "problem_solving_data_analysis": QuestionDomain.PROBLEM_SOLVING_DATA_ANALYSIS,
        "craft_and_structure": QuestionDomain.CRAFT_AND_STRUCTURE,
        "information_and_ideas": QuestionDomain.INFORMATION_AND_IDEAS,
        "expression_of_ideas": QuestionDomain.EXPRESSION_OF_IDEAS,
        "standard_english_conventions": QuestionDomain.STANDARD_ENGLISH_CONVENTIONS,
    }

    return mapping.get(domain_lower)


def _validate_question(question) -> list[str]:
    """
    Validate an ExtractedQuestion and return list of validation errors.

    Checks:
    - R&W questions should have a passage (SAT R&W always includes passages)
    """
    from app.models.enums import QuestionDomain

    # Reading & Writing domains that require a passage
    rw_domains = {
        QuestionDomain.CRAFT_AND_STRUCTURE,
        QuestionDomain.INFORMATION_AND_IDEAS,
        QuestionDomain.EXPRESSION_OF_IDEAS,
        QuestionDomain.STANDARD_ENGLISH_CONVENTIONS,
    }

    errors = []

    # Check if R&W question is missing passage
    if question.domain in rw_domains and not question.passage_text:
        errors.append("Reading & Writing question missing passage text")

    # Check if domain looks like R&W based on keywords but is missing passage
    if not question.domain and question.question_text:
        text_lower = question.question_text.lower()
        rw_indicators = [
            "underlined", "sentence", "paragraph", "author", "passage",
            "which choice", "best completes", "text", "punctuation",
        ]
        if any(indicator in text_lower for indicator in rw_indicators) and not question.passage_text:
            errors.append("Question appears to be Reading & Writing but is missing passage")

    return errors


@celery_app.task(bind=True)
def cancel_ocr_job(self, job_id: int):
    """Cancel a running OCR job."""
    return run_async(_cancel_ocr_job_async(job_id))


async def _cancel_ocr_job_async(job_id: int):
    """Async implementation of cancel_ocr_job."""
    async with get_task_session_maker()() as db:
        result = await db.execute(
            select(OCRJob).where(OCRJob.id == job_id)
        )
        job = result.scalar_one_or_none()

        if not job:
            return {"error": f"Job {job_id} not found"}

        if job.status not in [OCRJobStatus.PENDING, OCRJobStatus.PROCESSING]:
            return {"error": f"Job {job_id} cannot be cancelled (status: {job.status})"}

        # Revoke celery task if running
        if job.celery_task_id:
            celery_app.control.revoke(job.celery_task_id, terminate=True)

        job.status = OCRJobStatus.CANCELLED
        await db.commit()

        return {"status": "cancelled", "job_id": job_id}


@celery_app.task(bind=True)
def structure_skipped_pages(self, job_id: int, page_numbers: list[int]):
    """
    Run structuring on skipped pages that already have OCR text.

    This is for pages that were incorrectly detected as non-question pages.
    We have the text, we just need to run the LLM structuring step.

    Args:
        job_id: The job ID
        page_numbers: List of page numbers to structure
    """
    return run_async(_structure_skipped_pages_async(self, job_id, page_numbers))


async def _structure_skipped_pages_async(task, job_id: int, page_numbers: list[int]):
    """Async implementation of structure_skipped_pages."""
    import fitz  # PyMuPDF

    async with get_task_session_maker()() as db:
        result = await db.execute(
            select(OCRJob)
            .where(OCRJob.id == job_id)
            .options(selectinload(OCRJob.pages))
        )
        job = result.scalar_one_or_none()

        if not job:
            return {"error": f"Job {job_id} not found"}

        # Find the specific pages
        pages_to_process = [p for p in job.pages if p.page_number in page_numbers]

        if not pages_to_process:
            return {"message": "No pages found", "job_id": job_id}

        # Update job status
        job.status = OCRJobStatus.PROCESSING
        await db.commit()

        # Determine providers
        provider_value = job.ocr_provider.value
        if provider_value == "openrouter":
            ocr_provider = "openrouter"
            struct_provider = "openrouter"
            max_concurrent = 50  # OpenRouter handles high concurrency
        elif provider_value == "hybrid":
            ocr_provider = "openai"
            struct_provider = "deepinfra"
            max_concurrent = 10
        elif provider_value == "openai":
            ocr_provider = "openai"
            struct_provider = "openai"
            max_concurrent = 5
        else:
            ocr_provider = provider_value
            struct_provider = "deepinfra"
            max_concurrent = 10

        extracted_count = 0

        # Download PDF from S3
        pdf_path = await _download_pdf(job.pdf_s3_key)
        doc = None
        if pdf_path:
            doc = fitz.open(pdf_path)

        # Prepare pages that need OCR (extract images)
        pages_needing_ocr = []
        for page in pages_to_process:
            if not page.ocr_markdown and doc:
                page_idx = page.page_number - 1
                pdf_page = doc.load_page(page_idx)

                # Render for OCR (high res)
                pix = pdf_page.get_pixmap(matrix=fitz.Matrix(3, 3))
                img_bytes = pix.tobytes("jpeg")
                img_b64 = base64.b64encode(img_bytes).decode("utf-8")

                # Also store page image for cropping if not already stored
                if not page.page_image_data:
                    crop_pix = pdf_page.get_pixmap(matrix=fitz.Matrix(2, 2))
                    page.page_image_data = crop_pix.tobytes("jpeg")

                pages_needing_ocr.append((page, img_b64))

        # Run OCR in parallel
        if pages_needing_ocr:
            semaphore = asyncio.Semaphore(max_concurrent)

            async def run_ocr(page, img_b64):
                async with semaphore:
                    try:
                        ocr_result = await ocr_client.extract_text(img_b64, provider=ocr_provider)
                        return (page, ocr_result.markdown, None)
                    except Exception as e:
                        return (page, None, str(e))

            ocr_tasks = [run_ocr(page, img_b64) for page, img_b64 in pages_needing_ocr]
            ocr_results = await asyncio.gather(*ocr_tasks)

            # Save OCR results
            for page, markdown, error in ocr_results:
                if markdown:
                    page.ocr_markdown = markdown
                elif error:
                    page.error_message = f"OCR failed: {error}"
            await db.commit()

        # Now process all pages that have text (structuring) - IN PARALLEL
        pages_with_text = [p for p in pages_to_process if p.ocr_markdown]

        if pages_with_text:
            struct_semaphore = asyncio.Semaphore(max_concurrent)

            async def run_structuring(page):
                async with struct_semaphore:
                    try:
                        questions = await ocr_client.structure_to_json(
                            page.ocr_markdown,
                            provider=struct_provider,
                        )
                        return (page, questions, None)
                    except Exception as e:
                        return (page, None, str(e))

            struct_tasks = [run_structuring(p) for p in pages_with_text]
            struct_results = await asyncio.gather(*struct_tasks)

            # Save all results
            for page, questions, error in struct_results:
                if error:
                    page.error_message = error
                    continue

                if questions:
                    for q_data in questions:
                        needs_answer = (
                            not q_data.correct_answer
                            or q_data.correct_answer == ["[NEED_ANSWER]"]
                        )

                        question = ExtractedQuestion(
                            job_id=job.id,
                            source_page_id=page.id,
                            review_status=QuestionReviewStatus.PENDING,
                            extraction_confidence=q_data.confidence,
                            answer_confidence=0.0 if needs_answer else q_data.confidence,
                            question_text=q_data.question_text,
                            question_type=_map_question_type(q_data.question_type),
                            passage_text=q_data.passage_text,
                            chart_title=q_data.chart_title,
                            chart_data=q_data.chart_data,
                            table_data=q_data.table_data,
                            options=q_data.options,
                            correct_answer=q_data.correct_answer if not needs_answer else None,
                            needs_answer=needs_answer,
                            explanation=q_data.explanation,
                            difficulty=_map_difficulty(q_data.difficulty),
                            domain=_map_domain(q_data.domain),
                            needs_image=q_data.needs_image,
                        )

                        # Validate question and add any errors
                        validation_errors = _validate_question(question)
                        if validation_errors:
                            question.validation_errors = validation_errors

                        db.add(question)
                        extracted_count += 1

                    page.is_question_page = True
                    page.structuring_completed = True

            await db.commit()

        # Close PDF
        if doc:
            doc.close()

        # Update job counts
        job.extracted_questions += extracted_count
        job.question_pages = len([p for p in job.pages if p.is_question_page])
        job.skipped_pages = len([p for p in job.pages if not p.is_question_page])
        job.status = OCRJobStatus.REVIEW
        await db.commit()

        return {
            "status": "completed",
            "job_id": job_id,
            "pages_processed": len(pages_to_process),
            "questions_extracted": extracted_count,
        }


@celery_app.task(bind=True)
def retry_failed_pages(self, job_id: int, page_numbers: list[int] | None = None, provider: str | None = None):
    """
    Retry processing failed pages in a job.

    Args:
        job_id: The job ID
        page_numbers: Optional list of specific page numbers to retry. If None, retries all failed pages.
        provider: Optional provider to use ('openai' or 'deepinfra'). If None, uses default.
    """
    return run_async(_retry_failed_pages_async(self, job_id, page_numbers, provider))


async def _retry_failed_pages_async(task, job_id: int, page_numbers: list[int] | None = None, provider: str | None = None):
    """Async implementation of retry_failed_pages."""
    async with get_task_session_maker()() as db:
        result = await db.execute(
            select(OCRJob)
            .where(OCRJob.id == job_id)
            .options(selectinload(OCRJob.pages))
        )
        job = result.scalar_one_or_none()

        if not job:
            return {"error": f"Job {job_id} not found"}

        # Find pages to retry
        if page_numbers:
            # Retry specific pages (for re-extraction)
            pages_to_retry = [p for p in job.pages if p.page_number in page_numbers]
        else:
            # Retry failed pages only
            pages_to_retry = [p for p in job.pages if p.error_message and not p.ocr_completed]

        if not pages_to_retry:
            return {"message": "No pages to retry", "job_id": job_id}

        # Reset job status
        job.status = OCRJobStatus.PROCESSING

        # Update provider if specified
        if provider:
            job.processing_mode = "quality" if provider == "deepinfra" else "speed"

        await db.commit()

        # Mark pages for reprocessing (don't delete - just reset status)
        for page in pages_to_retry:
            page.ocr_completed = False
            page.structuring_completed = False
            page.error_message = None
            if provider:
                page.provider_used = provider
        await db.commit()

        # Trigger main processing task
        process_pdf_job.delay(job_id)

        return {
            "status": "retrying",
            "job_id": job_id,
            "pages_to_retry": len(pages_to_retry),
            "provider": provider,
        }
