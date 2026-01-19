from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import AdminUser
from app.models.test import Passage
from app.schemas.base import PaginatedResponse
from app.schemas.test import PassageCreate, PassageResponse, PassageUpdate

router = APIRouter(prefix="/passages", tags=["Passages"])


class PassageListResponse(PaginatedResponse):
    """Paginated passage list response."""

    items: list[PassageResponse]


@router.get("", response_model=PassageListResponse)
async def list_passages(
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
):
    """List all passages (admin only)."""
    query = select(Passage)

    if search:
        query = query.where(
            Passage.title.ilike(f"%{search}%")
            | Passage.content.ilike(f"%{search}%")
            | Passage.source.ilike(f"%{search}%")
            | Passage.author.ilike(f"%{search}%")
        )

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Apply pagination
    query = query.offset((page - 1) * page_size).limit(page_size)
    query = query.order_by(Passage.created_at.desc())

    result = await db.execute(query)
    passages = result.scalars().all()

    return PassageListResponse(
        items=[PassageResponse.model_validate(p) for p in passages],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.post("", response_model=PassageResponse, status_code=status.HTTP_201_CREATED)
async def create_passage(
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    passage_data: PassageCreate,
):
    """Create a new passage (admin only)."""
    # Calculate word count if content provided
    word_count = len(passage_data.content.split()) if passage_data.content else 0

    passage = Passage(
        title=passage_data.title,
        content=passage_data.content,
        source=passage_data.source,
        author=passage_data.author,
        word_count=word_count,
        figures=passage_data.figures,
        genre=passage_data.genre,
        topic_tags=passage_data.topic_tags,
    )

    db.add(passage)
    await db.commit()
    await db.refresh(passage)

    return PassageResponse.model_validate(passage)


@router.get("/{passage_id}", response_model=PassageResponse)
async def get_passage(
    passage_id: int,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a specific passage (admin only)."""
    result = await db.execute(select(Passage).where(Passage.id == passage_id))
    passage = result.scalar_one_or_none()

    if not passage:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Passage not found"
        )

    return PassageResponse.model_validate(passage)


@router.patch("/{passage_id}", response_model=PassageResponse)
async def update_passage(
    passage_id: int,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    passage_data: PassageUpdate,
):
    """Update a passage (admin only)."""
    result = await db.execute(select(Passage).where(Passage.id == passage_id))
    passage = result.scalar_one_or_none()

    if not passage:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Passage not found"
        )

    update_data = passage_data.model_dump(exclude_unset=True)

    # Recalculate word count if content is being updated
    if "content" in update_data and update_data["content"]:
        update_data["word_count"] = len(update_data["content"].split())

    for field, value in update_data.items():
        setattr(passage, field, value)

    await db.commit()
    await db.refresh(passage)

    return PassageResponse.model_validate(passage)


@router.delete("/{passage_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_passage(
    passage_id: int,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a passage (admin only)."""
    result = await db.execute(select(Passage).where(Passage.id == passage_id))
    passage = result.scalar_one_or_none()

    if not passage:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Passage not found"
        )

    await db.delete(passage)
    await db.commit()
