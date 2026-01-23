"""OCR Processing Models for PDF-to-Test Import Pipeline."""

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    LargeBinary,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import (
    OCRJobStatus,
    OCRProvider,
    QuestionReviewStatus,
    QuestionDomain,
    QuestionDifficulty,
    QuestionType,
)

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.test import TestModule, Passage


class OCRJob(Base, TimestampMixin):
    """
    Represents a PDF processing job.

    Tracks the overall progress of converting a PDF into structured questions.
    Supports checkpoint/resume through page-level tracking.
    """

    __tablename__ = "ocr_jobs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Who initiated the job
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Target module for import (optional until import step)
    target_module_id: Mapped[int | None] = mapped_column(
        ForeignKey("test_modules.id", ondelete="SET NULL"), index=True
    )

    # Job status
    status: Mapped[OCRJobStatus] = mapped_column(
        Enum(OCRJobStatus, values_callable=lambda x: [e.value for e in x]),
        default=OCRJobStatus.PENDING, nullable=False
    )

    # PDF file info
    pdf_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    pdf_s3_key: Mapped[str] = mapped_column(String(500), nullable=False)
    pdf_hash: Mapped[str] = mapped_column(String(64), index=True)  # MD5 for dedup
    total_pages: Mapped[int] = mapped_column(Integer, nullable=False)

    # Processing progress
    processed_pages: Mapped[int] = mapped_column(Integer, default=0)
    question_pages: Mapped[int] = mapped_column(Integer, default=0)  # Pages with questions
    skipped_pages: Mapped[int] = mapped_column(Integer, default=0)  # Non-question pages

    # Extracted counts
    extracted_questions: Mapped[int] = mapped_column(Integer, default=0)
    approved_questions: Mapped[int] = mapped_column(Integer, default=0)
    imported_questions: Mapped[int] = mapped_column(Integer, default=0)

    # Provider configuration
    ocr_provider: Mapped[OCRProvider] = mapped_column(
        Enum(OCRProvider, values_callable=lambda x: [e.value for e in x]),
        default=OCRProvider.HYBRID
    )

    # Cost tracking (in USD cents)
    estimated_cost_cents: Mapped[int] = mapped_column(Integer, default=0)
    actual_cost_cents: Mapped[int] = mapped_column(Integer, default=0)

    # Timing
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Error tracking
    error_message: Mapped[str | None] = mapped_column(Text)
    last_error_page: Mapped[int | None] = mapped_column(Integer)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)

    # Celery task tracking
    celery_task_id: Mapped[str | None] = mapped_column(String(255), index=True)

    # Test configuration for import
    # Format: [{"test_title": "...", "test_type": "full_test|section_test|module_test",
    #           "section": "reading_writing|math|null", "modules": [...]}]
    test_configs: Mapped[list[dict] | None] = mapped_column(JSON)

    # IDs of tests created from this job
    created_test_ids: Mapped[list[int] | None] = mapped_column(JSON)

    # Phase 6: Processing mode and error tracking
    # Values: 'speed' (gpt-4o-mini only), 'quality' (olmOCR only), 'balanced' (fallback)
    processing_mode: Mapped[str] = mapped_column(String(20), default="balanced")
    failed_pages_count: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="ocr_jobs")
    target_module: Mapped["TestModule | None"] = relationship("TestModule")
    pages: Mapped[list["OCRJobPage"]] = relationship(
        "OCRJobPage", back_populates="job", cascade="all, delete-orphan",
        order_by="OCRJobPage.page_number"
    )
    questions: Mapped[list["ExtractedQuestion"]] = relationship(
        "ExtractedQuestion", back_populates="job", cascade="all, delete-orphan"
    )
    passages: Mapped[list["ExtractedPassage"]] = relationship(
        "ExtractedPassage", back_populates="job", cascade="all, delete-orphan"
    )

    @property
    def progress_percent(self) -> float:
        """Calculate processing progress as percentage."""
        if self.total_pages == 0:
            return 0.0
        return round((self.processed_pages / self.total_pages) * 100, 1)

    @property
    def duration_seconds(self) -> int | None:
        """Calculate processing duration."""
        if not self.started_at:
            return None
        end = self.completed_at or datetime.now(UTC)
        return int((end - self.started_at).total_seconds())


