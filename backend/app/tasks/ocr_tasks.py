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
def process_pdf_job(self, job_id: int):
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
    """
    return run_async(_process_pdf_job_async(self, job_id))


async def _process_pdf_job_async(task, job_id: int):
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

                for page_idx in range(batch_start, batch_end):
                    page_num = page_idx + 1

                    # Skip already processed
                    if page_num in processed_page_nums:
                        continue

                    # Convert page to image
                    page = doc.load_page(page_idx)
                    pix = page.get_pixmap(matrix=fitz.Matrix(3, 3))
                    img_bytes = pix.tobytes("jpeg")
                    img_b64 = base64.b64encode(img_bytes).decode("utf-8")

                    batch_pages.append((page_num, img_b64))

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

                # Process batch
                results = await ocr_client.process_page_batch(
                    batch_pages,
                    ocr_provider=ocr_provider,
                    structuring_provider=struct_provider,
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
