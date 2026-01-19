from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import ActiveUser, AdminUser
from app.models import Content, ContentCategory, ContentProgress
from app.models.enums import ContentType, QuestionDomain, SATSection
from app.schemas import (
    ContentCategoryCreate,
    ContentCategoryResponse,
    ContentCategoryTreeResponse,
    ContentCategoryUpdate,
    ContentCreate,
    ContentDetailResponse,
    ContentListResponse,
    ContentProgressResponse,
    ContentProgressUpdate,
    ContentResponse,
    ContentUpdate,
    ContentWithProgressResponse,
)

router = APIRouter(prefix="/content", tags=["Content"])


# === Student endpoints ===


@router.get("", response_model=ContentListResponse)
async def list_content(
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category_id: int | None = None,
    section: SATSection | None = None,
    domain: QuestionDomain | None = None,
    content_type: ContentType | None = None,
    search: str | None = None,
):
    """List published educational content."""
    query = select(Content).where(Content.is_published == True)  # noqa: E712

    if category_id:
        query = query.where(Content.category_id == category_id)

    if section:
        query = query.where(Content.section == section)

    if domain:
        query = query.where(Content.domain == domain)

    if content_type:
        query = query.where(Content.content_type == content_type)

    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            (Content.title.ilike(search_pattern)) | (Content.description.ilike(search_pattern))
        )

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.offset((page - 1) * page_size).limit(page_size)
    query = query.order_by(Content.order_index, Content.created_at.desc())

    result = await db.execute(query)
    contents = result.scalars().all()

    return ContentListResponse(
        items=contents,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.get("/categories", response_model=list[ContentCategoryTreeResponse])
async def list_categories(
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List content categories as a tree structure."""
    result = await db.execute(
        select(ContentCategory)
        .options(selectinload(ContentCategory.contents))
        .order_by(ContentCategory.order_index)
    )
    categories = result.scalars().all()

    # Build tree
    category_map = {c.id: c for c in categories}
    root_categories = []

    for cat in categories:
        cat_response = ContentCategoryTreeResponse(
            id=cat.id,
            name=cat.name,
            slug=cat.slug,
            description=cat.description,
            icon=cat.icon,
            section=cat.section,
            domain=cat.domain,
            order_index=cat.order_index,
            parent_id=cat.parent_id,
            content_count=len([c for c in cat.contents if c.is_published]),
            created_at=cat.created_at,
            updated_at=cat.updated_at,
            children=[],
        )

        if cat.parent_id is None:
            root_categories.append(cat_response)
        else:
            parent = category_map.get(cat.parent_id)
            if parent:
                # This is simplified - for deep nesting you'd need recursion
                pass

    return root_categories


@router.get("/{content_id}", response_model=ContentWithProgressResponse)
async def get_content(
    content_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get content by ID with user's progress."""
    result = await db.execute(
        select(Content)
        .options(selectinload(Content.category))
        .where(Content.id == content_id, Content.is_published == True)  # noqa: E712
    )
    content = result.scalar_one_or_none()

    if not content:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content not found")

    # Check premium access
    if content.is_premium:
        # TODO: Check user subscription
        pass

    # Get user's progress
    result = await db.execute(
        select(ContentProgress).where(
            ContentProgress.user_id == current_user.id,
            ContentProgress.content_id == content_id,
        )
    )
    progress = result.scalar_one_or_none()

    response = ContentWithProgressResponse(
        id=content.id,
        title=content.title,
        slug=content.slug,
        description=content.description,
        content_type=content.content_type,
        body=content.body,
        video_url=content.video_url,
        video_duration_seconds=content.video_duration_seconds,
        video_thumbnail_url=content.video_thumbnail_url,
        resources=content.resources,
        section=content.section,
        domain=content.domain,
        skill_tags=content.skill_tags,
        is_published=content.is_published,
        is_premium=content.is_premium,
        order_index=content.order_index,
        estimated_time_minutes=content.estimated_time_minutes,
        category_id=content.category_id,
        created_at=content.created_at,
        updated_at=content.updated_at,
        progress=ContentProgressResponse(
            id=progress.id,
            content_id=progress.content_id,
            is_completed=progress.is_completed,
            completed_at=progress.completed_at,
            progress_percent=progress.progress_percent,
            last_position_seconds=progress.last_position_seconds,
            total_time_seconds=progress.total_time_seconds,
            notes=progress.notes,
        )
        if progress
        else None,
    )

    return response


@router.post("/{content_id}/progress", response_model=ContentProgressResponse)
async def update_progress(
    content_id: int,
    data: ContentProgressUpdate,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update user's progress on content."""
    # Verify content exists
    result = await db.execute(select(Content).where(Content.id == content_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content not found")

    # Get or create progress
    result = await db.execute(
        select(ContentProgress).where(
            ContentProgress.user_id == current_user.id,
            ContentProgress.content_id == content_id,
        )
    )
    progress = result.scalar_one_or_none()

    if not progress:
        progress = ContentProgress(
            user_id=current_user.id,
            content_id=content_id,
        )
        db.add(progress)

    # Update fields
    update_data = data.model_dump(exclude_unset=True)

    if "time_spent_seconds" in update_data:
        if progress.total_time_seconds is None:
            progress.total_time_seconds = 0
        progress.total_time_seconds += update_data.pop("time_spent_seconds")

    for field, value in update_data.items():
        setattr(progress, field, value)

    # If marked as completed, set completed_at
    if data.is_completed and not progress.completed_at:
        progress.completed_at = datetime.now(UTC)
        progress.progress_percent = 100

    await db.flush()

    return ContentProgressResponse(
        id=progress.id,
        content_id=progress.content_id,
        is_completed=progress.is_completed,
        completed_at=progress.completed_at,
        progress_percent=progress.progress_percent,
        last_position_seconds=progress.last_position_seconds,
        total_time_seconds=progress.total_time_seconds,
        notes=progress.notes,
    )


# === Admin endpoints ===


@router.get("/admin/all", response_model=ContentListResponse)
async def list_all_content(
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_published: bool | None = None,
):
    """List all content including unpublished (admin only)."""
    query = select(Content)

    if is_published is not None:
        query = query.where(Content.is_published == is_published)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.offset((page - 1) * page_size).limit(page_size)
    query = query.order_by(Content.created_at.desc())

    result = await db.execute(query)
    contents = result.scalars().all()

    return ContentListResponse(
        items=contents,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.post("", response_model=ContentResponse, status_code=status.HTTP_201_CREATED)
async def create_content(
    data: ContentCreate,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create new content (admin only)."""
    # Check slug uniqueness
    result = await db.execute(select(Content).where(Content.slug == data.slug))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Content with this slug already exists",
        )

    content_data = data.model_dump()
    if content_data.get("resources"):
        content_data["resources"] = [
            r.model_dump() if hasattr(r, "model_dump") else r for r in content_data["resources"]
        ]

    content = Content(**content_data)
    db.add(content)
    await db.flush()

    return content


@router.patch("/{content_id}", response_model=ContentResponse)
async def update_content(
    content_id: int,
    data: ContentUpdate,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update content (admin only)."""
    result = await db.execute(select(Content).where(Content.id == content_id))
    content = result.scalar_one_or_none()

    if not content:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content not found")

    update_data = data.model_dump(exclude_unset=True)

    if "resources" in update_data and update_data["resources"]:
        update_data["resources"] = [
            r.model_dump() if hasattr(r, "model_dump") else r for r in update_data["resources"]
        ]

    for field, value in update_data.items():
        setattr(content, field, value)

    return content


@router.delete("/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_content(
    content_id: int,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete content (admin only)."""
    result = await db.execute(select(Content).where(Content.id == content_id))
    content = result.scalar_one_or_none()

    if not content:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content not found")

    await db.delete(content)


# === Category admin endpoints ===


@router.post("/categories", response_model=ContentCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    data: ContentCategoryCreate,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a content category (admin only)."""
    result = await db.execute(
        select(ContentCategory).where(ContentCategory.slug == data.slug)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category with this slug already exists",
        )

    category = ContentCategory(**data.model_dump())
    db.add(category)
    await db.flush()

    return ContentCategoryResponse(
        id=category.id,
        name=category.name,
        slug=category.slug,
        description=category.description,
        icon=category.icon,
        section=category.section,
        domain=category.domain,
        order_index=category.order_index,
        parent_id=category.parent_id,
        content_count=0,
        created_at=category.created_at,
        updated_at=category.updated_at,
    )


@router.patch("/categories/{category_id}", response_model=ContentCategoryResponse)
async def update_category(
    category_id: int,
    data: ContentCategoryUpdate,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update a content category (admin only)."""
    result = await db.execute(
        select(ContentCategory).where(ContentCategory.id == category_id)
    )
    category = result.scalar_one_or_none()

    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(category, field, value)

    content_count = await db.execute(
        select(func.count()).where(Content.category_id == category_id)
    )

    return ContentCategoryResponse(
        id=category.id,
        name=category.name,
        slug=category.slug,
        description=category.description,
        icon=category.icon,
        section=category.section,
        domain=category.domain,
        order_index=category.order_index,
        parent_id=category.parent_id,
        content_count=content_count.scalar() or 0,
        created_at=category.created_at,
        updated_at=category.updated_at,
    )


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: int,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a content category (admin only)."""
    result = await db.execute(
        select(ContentCategory).where(ContentCategory.id == category_id)
    )
    category = result.scalar_one_or_none()

    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    await db.delete(category)
