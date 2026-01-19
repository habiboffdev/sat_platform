from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import ContentType, QuestionDomain, SATSection

if TYPE_CHECKING:
    from app.models.user import User


class ContentCategory(Base, TimestampMixin):
    """Categories for organizing educational content."""

    __tablename__ = "content_categories"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    icon: Mapped[str | None] = mapped_column(String(100))

    section: Mapped[SATSection | None] = mapped_column(Enum(SATSection))
    domain: Mapped[QuestionDomain | None] = mapped_column(Enum(QuestionDomain))

    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("content_categories.id", ondelete="SET NULL"), index=True
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    parent: Mapped["ContentCategory | None"] = relationship(
        "ContentCategory", remote_side="ContentCategory.id", backref="children"
    )
    contents: Mapped[list["Content"]] = relationship("Content", back_populates="category")


class Content(Base, TimestampMixin):
    """Educational content: videos, articles, lessons."""

    __tablename__ = "contents"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)

    content_type: Mapped[ContentType] = mapped_column(Enum(ContentType), nullable=False)

    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("content_categories.id", ondelete="SET NULL"), index=True
    )

    # Content body (markdown or HTML)
    body: Mapped[str | None] = mapped_column(Text)

    # For video content
    video_url: Mapped[str | None] = mapped_column(String(500))
    video_duration_seconds: Mapped[int | None] = mapped_column(Integer)
    video_thumbnail_url: Mapped[str | None] = mapped_column(String(500))

    # Attached resources
    # Format: [{"title": "...", "url": "...", "type": "pdf"}]
    resources: Mapped[list[dict] | None] = mapped_column(JSON)

    # Metadata
    section: Mapped[SATSection | None] = mapped_column(Enum(SATSection))
    domain: Mapped[QuestionDomain | None] = mapped_column(Enum(QuestionDomain))
    skill_tags: Mapped[list[str] | None] = mapped_column(JSON)

    # Access control
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Ordering
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    # Estimated time to complete in minutes
    estimated_time_minutes: Mapped[int | None] = mapped_column(Integer)

    # Related questions for practice
    related_question_ids: Mapped[list[int] | None] = mapped_column(JSON)

    # Relationships
    category: Mapped["ContentCategory | None"] = relationship(
        "ContentCategory", back_populates="contents"
    )
    progress_records: Mapped[list["ContentProgress"]] = relationship(
        "ContentProgress", back_populates="content"
    )


class ContentProgress(Base, TimestampMixin):
    """Track user progress on educational content."""

    __tablename__ = "content_progress"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content_id: Mapped[int] = mapped_column(
        ForeignKey("contents.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Progress tracking
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # For video: track watch progress
    progress_percent: Mapped[int] = mapped_column(Integer, default=0)
    last_position_seconds: Mapped[int] = mapped_column(Integer, default=0)

    # Time spent on this content
    total_time_seconds: Mapped[int] = mapped_column(Integer, default=0)

    # Notes taken by user (optional feature)
    notes: Mapped[str | None] = mapped_column(Text)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="content_progress")
    content: Mapped["Content"] = relationship("Content", back_populates="progress_records")

    __table_args__ = (UniqueConstraint("user_id", "content_id", name="uq_user_content_progress"),)
