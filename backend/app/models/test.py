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
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import (
    AttemptStatus,
    ModuleDifficulty,
    QuestionDifficulty,
    QuestionDomain,
    QuestionType,
    SATModule,
    SATSection,
    TestType,
)

if TYPE_CHECKING:
    from app.models.user import User


class Test(Base, TimestampMixin):
    """
    Represents a complete test or practice set.
    A full SAT test contains multiple TestModules.
    """

    __tablename__ = "tests"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    test_type: Mapped[TestType] = mapped_column(Enum(TestType), nullable=False)

    # For section/module tests, specify which section
    section: Mapped[SATSection | None] = mapped_column(Enum(SATSection))

    # Total time for the entire test in minutes
    time_limit_minutes: Mapped[int | None] = mapped_column(Integer)

    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Ordering for display
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    modules: Mapped[list["TestModule"]] = relationship(
        "TestModule", back_populates="test", cascade="all, delete-orphan"
    )
    attempts: Mapped[list["TestAttempt"]] = relationship(
        "TestAttempt", back_populates="test", cascade="all, delete-orphan"
    )


class TestModule(Base, TimestampMixin):
    """
    Represents a module within a test.
    SAT has 2 modules per section, with adaptive difficulty for module 2.
    """

    __tablename__ = "test_modules"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    test_id: Mapped[int] = mapped_column(
        ForeignKey("tests.id", ondelete="CASCADE"), nullable=False, index=True
    )

    section: Mapped[SATSection] = mapped_column(Enum(SATSection), nullable=False)
    module: Mapped[SATModule] = mapped_column(Enum(SATModule), nullable=False)

    # For Module 2 adaptive versions
    difficulty: Mapped[ModuleDifficulty] = mapped_column(
        Enum(ModuleDifficulty), default=ModuleDifficulty.STANDARD
    )

    # Time limit for this specific module
    time_limit_minutes: Mapped[int] = mapped_column(Integer, nullable=False)

    # Module order within the test
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    test: Mapped["Test"] = relationship("Test", back_populates="modules")
    questions: Mapped[list["Question"]] = relationship(
        "Question",
        back_populates="module",
        cascade="all, delete-orphan",
        order_by="Question.question_number",
    )

    __table_args__ = (
        UniqueConstraint(
            "test_id", "section", "module", "difficulty", name="uq_test_module_section_difficulty"
        ),
    )