class OCRJobPage(Base, TimestampMixin):
    """
    Per-page OCR results.

    Stores intermediate results for checkpoint/resume functionality.
    Allows reprocessing individual pages without redoing the entire PDF.
    """

    __tablename__ = "ocr_job_pages"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(
        ForeignKey("ocr_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Page info
    page_number: Mapped[int] = mapped_column(Integer, nullable=False)

    # OCR output
    ocr_markdown: Mapped[str | None] = mapped_column(Text)

    # Classification
    is_question_page: Mapped[bool] = mapped_column(Boolean, default=False)

    # Detected figures (graphs, charts, diagrams)
    # Format: [{"label": "parabola graph", "bbox": [y_min, x_min, y_max, x_max], "s3_key": "..."}]
    detected_figures: Mapped[list[dict] | None] = mapped_column(JSON)

    # Page image S3 key (high-res for figure cropping)
    page_image_s3_key: Mapped[str | None] = mapped_column(String(500))

    # Page image data (JPEG bytes stored directly in database)
    page_image_data: Mapped[bytes | None] = mapped_column(LargeBinary)

    # Processing status
    ocr_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    structuring_completed: Mapped[bool] = mapped_column(Boolean, default=False)

    # Cost tracking for this page
    ocr_cost_cents: Mapped[int] = mapped_column(Integer, default=0)
    structuring_cost_cents: Mapped[int] = mapped_column(Integer, default=0)

    # Error handling
    error_message: Mapped[str | None] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)

    # Phase 6: Enhanced error tracking
    last_error_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    provider_used: Mapped[str | None] = mapped_column(String(50))

    # Relationships
    job: Mapped["OCRJob"] = relationship("OCRJob", back_populates="pages")
    questions: Mapped[list["ExtractedQuestion"]] = relationship(
        "ExtractedQuestion", back_populates="source_page", cascade="all, delete-orphan"
    )
    passages: Mapped[list["ExtractedPassage"]] = relationship(
        "ExtractedPassage", back_populates="source_page"
    )


class ExtractedQuestion(Base, TimestampMixin):
    """
    Extracted question pending review and import.

    Mirrors the Question model structure but with additional fields
    for review workflow and provenance tracking.
    """

    __tablename__ = "extracted_questions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(
        ForeignKey("ocr_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_page_id: Mapped[int] = mapped_column(
        ForeignKey("ocr_job_pages.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Review status
    review_status: Mapped[QuestionReviewStatus] = mapped_column(
        Enum(QuestionReviewStatus, values_callable=lambda x: [e.value for e in x]),
        default=QuestionReviewStatus.PENDING
    )
    reviewed_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Confidence scoring (0.0 - 1.0)
    extraction_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    answer_confidence: Mapped[float] = mapped_column(Float, default=0.0)

    # ===== Question Fields (matches Question model) =====

    # Question content
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[QuestionType] = mapped_column(
        Enum(QuestionType),  # Uses UPPERCASE names to match existing DB enum
        default=QuestionType.MULTIPLE_CHOICE
    )

    # Image support
    question_image_s3_key: Mapped[str | None] = mapped_column(String(500))
    question_image_url: Mapped[str | None] = mapped_column(String(500))

    # Passage for EBRW questions
    passage_text: Mapped[str | None] = mapped_column(Text)

    # Chart/table data (extracted from OCR)
    chart_title: Mapped[str | None] = mapped_column(String(255))
    chart_data: Mapped[str | None] = mapped_column(Text)  # HTML table from OCR (legacy)

    # Structured table data (new format)
    # Format: {"headers": ["Col1", "Col2"], "rows": [["val1", "val2"]], "title": "..."}
    table_data: Mapped[dict | None] = mapped_column(JSON)

    # Options: [{"id": "A", "text": "...", "image_url": null}, ...]
    options: Mapped[list[dict] | None] = mapped_column(JSON)

    # Correct answer(s)
    correct_answer: Mapped[list[str] | None] = mapped_column(JSON)
    needs_answer: Mapped[bool] = mapped_column(Boolean, default=False)  # Model couldn't determine

    # Explanation
    explanation: Mapped[str | None] = mapped_column(Text)

    # Metadata (UPPERCASE names to match existing DB enums)
    difficulty: Mapped[QuestionDifficulty | None] = mapped_column(Enum(QuestionDifficulty))
    domain: Mapped[QuestionDomain | None] = mapped_column(Enum(QuestionDomain))
    skill_tags: Mapped[list[str] | None] = mapped_column(JSON)

    # Flag for images that need manual review
    needs_image: Mapped[bool] = mapped_column(Boolean, default=False)
    image_extraction_status: Mapped[str | None] = mapped_column(String(50))  # success, failed, manual

    # Validation errors from schema check
    validation_errors: Mapped[list[str] | None] = mapped_column(JSON)

    # Reference to imported question (after successful import)
    imported_question_id: Mapped[int | None] = mapped_column(
        ForeignKey("questions.id", ondelete="SET NULL"), index=True
    )

    # Link to extracted passage (for EBRW questions)
    extracted_passage_id: Mapped[int | None] = mapped_column(
        ForeignKey("extracted_passages.id", ondelete="SET NULL"), index=True
    )

    # Relationships
    job: Mapped["OCRJob"] = relationship("OCRJob", back_populates="questions")
    source_page: Mapped["OCRJobPage"] = relationship("OCRJobPage", back_populates="questions")
    reviewed_by: Mapped["User | None"] = relationship("User", foreign_keys=[reviewed_by_id])
    extracted_passage: Mapped["ExtractedPassage | None"] = relationship(
        "ExtractedPassage", back_populates="questions"
    )

    @property
    def overall_confidence(self) -> float:
        """Combined confidence score."""
        if self.needs_answer:
            return self.extraction_confidence * 0.5  # Penalize missing answers
        return (self.extraction_confidence + self.answer_confidence) / 2

    @property
    def is_ready_for_import(self) -> bool:
        """Check if question is ready for import."""
        return (
            self.review_status == QuestionReviewStatus.APPROVED
            and self.correct_answer is not None
            and not self.needs_answer
            and not self.validation_errors
        )


class ExtractedPassage(Base, TimestampMixin):
    """
    Extracted passage pending review and import.

    Passages are extracted separately from questions for EBRW sections.
    Multiple questions can reference the same passage.
    """

    __tablename__ = "extracted_passages"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(
        ForeignKey("ocr_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_page_id: Mapped[int | None] = mapped_column(
        ForeignKey("ocr_job_pages.id", ondelete="SET NULL"), index=True
    )

    # Content
    title: Mapped[str | None] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str | None] = mapped_column(String(255))  # Publication source
    author: Mapped[str | None] = mapped_column(String(255))
    word_count: Mapped[int | None] = mapped_column(Integer)

    # Figures/Images associated with passage
    # Format: [{"s3_key": "...", "url": "...", "alt": "...", "caption": "..."}]
    figures: Mapped[list[dict] | None] = mapped_column(JSON)

    # Classification
    genre: Mapped[str | None] = mapped_column(String(100))
    topic_tags: Mapped[list[str] | None] = mapped_column(JSON)

    # Review status
    review_status: Mapped[QuestionReviewStatus] = mapped_column(
        Enum(QuestionReviewStatus, values_callable=lambda x: [e.value for e in x]),
        default=QuestionReviewStatus.PENDING
    )
    extraction_confidence: Mapped[float] = mapped_column(Float, default=0.0)

    # Reference to imported passage (after successful import)
    imported_passage_id: Mapped[int | None] = mapped_column(
        ForeignKey("passages.id", ondelete="SET NULL"), index=True
    )

    # Relationships
    job: Mapped["OCRJob"] = relationship("OCRJob", back_populates="passages")
    source_page: Mapped["OCRJobPage | None"] = relationship(
        "OCRJobPage", back_populates="passages"
    )
    questions: Mapped[list["ExtractedQuestion"]] = relationship(
        "ExtractedQuestion", back_populates="extracted_passage"
    )
    imported_passage: Mapped["Passage | None"] = relationship("Passage")

    @property
    def is_ready_for_import(self) -> bool:
        """Check if passage is ready for import."""
        return (
            self.review_status == QuestionReviewStatus.APPROVED
            and self.content
            and len(self.content.strip()) > 0
        )
