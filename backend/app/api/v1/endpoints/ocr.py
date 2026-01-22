"""
OCR Processing API Endpoints.

Provides:
- PDF upload and job creation
- Job status and progress tracking
- Extracted questions listing and editing
- Question review workflow
- Import to test module
"""

import hashlib
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import AdminUser, TeacherOrAdmin
from app.models.enums import (
    ModuleDifficulty,
    OCRJobStatus,
    OCRProvider,
    QuestionDifficulty,
    QuestionDomain,
    QuestionReviewStatus,
    QuestionType,
    SATModule,
    SATSection,
    TestType,
)
from app.models.ocr import ExtractedPassage, ExtractedQuestion, OCRJob, OCRJobPage
from app.models.test import Question, TestModule
from app.schemas.base import BaseSchema, PaginatedResponse
from app.tasks.ocr_tasks import cancel_ocr_job, process_pdf_job, retry_failed_pages, structure_skipped_pages

router = APIRouter(prefix="/ocr", tags=["OCR Processing"])


# ===== Schemas =====


class OCRJobCreate(BaseSchema):
    """Request to create OCR job."""
    target_module_id: int | None = None
    provider: OCRProvider = OCRProvider.HYBRID


class OCRJobResponse(BaseSchema):
    """OCR job details."""
    id: int
    status: OCRJobStatus
    pdf_filename: str
    total_pages: int
    processed_pages: int
    question_pages: int
    skipped_pages: int
    extracted_questions: int
    approved_questions: int
    imported_questions: int
    progress_percent: float
    ocr_provider: OCRProvider
    estimated_cost_cents: int
    actual_cost_cents: int
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    created_at: datetime
    target_module_id: int | None


class OCRJobListResponse(PaginatedResponse):
    """Paginated list of OCR jobs."""
    items: list[OCRJobResponse]


class ExtractedQuestionResponse(BaseSchema):
    """Extracted question details."""
    id: int
    job_id: int
    source_page_number: int
    review_status: QuestionReviewStatus
    extraction_confidence: float
    answer_confidence: float
    question_text: str
    question_type: QuestionType
    passage_text: str | None
    chart_title: str | None
    chart_data: str | None
    table_data: dict | None  # Structured table: {"headers": [...], "rows": [[...]], "title": "..."}
    options: list[dict] | None
    correct_answer: list[str] | None
    needs_answer: bool
    explanation: str | None
    difficulty: QuestionDifficulty | None
    domain: QuestionDomain | None
    needs_image: bool
    question_image_url: str | None
    question_image_s3_key: str | None
    image_extraction_status: str | None
    validation_errors: list[str] | None
    created_at: datetime


class ExtractedQuestionListResponse(PaginatedResponse):
    """Paginated list of extracted questions."""
    items: list[ExtractedQuestionResponse]


class QuestionReviewUpdate(BaseSchema):
    """Request to update extracted question."""
    question_text: str | None = None
    question_type: QuestionType | None = None
    passage_text: str | None = None
    options: list[dict] | None = None
    correct_answer: list[str] | None = None
    explanation: str | None = None
    difficulty: QuestionDifficulty | None = None
    domain: QuestionDomain | None = None
    review_status: QuestionReviewStatus | None = None


class BulkReviewRequest(BaseSchema):
    """Bulk approve/reject questions."""
    question_ids: list[int]
    action: str  # "approve" | "reject"


class ImportRequest(BaseSchema):
    """Request to import questions to module."""
    question_ids: list[int] | None = None  # None = all approved
    target_module_id: int


class ImportResponse(BaseSchema):
    """Import result."""
    imported: int
    errors: list[str]
    test_id: int | None = None


# ===== Test Configuration Schemas =====


class ModuleConfigRequest(BaseSchema):
    """Configuration for a single module."""
    section: str  # "reading_writing" | "math"
    module: str  # "module_1" | "module_2"
    difficulty: str = "standard"  # "standard" | "easier" | "harder"
    question_start: int  # 1-indexed start question number
    question_end: int  # 1-indexed end question number (inclusive)
    time_limit_minutes: int


class TestConfigRequest(BaseSchema):
    """Configuration for creating a test from OCR job."""
    test_title: str
    test_type: str  # "full_test" | "section_test" | "module_test"
    section: str | None = None  # For section_test: "reading_writing" | "math"
    modules: list[ModuleConfigRequest]
    is_published: bool = False
    is_premium: bool = False


class TestConfigResponse(BaseSchema):
    """Response after configuring test."""
    job_id: int
    test_config: dict
    estimated_questions: int


class ImportWithTestRequest(BaseSchema):
    """Request to import questions and create a test."""
    test_config: TestConfigRequest
    question_ids: list[int] | None = None  # If None, use all approved


class ImportWithTestResponse(BaseSchema):
    """Response after import with test creation."""
    test_id: int
    test_title: str
    modules_created: int
    questions_imported: int
    errors: list[str]


# ===== Passage Schemas =====


class ExtractedPassageResponse(BaseSchema):
    """Extracted passage details."""
    id: int
    job_id: int
    source_page_number: int | None
    title: str | None
    content: str
    source: str | None
    author: str | None
    word_count: int | None
    figures: list[dict] | None
    genre: str | None
    topic_tags: list[str] | None
    review_status: QuestionReviewStatus
    extraction_confidence: float
    linked_questions_count: int
    created_at: datetime


class ExtractedPassageListResponse(PaginatedResponse):
    """Paginated list of extracted passages."""
    items: list[ExtractedPassageResponse]


class PassageReviewUpdate(BaseSchema):
    """Request to update extracted passage."""
    title: str | None = None
    content: str | None = None
    source: str | None = None
    author: str | None = None
    genre: str | None = None
    topic_tags: list[str] | None = None
    review_status: QuestionReviewStatus | None = None


# ===== Phase 6: Error Handling Schemas =====


class FailedPageInfo(BaseSchema):
    """Information about a failed page."""
    page_number: int
    error_message: str | None
    retry_count: int
    last_error_at: datetime | None
    provider_used: str | None


