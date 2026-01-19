from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import ActiveUser, AdminUser
from app.models import Question, Test, TestModule
from app.models.enums import SATSection, TestType, UserRole
from app.schemas import (
    QuestionCreate,
    QuestionResponse,
    QuestionUpdate,
    TestCreate,
    TestDetailResponse,
    TestListResponse,
    TestModuleCreate,
    TestModuleCreateResponse,
    TestModuleResponse,
    TestModuleUpdate,
    TestResponse,
    TestUpdate,
)

router = APIRouter(prefix="/tests", tags=["Tests"])


# === Student endpoints ===


@router.get("", response_model=TestListResponse)
async def list_tests(
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    test_type: TestType | None = None,
    section: SATSection | None = None,
    is_premium: bool | None = None,
):
    """List available tests for students."""
    query = select(Test).where(Test.is_published == True)  # noqa: E712

    if test_type:
        query = query.where(Test.test_type == test_type)

    if section:
        query = query.where(Test.section == section)

    if is_premium is not None:
        query = query.where(Test.is_premium == is_premium)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Apply pagination
    query = query.offset((page - 1) * page_size).limit(page_size)
    query = query.order_by(Test.order_index, Test.created_at.desc())

    result = await db.execute(query)
    tests = result.scalars().all()

    # Enrich with counts
    items = []
    for test in tests:
        module_count = await db.execute(
            select(func.count()).where(TestModule.test_id == test.id)
        )
        question_count = await db.execute(
            select(func.count())
            .select_from(Question)
            .join(TestModule)
            .where(TestModule.test_id == test.id)
        )

        response = TestResponse.model_validate(test)
        response.module_count = module_count.scalar() or 0
        response.total_questions = question_count.scalar() or 0
        items.append(response)

    return TestListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.get("/{test_id}", response_model=TestDetailResponse)
async def get_test(
    test_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get test details with modules."""
    query = select(Test).where(Test.id == test_id)

    # Always load questions so module selection can show question counts
    query = query.options(selectinload(Test.modules).selectinload(TestModule.questions))

    # Only filter by published status if user is not an admin
    if current_user.role != UserRole.ADMIN:
        query = query.where(Test.is_published == True)  # noqa: E712

    result = await db.execute(query)
    test = result.scalar_one_or_none()

    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")

    # Check premium access
    if test.is_premium and current_user.role != UserRole.ADMIN:
        # TODO: Check user subscription
        pass

    return test


# === Admin endpoints ===


@router.get("/admin/all", response_model=TestListResponse)
async def list_all_tests(
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    test_type: TestType | None = None,
    is_published: bool | None = None,
):
    """List all tests including unpublished (admin only)."""
    query = select(Test)

    if test_type:
        query = query.where(Test.test_type == test_type)

    if is_published is not None:
        query = query.where(Test.is_published == is_published)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.offset((page - 1) * page_size).limit(page_size)
    query = query.order_by(Test.created_at.desc())

    result = await db.execute(query)
    tests = result.scalars().all()

    items = []
    for test in tests:
        module_count = await db.execute(
            select(func.count()).where(TestModule.test_id == test.id)
        )
        question_count = await db.execute(
            select(func.count())
            .select_from(Question)
            .join(TestModule)
            .where(TestModule.test_id == test.id)
        )

        response = TestResponse.model_validate(test)
        response.module_count = module_count.scalar() or 0
        response.total_questions = question_count.scalar() or 0
        items.append(response)

    return TestListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.post("", response_model=TestResponse, status_code=status.HTTP_201_CREATED)
async def create_test(
    data: TestCreate,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new test (admin only)."""
    test = Test(**data.model_dump())
    db.add(test)
    await db.flush()
    return test


@router.patch("/{test_id}", response_model=TestResponse)
async def update_test(
    test_id: int,
    data: TestUpdate,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update a test (admin only)."""
    result = await db.execute(select(Test).where(Test.id == test_id))
    test = result.scalar_one_or_none()

    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(test, field, value)

    return test


@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test(
    test_id: int,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a test (admin only)."""
    result = await db.execute(select(Test).where(Test.id == test_id))
    test = result.scalar_one_or_none()

    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")

    await db.delete(test)


# === Module endpoints ===


@router.post("/{test_id}/modules", response_model=TestModuleCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_module(
    test_id: int,
    data: TestModuleCreate,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a module for a test (admin only)."""
    result = await db.execute(select(Test).where(Test.id == test_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")

    module = TestModule(**data.model_dump())
    module.test_id = test_id
    db.add(module)
    await db.flush()
    await db.refresh(module)
    return module


@router.patch("/modules/{module_id}", response_model=TestModuleCreateResponse)
async def update_module(
    module_id: int,
    data: TestModuleUpdate,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update a module (admin only)."""
    result = await db.execute(select(TestModule).where(TestModule.id == module_id))
    module = result.scalar_one_or_none()

    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(module, field, value)

    return module


@router.delete("/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_module(
    module_id: int,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a module (admin only)."""
    result = await db.execute(select(TestModule).where(TestModule.id == module_id))
    module = result.scalar_one_or_none()

    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    await db.delete(module)


# === Question endpoints ===


@router.post("/modules/{module_id}/questions", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
async def create_question(
    module_id: int,
    data: QuestionCreate,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a question in a module (admin only)."""
    result = await db.execute(select(TestModule).where(TestModule.id == module_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    question_data = data.model_dump()
    question_data["module_id"] = module_id

    # Convert options to dict format for JSONB
    if question_data.get("options"):
        question_data["options"] = [opt.model_dump() if hasattr(opt, "model_dump") else opt for opt in question_data["options"]]

    # Convert answer_constraints to dict
    if question_data.get("answer_constraints"):
        constraints = question_data["answer_constraints"]
        question_data["answer_constraints"] = constraints.model_dump() if hasattr(constraints, "model_dump") else constraints

    question = Question(**question_data)
    db.add(question)
    await db.flush()
    return question


@router.get("/modules/{module_id}/questions", response_model=list[QuestionResponse])
async def list_module_questions(
    module_id: int,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all questions in a module (admin only)."""
    result = await db.execute(
        select(Question)
        .where(Question.module_id == module_id)
        .order_by(Question.question_number)
    )
    return result.scalars().all()


@router.patch("/questions/{question_id}", response_model=QuestionResponse)
async def update_question(
    question_id: int,
    data: QuestionUpdate,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update a question (admin only)."""
    result = await db.execute(select(Question).where(Question.id == question_id))
    question = result.scalar_one_or_none()

    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

    update_data = data.model_dump(exclude_unset=True)

    # Convert nested objects
    if "options" in update_data and update_data["options"]:
        update_data["options"] = [
            opt.model_dump() if hasattr(opt, "model_dump") else opt
            for opt in update_data["options"]
        ]

    if "answer_constraints" in update_data and update_data["answer_constraints"]:
        constraints = update_data["answer_constraints"]
        update_data["answer_constraints"] = (
            constraints.model_dump() if hasattr(constraints, "model_dump") else constraints
        )

    for field, value in update_data.items():
        setattr(question, field, value)

    return question


@router.delete("/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(
    question_id: int,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a question (admin only)."""
    result = await db.execute(select(Question).where(Question.id == question_id))
    question = result.scalar_one_or_none()

    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

    await db.delete(question)
