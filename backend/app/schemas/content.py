from datetime import datetime

from pydantic import Field

from app.models.enums import ContentType, QuestionDomain, SATSection
from app.schemas.base import BaseSchema, PaginatedResponse, TimestampSchema


# === Content Resource Schema ===


class ContentResource(BaseSchema):
    """Schema for attached resources (PDFs, worksheets, etc.)."""

    title: str
    url: str
    type: str = Field(description="Resource type: pdf, doc, link, etc.")


# === Content Category Schemas ===


class ContentCategoryBase(BaseSchema):
    """Base content category schema."""

    name: str = Field(max_length=255)
    slug: str = Field(max_length=255)
    description: str | None = None
    icon: str | None = None
    section: SATSection | None = None
    domain: QuestionDomain | None = None
    order_index: int = 0


class ContentCategoryCreate(ContentCategoryBase):
    """Schema for creating a content category."""

    parent_id: int | None = None


class ContentCategoryUpdate(BaseSchema):
    """Schema for updating a content category."""

    name: str | None = Field(default=None, max_length=255)
    slug: str | None = Field(default=None, max_length=255)
    description: str | None = None
    icon: str | None = None
    section: SATSection | None = None
    domain: QuestionDomain | None = None
    parent_id: int | None = None
    order_index: int | None = None


class ContentCategoryResponse(ContentCategoryBase, TimestampSchema):
    """Schema for content category response."""

    id: int
    parent_id: int | None = None
    content_count: int = 0


class ContentCategoryTreeResponse(ContentCategoryResponse):
    """Schema for content category with children."""

    children: list["ContentCategoryTreeResponse"] = []


# === Content Schemas ===


class ContentBase(BaseSchema):
    """Base content schema."""

    title: str = Field(max_length=255)
    slug: str = Field(max_length=255)
    description: str | None = None
    content_type: ContentType
    body: str | None = None
    video_url: str | None = None
    video_duration_seconds: int | None = None
    video_thumbnail_url: str | None = None
    resources: list[ContentResource] | None = None
    section: SATSection | None = None
    domain: QuestionDomain | None = None
    skill_tags: list[str] | None = None
    is_published: bool = False
    is_premium: bool = False
    order_index: int = 0
    estimated_time_minutes: int | None = None


class ContentCreate(ContentBase):
    """Schema for creating content."""

    category_id: int | None = None
    related_question_ids: list[int] | None = None


class ContentUpdate(BaseSchema):
    """Schema for updating content."""

    title: str | None = Field(default=None, max_length=255)
    slug: str | None = Field(default=None, max_length=255)
    description: str | None = None
    content_type: ContentType | None = None
    body: str | None = None
    video_url: str | None = None
    video_duration_seconds: int | None = None
    video_thumbnail_url: str | None = None
    resources: list[ContentResource] | None = None
    section: SATSection | None = None
    domain: QuestionDomain | None = None
    skill_tags: list[str] | None = None
    category_id: int | None = None
    is_published: bool | None = None
    is_premium: bool | None = None
    order_index: int | None = None
    estimated_time_minutes: int | None = None
    related_question_ids: list[int] | None = None


class ContentResponse(ContentBase, TimestampSchema):
    """Schema for content response."""

    id: int
    category_id: int | None = None


class ContentDetailResponse(ContentResponse):
    """Schema for detailed content response."""

    category: ContentCategoryResponse | None = None
    related_question_ids: list[int] | None = None


class ContentListResponse(PaginatedResponse):
    """Paginated list of content."""

    items: list[ContentResponse]


# === Content Progress Schemas ===


class ContentProgressUpdate(BaseSchema):
    """Schema for updating content progress."""

    progress_percent: int | None = Field(default=None, ge=0, le=100)
    last_position_seconds: int | None = None
    is_completed: bool | None = None
    notes: str | None = None
    time_spent_seconds: int | None = None


class ContentProgressResponse(BaseSchema):
    """Schema for content progress response."""

    id: int
    content_id: int
    is_completed: bool
    completed_at: datetime | None = None
    progress_percent: int
    last_position_seconds: int
    total_time_seconds: int
    notes: str | None = None


class ContentWithProgressResponse(ContentResponse):
    """Schema for content with user's progress."""

    progress: ContentProgressResponse | None = None


# Rebuild models with forward references
ContentCategoryTreeResponse.model_rebuild()