class FailedPagesResponse(BaseSchema):
    """Response listing failed pages for a job."""
    job_id: int
    failed_count: int
    pages: list[FailedPageInfo]


class RetryFailedRequest(BaseSchema):
    """Request to retry failed pages."""
    page_numbers: list[int] | None = None  # None = retry all failed
    use_quality_provider: bool = False


class RetryFailedResponse(BaseSchema):
    """Response after initiating retry."""
    job_id: int
    retrying_pages: int
    celery_task_id: str | None


# ===== Endpoints =====


@router.post("/upload", response_model=OCRJobResponse)
async def upload_pdf(
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    target_module_id: int | None = Form(None),
    provider: str = Form("openrouter"),
    quality: str = Form("fast"),
):
    """
    Upload a PDF for OCR processing.

    Creates an OCR job and starts async processing.
    """
    # Validate file
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    content = await file.read()
    size_mb = len(content) / (1024 * 1024)

    if size_mb > settings.max_pdf_size_mb:
        raise HTTPException(
            status_code=400,
            detail=f"PDF too large. Max size: {settings.max_pdf_size_mb}MB"
        )

    # Calculate hash for deduplication
    pdf_hash = hashlib.md5(content).hexdigest()

    # Check for existing job with same hash
    existing = await db.execute(
        select(OCRJob)
        .where(OCRJob.pdf_hash == pdf_hash)
        .where(OCRJob.user_id == user.id)
        .where(OCRJob.status.in_([OCRJobStatus.PENDING, OCRJobStatus.PROCESSING, OCRJobStatus.REVIEW]))
    )
    existing_job = existing.scalar_one_or_none()

    if existing_job:
        raise HTTPException(
            status_code=409,
            detail=f"PDF already being processed. Job ID: {existing_job.id}"
        )

    # Save PDF locally (or to S3)
    upload_dir = Path(settings.ocr_upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    safe_filename = f"{pdf_hash[:16]}_{file.filename}"
    pdf_path = upload_dir / safe_filename

    with open(pdf_path, "wb") as f:
        f.write(content)

    # Count pages (quick check with PyMuPDF)
    try:
        import fitz
        doc = fitz.open(str(pdf_path))
        total_pages = len(doc)
        doc.close()
    except Exception:
        total_pages = 0

    # Map provider string to enum
    provider_lower = provider.lower()
    provider_map = {
        "openai": OCRProvider.OPENAI,
        "deepinfra": OCRProvider.DEEPINFRA,
        "openrouter": OCRProvider.OPENROUTER,
        "replicate": OCRProvider.REPLICATE,
        "hybrid": OCRProvider.HYBRID,
    }
    ocr_provider = provider_map.get(provider_lower, OCRProvider.HYBRID)

    # Estimate cost (rough: $0.003 per page for hybrid)
    estimated_cost = int(total_pages * 0.3)  # 0.3 cents per page

    # Create job
    job = OCRJob(
        user_id=user.id,
        target_module_id=target_module_id,
        status=OCRJobStatus.PENDING,
        pdf_filename=file.filename,
        pdf_s3_key=str(pdf_path),
        pdf_hash=pdf_hash,
        total_pages=total_pages,
        ocr_provider=ocr_provider,
        estimated_cost_cents=estimated_cost,
    )
    db.add(job)
    await db.flush()

    # Start Celery task with quality parameter
    task = process_pdf_job.delay(job.id, quality=quality)
    job.celery_task_id = task.id
    await db.commit()

    return OCRJobResponse(
        id=job.id,
        status=job.status,
        pdf_filename=job.pdf_filename,
        total_pages=job.total_pages,
        processed_pages=job.processed_pages,
        question_pages=job.question_pages,
        skipped_pages=job.skipped_pages,
        extracted_questions=job.extracted_questions,
        approved_questions=job.approved_questions,
        imported_questions=job.imported_questions,
        progress_percent=job.progress_percent,
        ocr_provider=job.ocr_provider,
        estimated_cost_cents=job.estimated_cost_cents,
        actual_cost_cents=job.actual_cost_cents,
        started_at=job.started_at,
        completed_at=job.completed_at,
        error_message=job.error_message,
        created_at=job.created_at,
        target_module_id=job.target_module_id,
    )


@router.get("/jobs", response_model=OCRJobListResponse)
async def list_jobs(
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: OCRJobStatus | None = None,
):
    """List OCR jobs for current user."""
    query = select(OCRJob).where(OCRJob.user_id == user.id)

    if status:
        query = query.where(OCRJob.status == status)

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    query = query.order_by(OCRJob.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    jobs = result.scalars().all()

    return OCRJobListResponse(
        items=[
            OCRJobResponse(
                id=j.id,
                status=j.status,
                pdf_filename=j.pdf_filename,
                total_pages=j.total_pages,
                processed_pages=j.processed_pages,
                question_pages=j.question_pages,
                skipped_pages=j.skipped_pages,
                extracted_questions=j.extracted_questions,
                approved_questions=j.approved_questions,
                imported_questions=j.imported_questions,
                progress_percent=j.progress_percent,
                ocr_provider=j.ocr_provider,
                estimated_cost_cents=j.estimated_cost_cents,
                actual_cost_cents=j.actual_cost_cents,
                started_at=j.started_at,
                completed_at=j.completed_at,
                error_message=j.error_message,
                created_at=j.created_at,
                target_module_id=j.target_module_id,
            )
            for j in jobs
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.get("/jobs/{job_id}", response_model=OCRJobResponse)
async def get_job(
    job_id: int,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get OCR job details."""
    result = await db.execute(
        select(OCRJob)
        .where(OCRJob.id == job_id)
        .where(OCRJob.user_id == user.id)
    )
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return OCRJobResponse(
        id=job.id,
        status=job.status,
        pdf_filename=job.pdf_filename,
        total_pages=job.total_pages,
        processed_pages=job.processed_pages,
        question_pages=job.question_pages,
        skipped_pages=job.skipped_pages,
        extracted_questions=job.extracted_questions,
        approved_questions=job.approved_questions,
        imported_questions=job.imported_questions,
        progress_percent=job.progress_percent,
        ocr_provider=job.ocr_provider,
        estimated_cost_cents=job.estimated_cost_cents,
        actual_cost_cents=job.actual_cost_cents,
        started_at=job.started_at,
        completed_at=job.completed_at,
        error_message=job.error_message,
        created_at=job.created_at,
        target_module_id=job.target_module_id,
    )


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(
    job_id: int,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Cancel a pending or processing job."""
    result = await db.execute(
        select(OCRJob)
        .where(OCRJob.id == job_id)
        .where(OCRJob.user_id == user.id)
    )
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status not in [OCRJobStatus.PENDING, OCRJobStatus.PROCESSING]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel job with status: {job.status.value}"
        )

    # Dispatch cancel task
    cancel_ocr_job.delay(job_id)

    return {"message": "Cancellation requested", "job_id": job_id}


@router.post("/jobs/{job_id}/resume")
async def resume_job(
    job_id: int,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Resume a stuck processing job.

    Use this when a job is stuck in PROCESSING state (e.g., after server restart).
    The job will continue from where it left off, skipping already processed pages.
    """
    result = await db.execute(
        select(OCRJob)
        .where(OCRJob.id == job_id)
        .where(OCRJob.user_id == user.id)
    )
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status not in [OCRJobStatus.PENDING, OCRJobStatus.PROCESSING]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot resume job with status: {job.status.value}. Only PENDING or PROCESSING jobs can be resumed."
        )

    # Re-trigger processing task - it will skip already completed pages
    task = process_pdf_job.delay(job_id)
    job.celery_task_id = task.id
    await db.commit()

    return {
        "message": "Job resumed",
        "job_id": job_id,
        "processed_pages": job.processed_pages,
        "total_pages": job.total_pages,
        "celery_task_id": task.id,
    }


@router.get("/jobs/{job_id}/skipped-pages")
async def list_skipped_pages(
    job_id: int,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    List pages that were skipped (not detected as question pages).

    Returns page numbers and a preview of the extracted text so users
    can decide if they want to force re-process them.
    """
    result = await db.execute(
        select(OCRJob)
        .where(OCRJob.id == job_id)
        .where(OCRJob.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Get skipped pages (is_question_page = False)
    pages_result = await db.execute(
        select(OCRJobPage)
        .where(OCRJobPage.job_id == job_id)
        .where(OCRJobPage.is_question_page == False)
        .order_by(OCRJobPage.page_number)
    )
    skipped_pages = pages_result.scalars().all()

    return {
        "job_id": job_id,
        "skipped_count": len(skipped_pages),
        "pages": [
            {
                "page_number": p.page_number,
                "text_preview": (p.ocr_markdown[:500] + "...") if p.ocr_markdown and len(p.ocr_markdown) > 500 else p.ocr_markdown,
                "text_length": len(p.ocr_markdown) if p.ocr_markdown else 0,
            }
            for p in skipped_pages
        ],
    }


class ProcessSkippedRequest(BaseModel):
    page_numbers: list[int] | None = None


@router.post("/jobs/{job_id}/process-skipped")
async def process_skipped_pages(
    job_id: int,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: ProcessSkippedRequest = ProcessSkippedRequest(),
):
    """
    Force re-process skipped pages as question pages.

    Args:
        page_numbers: Specific pages to re-process. If None, processes all skipped pages.

    This will run the structuring step on these pages to extract questions,
    even though they were originally detected as non-question pages.
    """
    result = await db.execute(
        select(OCRJob)
        .where(OCRJob.id == job_id)
        .where(OCRJob.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Get skipped pages to process
    query = (
        select(OCRJobPage)
        .where(OCRJobPage.job_id == job_id)
        .where(OCRJobPage.is_question_page == False)
    )
    if request.page_numbers:
        query = query.where(OCRJobPage.page_number.in_(request.page_numbers))

    pages_result = await db.execute(query)
    pages_to_process = pages_result.scalars().all()

    if not pages_to_process:
        return {"message": "No skipped pages to process", "processed": 0}

    # Get page numbers
    page_nums = [p.page_number for p in pages_to_process]

    # Trigger structuring task (no need to re-do OCR, we have the text)
    task = structure_skipped_pages.delay(job_id, page_nums)

    return {
        "message": f"Processing {len(pages_to_process)} skipped pages",
        "job_id": job_id,
        "page_numbers": page_nums,
        "celery_task_id": task.id,
    }


@router.get("/jobs/{job_id}/questions", response_model=ExtractedQuestionListResponse)
async def list_job_questions(
    job_id: int,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: QuestionReviewStatus | None = None,
    needs_answer: bool | None = None,
    needs_image: bool | None = None,
):
    """List extracted questions for a job."""
    # Verify job ownership
    job_result = await db.execute(
        select(OCRJob)
        .where(OCRJob.id == job_id)
        .where(OCRJob.user_id == user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    query = (
        select(ExtractedQuestion)
        .join(OCRJobPage, ExtractedQuestion.source_page_id == OCRJobPage.id)
        .where(ExtractedQuestion.job_id == job_id)
    )

    if status:
        query = query.where(ExtractedQuestion.review_status == status)
    if needs_answer is not None:
        query = query.where(ExtractedQuestion.needs_answer == needs_answer)
    if needs_image is not None:
        query = query.where(ExtractedQuestion.needs_image == needs_image)

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    query = query.order_by(OCRJobPage.page_number, ExtractedQuestion.id)
    query = query.offset((page - 1) * page_size).limit(page_size)

    # Execute with page join for page_number
    result = await db.execute(
        query.options(selectinload(ExtractedQuestion.source_page))
    )
    questions = result.scalars().all()

    return ExtractedQuestionListResponse(
        items=[
            ExtractedQuestionResponse(
                id=q.id,
                job_id=q.job_id,
                source_page_number=q.source_page.page_number if q.source_page else 0,
                review_status=q.review_status,
                extraction_confidence=q.extraction_confidence,
                answer_confidence=q.answer_confidence,
                question_text=q.question_text,
                question_type=q.question_type,
                passage_text=q.passage_text,
                chart_title=q.chart_title,
                chart_data=q.chart_data,
                table_data=q.table_data,
                options=q.options,
                correct_answer=q.correct_answer,
                needs_answer=q.needs_answer,
                explanation=q.explanation,
                difficulty=q.difficulty,
                domain=q.domain,
                needs_image=q.needs_image,
                question_image_url=q.question_image_url,
                question_image_s3_key=q.question_image_s3_key,
                image_extraction_status=q.image_extraction_status,
                validation_errors=q.validation_errors,
                created_at=q.created_at,
            )
            for q in questions
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.get("/questions/{question_id}", response_model=ExtractedQuestionResponse)
async def get_question(
    question_id: int,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get extracted question details."""
    result = await db.execute(
        select(ExtractedQuestion)
        .join(OCRJob, ExtractedQuestion.job_id == OCRJob.id)
        .where(ExtractedQuestion.id == question_id)
        .where(OCRJob.user_id == user.id)
        .options(selectinload(ExtractedQuestion.source_page))
    )
    question = result.scalar_one_or_none()

    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    return ExtractedQuestionResponse(
        id=question.id,
        job_id=question.job_id,
        source_page_number=question.source_page.page_number if question.source_page else 0,
        review_status=question.review_status,
        extraction_confidence=question.extraction_confidence,
        answer_confidence=question.answer_confidence,
        question_text=question.question_text,
        question_type=question.question_type,
        passage_text=question.passage_text,
        chart_title=question.chart_title,
        chart_data=question.chart_data,
        table_data=question.table_data,
        options=question.options,
        correct_answer=question.correct_answer,
        needs_answer=question.needs_answer,
        explanation=question.explanation,
        difficulty=question.difficulty,
        domain=question.domain,
        needs_image=question.needs_image,
        question_image_url=question.question_image_url,
        question_image_s3_key=question.question_image_s3_key,
        image_extraction_status=question.image_extraction_status,
        validation_errors=question.validation_errors,
        created_at=question.created_at,
    )


@router.put("/questions/{question_id}", response_model=ExtractedQuestionResponse)
async def update_question(
    question_id: int,
    data: QuestionReviewUpdate,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update an extracted question (review/edit)."""
    result = await db.execute(
        select(ExtractedQuestion)
        .join(OCRJob, ExtractedQuestion.job_id == OCRJob.id)
        .where(ExtractedQuestion.id == question_id)
        .where(OCRJob.user_id == user.id)
        .options(selectinload(ExtractedQuestion.source_page))
    )
    question = result.scalar_one_or_none()

    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Update fields
    if data.question_text is not None:
        question.question_text = data.question_text
    if data.question_type is not None:
        question.question_type = data.question_type
    if data.passage_text is not None:
        question.passage_text = data.passage_text
    if data.options is not None:
        question.options = data.options
    if data.correct_answer is not None:
        question.correct_answer = data.correct_answer
        question.needs_answer = False
    if data.explanation is not None:
        question.explanation = data.explanation
    if data.difficulty is not None:
        question.difficulty = data.difficulty
    if data.domain is not None:
        question.domain = data.domain
    if data.review_status is not None:
        question.review_status = data.review_status
        if data.review_status in [QuestionReviewStatus.APPROVED, QuestionReviewStatus.REJECTED]:
            question.reviewed_by_id = user.id
            question.reviewed_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(question)

    return ExtractedQuestionResponse(
        id=question.id,
        job_id=question.job_id,
        source_page_number=question.source_page.page_number if question.source_page else 0,
        review_status=question.review_status,
        extraction_confidence=question.extraction_confidence,
        answer_confidence=question.answer_confidence,
        question_text=question.question_text,
        question_type=question.question_type,
        passage_text=question.passage_text,
        chart_title=question.chart_title,
        chart_data=question.chart_data,
        table_data=question.table_data,
        options=question.options,
        correct_answer=question.correct_answer,
        needs_answer=question.needs_answer,
        explanation=question.explanation,
        difficulty=question.difficulty,
        domain=question.domain,
        needs_image=question.needs_image,
        question_image_url=question.question_image_url,
        question_image_s3_key=question.question_image_s3_key,
        image_extraction_status=question.image_extraction_status,
        validation_errors=question.validation_errors,
        created_at=question.created_at,
    )


@router.post("/questions/bulk-review")
async def bulk_review_questions(
    data: BulkReviewRequest,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Bulk approve or reject questions."""
    if data.action not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")

    new_status = (
        QuestionReviewStatus.APPROVED if data.action == "approve"
        else QuestionReviewStatus.REJECTED
    )

    # Verify all questions belong to user's jobs
    result = await db.execute(
        select(ExtractedQuestion)
        .join(OCRJob, ExtractedQuestion.job_id == OCRJob.id)
        .where(ExtractedQuestion.id.in_(data.question_ids))
        .where(OCRJob.user_id == user.id)
    )
    questions = result.scalars().all()

    if len(questions) != len(data.question_ids):
        raise HTTPException(status_code=404, detail="Some questions not found")

    # Update all
    await db.execute(
        update(ExtractedQuestion)
        .where(ExtractedQuestion.id.in_(data.question_ids))
        .values(
            review_status=new_status,
            reviewed_by_id=user.id,
            reviewed_at=datetime.now(UTC),
        )
    )
    await db.commit()

    return {
        "updated": len(data.question_ids),
        "new_status": new_status.value,
    }


@router.post("/jobs/{job_id}/import", response_model=ImportResponse)
async def import_questions(
    job_id: int,
    data: ImportRequest,
    user: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Import approved questions to a test module."""
    # Verify job
    job_result = await db.execute(
        select(OCRJob).where(OCRJob.id == job_id).where(OCRJob.user_id == user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Verify target module
    module_result = await db.execute(
        select(TestModule).where(TestModule.id == data.target_module_id)
    )
    module = module_result.scalar_one_or_none()
    if not module:
        raise HTTPException(status_code=404, detail="Target module not found")

    # Get questions to import
    # Order by page number to ensure correct sequencing even when
    # skipped pages are processed later with higher IDs
    query = (
        select(ExtractedQuestion)
        .join(OCRJobPage, ExtractedQuestion.source_page_id == OCRJobPage.id)
        .where(ExtractedQuestion.job_id == job_id)
        .where(ExtractedQuestion.review_status == QuestionReviewStatus.APPROVED)
        .where(ExtractedQuestion.imported_question_id.is_(None))
        .order_by(OCRJobPage.page_number, ExtractedQuestion.id)
    )

    if data.question_ids:
        query = query.where(ExtractedQuestion.id.in_(data.question_ids))

    result = await db.execute(query)
    questions = result.scalars().all()

    if not questions:
        raise HTTPException(status_code=400, detail="No approved questions to import")

    # Get current max question number in module
    max_num_result = await db.execute(
        select(func.max(Question.question_number))
        .where(Question.module_id == data.target_module_id)
    )
    current_max = max_num_result.scalar() or 0

    imported = 0
    errors = []

    for i, eq in enumerate(questions):
        try:
            # Create Question
            question = Question(
                module_id=data.target_module_id,
                question_number=current_max + i + 1,
                question_text=eq.question_text,
                question_type=eq.question_type,
                question_image_url=eq.question_image_url,
                options=eq.options,
                correct_answer=eq.correct_answer or [],
                explanation=eq.explanation,
                difficulty=eq.difficulty,
                domain=eq.domain,
                skill_tags=eq.skill_tags,
                table_data=eq.table_data,  # Include structured table data
            )
            db.add(question)
            await db.flush()

            # Link back
            eq.imported_question_id = question.id
            eq.review_status = QuestionReviewStatus.IMPORTED

            imported += 1

        except Exception as e:
            errors.append(f"Question {eq.id}: {str(e)}")

    # Update job stats
    job.imported_questions += imported
    job.status = OCRJobStatus.COMPLETED

    await db.commit()

    return ImportResponse(imported=imported, errors=errors)


@router.post("/jobs/{job_id}/import-with-test", response_model=ImportWithTestResponse)
async def import_with_test(
    job_id: int,
    data: ImportWithTestRequest,
    user: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Import questions and create a new test with configured modules.

    This endpoint:
    1. Creates a new Test record
    2. Creates TestModule records per configuration
    3. Creates Question records linked to modules
    4. Assigns question numbers sequentially per module
    """
    from app.models.test import Test, TestModule as TM, Passage

    # Verify job
    job_result = await db.execute(
        select(OCRJob).where(OCRJob.id == job_id).where(OCRJob.user_id == user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Get approved questions to import
    # IMPORTANT: Order by page number, then by id within the page
    # This ensures questions from skipped pages (processed later with higher IDs)
    # are still placed in the correct position based on their page in the PDF
    query = (
        select(ExtractedQuestion)
        .join(OCRJobPage, ExtractedQuestion.source_page_id == OCRJobPage.id)
        .where(ExtractedQuestion.job_id == job_id)
        .where(ExtractedQuestion.review_status == QuestionReviewStatus.APPROVED)
        .where(ExtractedQuestion.imported_question_id.is_(None))
        .order_by(OCRJobPage.page_number, ExtractedQuestion.id)
    )

    if data.question_ids:
        query = query.where(ExtractedQuestion.id.in_(data.question_ids))

    result = await db.execute(query.options(selectinload(ExtractedQuestion.source_page)))
    extracted_questions = list(result.scalars().all())

    if not extracted_questions:
        raise HTTPException(status_code=400, detail="No approved questions to import")

    # Map test_type to enum
    test_type_map = {
        "full_test": TestType.FULL_TEST,
        "section_test": TestType.SECTION_TEST,
        "module_test": TestType.MODULE_TEST,
    }
    test_type = test_type_map.get(data.test_config.test_type, TestType.FULL_TEST)

    # Map section to enum if provided
    section = None
    if data.test_config.section:
        section_map = {
            "reading_writing": SATSection.READING_WRITING,
            "math": SATSection.MATH,
        }
        section = section_map.get(data.test_config.section)

    # Create Test
    test = Test(
        title=data.test_config.test_title,
        test_type=test_type,
        section=section,
        is_published=data.test_config.is_published,
        is_premium=data.test_config.is_premium,
    )
    db.add(test)
    await db.flush()

    # Create modules and track which questions go to which module
    module_map = {}  # (section, module, difficulty) -> TestModule
    modules_created = 0
    questions_imported = 0
    errors = []

    for mod_config in data.test_config.modules:
        # Map enums
        section_enum_map = {
            "reading_writing": SATSection.READING_WRITING,
            "math": SATSection.MATH,
        }
        module_enum_map = {
            "module_1": SATModule.MODULE_1,
            "module_2": SATModule.MODULE_2,
        }
        difficulty_enum_map = {
            "standard": ModuleDifficulty.STANDARD,
            "easier": ModuleDifficulty.EASIER,
            "harder": ModuleDifficulty.HARDER,
        }

        mod_section = section_enum_map.get(mod_config.section, SATSection.MATH)
        mod_module = module_enum_map.get(mod_config.module, SATModule.MODULE_1)
        mod_difficulty = difficulty_enum_map.get(mod_config.difficulty, ModuleDifficulty.STANDARD)

        # Create TestModule
        test_module = TM(
            test_id=test.id,
            section=mod_section,
            module=mod_module,
            difficulty=mod_difficulty,
            time_limit_minutes=mod_config.time_limit_minutes,
            order_index=modules_created,
        )
        db.add(test_module)
        await db.flush()

        module_map[(mod_config.question_start, mod_config.question_end)] = test_module
        modules_created += 1

    # Import questions to their respective modules
    for idx, eq in enumerate(extracted_questions, start=1):
        # Find which module this question belongs to
        target_module = None
        question_number_in_module = 1

        for (q_start, q_end), module in module_map.items():
            if q_start <= idx <= q_end:
                target_module = module
                question_number_in_module = idx - q_start + 1
                break

        if not target_module:
            # Assign to first module if no range match
            if module_map:
                target_module = list(module_map.values())[0]
                question_number_in_module = idx

        if not target_module:
            errors.append(f"Question {eq.id}: No target module found")
            continue

        try:
            # Create Passage if needed
            passage_id = None
            if eq.passage_text:
                passage = Passage(
                    content=eq.passage_text,
                    title=None,
                    word_count=len(eq.passage_text.split()) if eq.passage_text else None,
                )
                db.add(passage)
                await db.flush()
                passage_id = passage.id

            # Create Question
            question = Question(
                module_id=target_module.id,
                question_number=question_number_in_module,
                question_text=eq.question_text,
                question_type=eq.question_type,
                question_image_url=eq.question_image_url,
                passage_id=passage_id,
                options=eq.options,
                correct_answer=eq.correct_answer or [],
                explanation=eq.explanation,
                difficulty=eq.difficulty,
                domain=eq.domain,
                skill_tags=eq.skill_tags,
                table_data=eq.table_data,
            )
            db.add(question)
            await db.flush()

            # Link back
            eq.imported_question_id = question.id
            eq.review_status = QuestionReviewStatus.IMPORTED

            questions_imported += 1

        except Exception as e:
            errors.append(f"Question {eq.id}: {str(e)}")

    # Update job
    job.imported_questions += questions_imported
    job.status = OCRJobStatus.COMPLETED
    job.test_configs = [data.test_config.model_dump()]
    job.created_test_ids = [test.id]

    await db.commit()

    return ImportWithTestResponse(
        test_id=test.id,
        test_title=test.title,
        modules_created=modules_created,
        questions_imported=questions_imported,
        errors=errors,
    )


@router.post("/jobs/{job_id}/configure-test", response_model=TestConfigResponse)
async def configure_test(
    job_id: int,
    data: TestConfigRequest,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Save test configuration for a job without importing yet.

    Allows reviewing the configuration before actual import.
    """
    # Verify job
    job_result = await db.execute(
        select(OCRJob).where(OCRJob.id == job_id).where(OCRJob.user_id == user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Count questions in the configured range
    total_questions = 0
    for mod in data.modules:
        total_questions += mod.question_end - mod.question_start + 1

    # Save configuration
    job.test_configs = [data.model_dump()]
    await db.commit()

    return TestConfigResponse(
        job_id=job_id,
        test_config=data.model_dump(),
        estimated_questions=total_questions,
    )


# ===== Image Cropping Endpoints =====


@router.get("/jobs/{job_id}/pages/{page_number}/image")
async def get_page_image(
    job_id: int,
    page_number: int,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
    scale: float = Query(2.0, ge=0.5, le=4.0),
):
    """
    Render a PDF page as a JPEG image for cropping.

    Returns high-resolution page image for the crop tool.
    Scale 2.0 provides good quality for cropping graphs/charts.
    """
    # Verify job ownership
    job_result = await db.execute(
        select(OCRJob)
        .where(OCRJob.id == job_id)
        .where(OCRJob.user_id == user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Get PDF path
    pdf_path = Path(job.pdf_s3_key)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found")

    # Validate page number
    if page_number < 1 or page_number > job.total_pages:
        raise HTTPException(
            status_code=400,
            detail=f"Page number must be between 1 and {job.total_pages}"
        )

    try:
        import fitz  # PyMuPDF

        doc = fitz.open(str(pdf_path))
        page = doc[page_number - 1]  # 0-indexed

        # Render at specified scale
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, alpha=False)

        # Convert to JPEG
        img_bytes = pix.tobytes("jpeg")
        doc.close()

        return Response(
            content=img_bytes,
            media_type="image/jpeg",
            headers={
                "Cache-Control": "private, max-age=3600",
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to render page: {str(e)}")


class ImageUploadResponse(BaseSchema):
    """Response after uploading an image."""
    question_id: int
    question_image_url: str
    needs_image: bool
    image_extraction_status: str


@router.post("/questions/{question_id}/upload-image", response_model=ImageUploadResponse)
async def upload_question_image(
    question_id: int,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    """
    Upload a cropped image for a question.

    Accepts JPEG/PNG image, saves to storage, and updates
    the question with the image URL.
    """
    # Verify question ownership
    result = await db.execute(
        select(ExtractedQuestion)
        .join(OCRJob, ExtractedQuestion.job_id == OCRJob.id)
        .where(ExtractedQuestion.id == question_id)
        .where(OCRJob.user_id == user.id)
    )
    question = result.scalar_one_or_none()

    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    # Read and validate file size (max 5MB)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 5MB)")

    # Generate unique filename
    import uuid
    ext = file.filename.split(".")[-1] if file.filename and "." in file.filename else "jpg"
    filename = f"ocr_q_{question_id}_{uuid.uuid4().hex[:8]}.{ext}"

    # Save to local storage (or S3 in production)
    upload_dir = Path(settings.ocr_upload_dir) / "question_images"
    upload_dir.mkdir(parents=True, exist_ok=True)
    image_path = upload_dir / filename

    with open(image_path, "wb") as f:
        f.write(content)

    # Generate URL (local for dev, S3 URL in production)
    # For now, we'll use a relative path that the frontend can construct
    image_url = f"/static/ocr/question_images/{filename}"

    # Update question
    question.question_image_url = image_url
    question.question_image_s3_key = str(image_path)
    question.needs_image = False
    question.image_extraction_status = "manual"

    await db.commit()

    return ImageUploadResponse(
        question_id=question.id,
        question_image_url=image_url,
        needs_image=False,
        image_extraction_status="manual",
    )


# ===== WebSocket for Real-time Progress =====


@router.websocket("/jobs/{job_id}/ws")
async def job_progress_websocket(
    websocket: WebSocket,
    job_id: int,
):
    """
    WebSocket endpoint for real-time job progress updates.

    Sends JSON messages:
    {
        "type": "progress",
        "data": {
            "processed_pages": 5,
            "total_pages": 100,
            "percent": 5.0,
            "extracted_questions": 3,
            "status": "processing"
        }
    }
    """
    await websocket.accept()

    try:
        # Simple polling implementation
        # TODO: Replace with Redis pub/sub for better scalability
        import asyncio

        while True:
            async with async_session_maker() as db:
                result = await db.execute(
                    select(OCRJob).where(OCRJob.id == job_id)
                )
                job = result.scalar_one_or_none()

                if not job:
                    await websocket.send_json({
                        "type": "error",
                        "data": {"message": "Job not found"},
                    })
                    break

                await websocket.send_json({
                    "type": "progress",
                    "data": {
                        "processed_pages": job.processed_pages,
                        "total_pages": job.total_pages,
                        "percent": job.progress_percent,
                        "question_pages": job.question_pages,
                        "skipped_pages": job.skipped_pages,
                        "extracted_questions": job.extracted_questions,
                        "status": job.status.value,
                        "error_message": job.error_message,
                    },
                })

                # Stop if job is complete
                if job.status in [
                    OCRJobStatus.REVIEW,
                    OCRJobStatus.COMPLETED,
                    OCRJobStatus.FAILED,
                    OCRJobStatus.CANCELLED,
                ]:
                    await websocket.send_json({
                        "type": "complete",
                        "data": {"status": job.status.value},
                    })
                    break

            await asyncio.sleep(2)  # Poll every 2 seconds

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({
                "type": "error",
                "data": {"message": str(e)},
            })
        except Exception:
            pass


# Import async_session_maker for WebSocket
from app.core.database import async_session_maker


# ===== Passage Endpoints =====


@router.get("/jobs/{job_id}/passages", response_model=ExtractedPassageListResponse)
async def list_job_passages(
    job_id: int,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: QuestionReviewStatus | None = None,
):
    """List extracted passages for a job."""
    # Verify job ownership
    job_result = await db.execute(
        select(OCRJob)
        .where(OCRJob.id == job_id)
        .where(OCRJob.user_id == user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    query = (
        select(ExtractedPassage)
        .where(ExtractedPassage.job_id == job_id)
    )

    if status:
        query = query.where(ExtractedPassage.review_status == status)

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    query = query.order_by(ExtractedPassage.id)
    query = query.offset((page - 1) * page_size).limit(page_size)

    # Execute with eager loading for source_page and questions
    result = await db.execute(
        query.options(
            selectinload(ExtractedPassage.source_page),
            selectinload(ExtractedPassage.questions),
        )
    )
    passages = result.scalars().all()

    return ExtractedPassageListResponse(
        items=[
            ExtractedPassageResponse(
                id=p.id,
                job_id=p.job_id,
                source_page_number=p.source_page.page_number if p.source_page else None,
                title=p.title,
                content=p.content,
                source=p.source,
                author=p.author,
                word_count=p.word_count,
                figures=p.figures,
                genre=p.genre,
                topic_tags=p.topic_tags,
                review_status=p.review_status,
                extraction_confidence=p.extraction_confidence,
                linked_questions_count=len(p.questions),
                created_at=p.created_at,
            )
            for p in passages
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.get("/passages/{passage_id}", response_model=ExtractedPassageResponse)
async def get_passage(
    passage_id: int,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get extracted passage details."""
    result = await db.execute(
        select(ExtractedPassage)
        .join(OCRJob, ExtractedPassage.job_id == OCRJob.id)
        .where(ExtractedPassage.id == passage_id)
        .where(OCRJob.user_id == user.id)
        .options(
            selectinload(ExtractedPassage.source_page),
            selectinload(ExtractedPassage.questions),
        )
    )
    passage = result.scalar_one_or_none()

    if not passage:
        raise HTTPException(status_code=404, detail="Passage not found")

    return ExtractedPassageResponse(
        id=passage.id,
        job_id=passage.job_id,
        source_page_number=passage.source_page.page_number if passage.source_page else None,
        title=passage.title,
        content=passage.content,
        source=passage.source,
        author=passage.author,
        word_count=passage.word_count,
        figures=passage.figures,
        genre=passage.genre,
        topic_tags=passage.topic_tags,
        review_status=passage.review_status,
        extraction_confidence=passage.extraction_confidence,
        linked_questions_count=len(passage.questions),
        created_at=passage.created_at,
    )


@router.put("/passages/{passage_id}", response_model=ExtractedPassageResponse)
async def update_passage(
    passage_id: int,
    data: PassageReviewUpdate,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update an extracted passage (review/edit)."""
    result = await db.execute(
        select(ExtractedPassage)
        .join(OCRJob, ExtractedPassage.job_id == OCRJob.id)
        .where(ExtractedPassage.id == passage_id)
        .where(OCRJob.user_id == user.id)
        .options(
            selectinload(ExtractedPassage.source_page),
            selectinload(ExtractedPassage.questions),
        )
    )
    passage = result.scalar_one_or_none()

    if not passage:
        raise HTTPException(status_code=404, detail="Passage not found")

    # Update fields
    if data.title is not None:
        passage.title = data.title
    if data.content is not None:
        passage.content = data.content
        passage.word_count = len(data.content.split())
    if data.source is not None:
        passage.source = data.source
    if data.author is not None:
        passage.author = data.author
    if data.genre is not None:
        passage.genre = data.genre
    if data.topic_tags is not None:
        passage.topic_tags = data.topic_tags
    if data.review_status is not None:
        passage.review_status = data.review_status

    await db.commit()
    await db.refresh(passage)

    return ExtractedPassageResponse(
        id=passage.id,
        job_id=passage.job_id,
        source_page_number=passage.source_page.page_number if passage.source_page else None,
        title=passage.title,
        content=passage.content,
        source=passage.source,
        author=passage.author,
        word_count=passage.word_count,
        figures=passage.figures,
        genre=passage.genre,
        topic_tags=passage.topic_tags,
        review_status=passage.review_status,
        extraction_confidence=passage.extraction_confidence,
        linked_questions_count=len(passage.questions),
        created_at=passage.created_at,
    )


# ===== Phase 6: Error Handling Endpoints =====


@router.get("/jobs/{job_id}/failed-pages", response_model=FailedPagesResponse)
async def list_failed_pages(
    job_id: int,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    List all failed pages for a job.

    Returns pages that have errors or failed to process,
    along with error details and retry count.
    """
    # Verify job ownership
    job_result = await db.execute(
        select(OCRJob)
        .where(OCRJob.id == job_id)
        .where(OCRJob.user_id == user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Get failed pages (pages with errors or not completed)
    result = await db.execute(
        select(OCRJobPage)
        .where(OCRJobPage.job_id == job_id)
        .where(
            (OCRJobPage.error_message.isnot(None)) |
            ((OCRJobPage.ocr_completed == False) & (OCRJobPage.retry_count > 0))
        )
        .order_by(OCRJobPage.page_number)
    )
    failed_pages = result.scalars().all()

    return FailedPagesResponse(
        job_id=job_id,
        failed_count=len(failed_pages),
        pages=[
            FailedPageInfo(
                page_number=p.page_number,
                error_message=p.error_message,
                retry_count=p.retry_count,
                last_error_at=p.last_error_at,
                provider_used=p.provider_used,
            )
            for p in failed_pages
        ],
    )


@router.post("/jobs/{job_id}/retry-failed", response_model=RetryFailedResponse)
async def retry_failed_pages_endpoint(
    job_id: int,
    data: RetryFailedRequest,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Retry processing for failed pages.

    Optionally specify which pages to retry and whether to use
    the quality provider (DeepInfra) instead of default.
    """
    # Verify job ownership
    job_result = await db.execute(
        select(OCRJob)
        .where(OCRJob.id == job_id)
        .where(OCRJob.user_id == user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Job must be in a state that allows retry
    if job.status not in [OCRJobStatus.REVIEW, OCRJobStatus.FAILED]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot retry pages for job with status: {job.status.value}"
        )

    # Get pages to retry
    query = (
        select(OCRJobPage)
        .where(OCRJobPage.job_id == job_id)
        .where(
            (OCRJobPage.error_message.isnot(None)) |
            (OCRJobPage.ocr_completed == False)
        )
    )

    if data.page_numbers:
        query = query.where(OCRJobPage.page_number.in_(data.page_numbers))

    result = await db.execute(query)
    pages_to_retry = result.scalars().all()

    if not pages_to_retry:
        raise HTTPException(status_code=400, detail="No failed pages to retry")

    page_numbers = [p.page_number for p in pages_to_retry]

    # Clear error messages for retrying pages
    await db.execute(
        update(OCRJobPage)
        .where(OCRJobPage.job_id == job_id)
        .where(OCRJobPage.page_number.in_(page_numbers))
        .values(error_message=None)
    )

    # Update job status to processing
    job.status = OCRJobStatus.PROCESSING
    await db.commit()

    # Dispatch retry task
    provider = "deepinfra" if data.use_quality_provider else None
    task = retry_failed_pages.delay(job_id, page_numbers, provider)

    return RetryFailedResponse(
        job_id=job_id,
        retrying_pages=len(page_numbers),
        celery_task_id=task.id,
    )


class ReextractPageRequest(BaseSchema):
    """Request to re-extract a page with quality provider."""

    page_number: int
    use_quality_provider: bool = True


class ReextractPageResponse(BaseSchema):
    """Response for page re-extraction."""

    job_id: int
    page_number: int
    celery_task_id: str
    provider: str


@router.post("/jobs/{job_id}/reextract-page", response_model=ReextractPageResponse)
async def reextract_page_endpoint(
    job_id: int,
    data: ReextractPageRequest,
    user: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Re-extract a specific page with the quality provider.

    Use this when a page was processed successfully but the extraction
    quality is poor and you want to retry with a better model.
    This will delete existing questions from that page and re-extract.
    """
    # Verify job ownership
    job_result = await db.execute(
        select(OCRJob)
        .where(OCRJob.id == job_id)
        .where(OCRJob.user_id == user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Job must be in review state
    if job.status != OCRJobStatus.REVIEW:
        raise HTTPException(
            status_code=400,
            detail=f"Can only re-extract pages for jobs in review state, current: {job.status.value}"
        )

    # Verify page exists
    page_result = await db.execute(
        select(OCRJobPage)
        .where(OCRJobPage.job_id == job_id)
        .where(OCRJobPage.page_number == data.page_number)
    )
    page = page_result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail=f"Page {data.page_number} not found")

    # Mark page for re-processing
    page.ocr_completed = False
    page.structuring_completed = False
    page.error_message = None
    page.retry_count += 1

    # Delete existing questions from this page (they'll be re-extracted)
    from sqlalchemy import delete
    await db.execute(
        delete(ExtractedQuestion)
        .where(ExtractedQuestion.job_id == job_id)
        .where(ExtractedQuestion.source_page_id == page.id)
    )

    # Delete existing passages from this page
    await db.execute(
        delete(ExtractedPassage)
        .where(ExtractedPassage.job_id == job_id)
        .where(ExtractedPassage.source_page_id == page.id)
    )

    # Update job status to processing
    job.status = OCRJobStatus.PROCESSING
    await db.commit()

    # Always use DeepInfra olmOCR for re-extraction (best for math/formulas)
    # olmOCR is specifically trained for document OCR and handles math better
    provider = "deepinfra"
    task = retry_failed_pages.delay(job_id, [data.page_number], provider)

    return ReextractPageResponse(
        job_id=job_id,
        page_number=data.page_number,
        celery_task_id=task.id,
        provider=provider,
    )