class Question(Base, TimestampMixin):
    """
    Individual question with support for images in both question and options.

    SAT Reading/Writing: Passage-based questions with 4 options
    SAT Math: Multiple choice (4 options) or Student-Produced Response (grid-in)
    """

    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    module_id: Mapped[int] = mapped_column(
        ForeignKey("test_modules.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Question ordering within module
    question_number: Mapped[int] = mapped_column(Integer, nullable=False)

    # Question content
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[QuestionType] = mapped_column(Enum(QuestionType), nullable=False)

    # Image support for question stem
    question_image_url: Mapped[str | None] = mapped_column(String(500))
    question_image_alt: Mapped[str | None] = mapped_column(String(255))

    # For reading/writing questions - the passage
    passage_id: Mapped[int | None] = mapped_column(
        ForeignKey("passages.id", ondelete="SET NULL"), index=True
    )

    # Options stored as JSONB array for flexibility
    # Format: [{"id": "A", "text": "...", "image_url": null, "image_alt": null}, ...]
    options: Mapped[list[dict] | None] = mapped_column(JSON)

    # Correct answer(s)
    # For MCQ: "A", "B", "C", or "D"
    # For grid-in: can have multiple acceptable formats, e.g., ["1/2", "0.5", ".5"]
    correct_answer: Mapped[list[str]] = mapped_column(JSON, nullable=False)

    # Explanation (shown after answering)
    explanation: Mapped[str | None] = mapped_column(Text)
    explanation_image_url: Mapped[str | None] = mapped_column(String(500))

    # Metadata
    difficulty: Mapped[QuestionDifficulty] = mapped_column(
        Enum(QuestionDifficulty), default=QuestionDifficulty.MEDIUM
    )
    domain: Mapped[QuestionDomain | None] = mapped_column(Enum(QuestionDomain))

    # Skill tags for analytics (e.g., ["linear-equations", "word-problems"])
    skill_tags: Mapped[list[str] | None] = mapped_column(JSON)

    # For grid-in: constraints
    # e.g., {"min": -9999, "max": 9999, "allow_fraction": true, "allow_decimal": true}
    answer_constraints: Mapped[dict | None] = mapped_column(JSON)

    # Statistics (updated periodically)
    times_answered: Mapped[int] = mapped_column(Integer, default=0)
    times_correct: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    module: Mapped["TestModule"] = relationship("TestModule", back_populates="questions")
    passage: Mapped["Passage | None"] = relationship("Passage", back_populates="questions")

    __table_args__ = (
        UniqueConstraint("module_id", "question_number", name="uq_module_question_number"),
    )


class Passage(Base, TimestampMixin):
    """
    Reading passages for Reading/Writing section.
    Multiple questions can reference the same passage.
    """

    __tablename__ = "passages"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str | None] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Source attribution
    source: Mapped[str | None] = mapped_column(String(255))
    author: Mapped[str | None] = mapped_column(String(255))

    # Word count for reference
    word_count: Mapped[int | None] = mapped_column(Integer)

    # Passage can have associated images/figures
    # Format: [{"url": "...", "alt": "...", "caption": "..."}]
    figures: Mapped[list[dict] | None] = mapped_column(JSON)

    # Categorization
    genre: Mapped[str | None] = mapped_column(String(100))  # e.g., "science", "literature"
    topic_tags: Mapped[list[str] | None] = mapped_column(JSON)

    # Relationships
    questions: Mapped[list["Question"]] = relationship("Question", back_populates="passage")


class TestAttempt(Base, TimestampMixin):
    """
    Records a student's attempt at a test.
    Tracks progress through modules and final scores.
    """

    __tablename__ = "test_attempts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    test_id: Mapped[int] = mapped_column(
        ForeignKey("tests.id", ondelete="CASCADE"), nullable=False, index=True
    )

    status: Mapped[AttemptStatus] = mapped_column(
        Enum(AttemptStatus), default=AttemptStatus.IN_PROGRESS, nullable=False
    )

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Current position in test
    current_module_id: Mapped[int | None] = mapped_column(
        ForeignKey("test_modules.id", ondelete="SET NULL")
    )
    current_question_number: Mapped[int] = mapped_column(Integer, default=1)

    # Time tracking per module
    # Format: {module_id: seconds_spent}
    time_spent_per_module: Mapped[dict[str, int] | None] = mapped_column(JSON)

    # Scores
    # Raw scores per section
    reading_writing_raw_score: Mapped[int | None] = mapped_column(Integer)
    math_raw_score: Mapped[int | None] = mapped_column(Integer)

    # Scaled scores (200-800)
    reading_writing_scaled_score: Mapped[int | None] = mapped_column(Integer)
    math_scaled_score: Mapped[int | None] = mapped_column(Integer)

    # Total score (400-1600)
    total_score: Mapped[int | None] = mapped_column(Integer)

    # Percentile
    percentile: Mapped[float | None] = mapped_column(Float)

    # Detailed breakdown by domain
    # Format: {"algebra": {"correct": 5, "total": 8}, ...}
    domain_breakdown: Mapped[dict | None] = mapped_column(JSON)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="test_attempts")
    test: Mapped["Test"] = relationship("Test", back_populates="attempts")
    answers: Mapped[list["AttemptAnswer"]] = relationship(
        "AttemptAnswer", back_populates="attempt", cascade="all, delete-orphan"
    )
    module_results: Mapped[list["ModuleResult"]] = relationship(
        "ModuleResult", back_populates="attempt", cascade="all, delete-orphan"
    )


class AttemptAnswer(Base, TimestampMixin):
    """
    Individual answer submitted during an attempt.
    Stored separately for detailed analytics.
    """

    __tablename__ = "attempt_answers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("test_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # The answer given
    answer: Mapped[str | None] = mapped_column(String(255))

    # Result
    is_correct: Mapped[bool | None] = mapped_column(Boolean)

    # Time spent on this question in seconds
    time_spent_seconds: Mapped[int | None] = mapped_column(Integer)

    # Was the question flagged for review?
    is_flagged: Mapped[bool] = mapped_column(Boolean, default=False)

    # Answer history (if changed)
    answer_history: Mapped[list[dict] | None] = mapped_column(JSON)

    # Relationships
    attempt: Mapped["TestAttempt"] = relationship("TestAttempt", back_populates="answers")

    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_attempt_question"),
    )


class ModuleResult(Base, TimestampMixin):
    """
    Results for each module within an attempt.
    Used for adaptive module selection.
    """

    __tablename__ = "module_results"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("test_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    module_id: Mapped[int] = mapped_column(
        ForeignKey("test_modules.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Score for this module
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    total_count: Mapped[int] = mapped_column(Integer, default=0)

    # Time tracking
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    time_spent_seconds: Mapped[int | None] = mapped_column(Integer)

    # For adaptive testing: what difficulty was assigned for next module
    next_module_difficulty: Mapped[ModuleDifficulty | None] = mapped_column(Enum(ModuleDifficulty))

    # Relationships
    attempt: Mapped["TestAttempt"] = relationship("TestAttempt", back_populates="module_results")

    __table_args__ = (UniqueConstraint("attempt_id", "module_id", name="uq_attempt_module"),)
