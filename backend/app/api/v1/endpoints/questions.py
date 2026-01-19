"""Question Bank Endpoints - For admin to manage and browse all questions."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import AdminUser
from app.models.test import Question, TestModule, Test
from app.models.enums import QuestionDomain, QuestionDifficulty, QuestionType, SATSection
from app.schemas.base import BaseSchema, PaginatedResponse


router = APIRouter(prefix="/questions", tags=["Questions"])


class QuestionBankItem(BaseSchema):
    """Question item for the question bank list."""
    id: int
    question_number: int
    question_text: str
    question_type: QuestionType
    domain: QuestionDomain | None = None
    difficulty: QuestionDifficulty | None = None
    times_answered: int = 0
    times_correct: int = 0
    accuracy: float | None = None
    module_id: int
    module_section: str
    test_id: int
    test_title: str


class QuestionBankResponse(PaginatedResponse):
    """Paginated question bank response."""
    items: list[QuestionBankItem]


class BulkQuestionCreate(BaseSchema):
    """Schema for bulk question creation."""
    question_text: str
    question_type: QuestionType
    options: list[dict] | None = None
    correct_answer: list[str]
    explanation: str | None = None
    domain: QuestionDomain | None = None
    difficulty: QuestionDifficulty | None = None
    question_image_url: str | None = None


class BulkImportRequest(BaseSchema):
    """Request for bulk importing questions to a module."""
    module_id: int
    questions: list[BulkQuestionCreate]


class BulkImportResponse(BaseSchema):
    """Response for bulk import."""
    imported: int
    errors: list[str]


@router.get("", response_model=QuestionBankResponse)
async def list_questions(
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    section: str | None = None,
    domain: str | None = None,
    difficulty: str | None = None,
    question_type: str | None = None,
    test_id: int | None = None,
):
    """List all questions with filters for the question bank."""
    query = (
        select(Question)
        .join(TestModule, Question.module_id == TestModule.id)
        .join(Test, TestModule.test_id == Test.id)
        .options(selectinload(Question.module).selectinload(TestModule.test))
    )

    # Apply filters
    if search:
        query = query.where(Question.question_text.ilike(f"%{search}%"))
    if section:
        query = query.where(TestModule.section == section)
    if domain:
        query = query.where(Question.domain == domain)
    if difficulty:
        query = query.where(Question.difficulty == difficulty)
    if question_type:
        query = query.where(Question.question_type == question_type)
    if test_id:
        query = query.where(TestModule.test_id == test_id)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Apply pagination
    query = query.offset((page - 1) * page_size).limit(page_size)
    query = query.order_by(Question.id.desc())

    result = await db.execute(query)
    questions = result.scalars().all()

    items = []
    for q in questions:
        accuracy = None
        if q.times_answered > 0:
            accuracy = round((q.times_correct / q.times_answered) * 100, 1)

        items.append(QuestionBankItem(
            id=q.id,
            question_number=q.question_number,
            question_text=q.question_text[:200] + "..." if len(q.question_text) > 200 else q.question_text,
            question_type=q.question_type,
            domain=q.domain,
            difficulty=q.difficulty,
            times_answered=q.times_answered,
            times_correct=q.times_correct,
            accuracy=accuracy,
            module_id=q.module_id,
            module_section=q.module.section.value if q.module else "",
            test_id=q.module.test_id if q.module else 0,
            test_title=q.module.test.title if q.module and q.module.test else "",
        ))

    return QuestionBankResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


class QuestionExportItem(BaseSchema):
    """Full question data for PDF export."""
    id: int
    question_number: int
    question_text: str
    question_type: QuestionType
    options: list[dict] | None = None
    correct_answer: list[str] | None = None
    explanation: str | None = None
    domain: QuestionDomain | None = None
    difficulty: QuestionDifficulty | None = None
    module_section: str
    test_title: str
    passage_text: str | None = None


@router.get("/export", response_model=list[QuestionExportItem])
async def export_questions(
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    section: str | None = None,
    domain: str | None = None,
    difficulty: str | None = None,
    search: str | None = None,
    limit: int = Query(100, ge=1, le=500),
):
    """Export full question data for PDF generation."""
    query = (
        select(Question)
        .join(TestModule, Question.module_id == TestModule.id)
        .join(Test, TestModule.test_id == Test.id)
        .options(
            selectinload(Question.module).selectinload(TestModule.test),
            selectinload(Question.passage),
        )
    )

    if search:
        query = query.where(Question.question_text.ilike(f"%{search}%"))
    if section:
        query = query.where(TestModule.section == section)
    if domain:
        query = query.where(Question.domain == domain)
    if difficulty:
        query = query.where(Question.difficulty == difficulty)

    query = query.order_by(Question.id.desc()).limit(limit)

    result = await db.execute(query)
    questions = result.scalars().all()

    return [
        QuestionExportItem(
            id=q.id,
            question_number=q.question_number,
            question_text=q.question_text,
            question_type=q.question_type,
            options=q.options,
            correct_answer=q.correct_answer,
            explanation=q.explanation,
            domain=q.domain,
            difficulty=q.difficulty,
            module_section=q.module.section.value if q.module else "",
            test_title=q.module.test.title if q.module and q.module.test else "",
            passage_text=q.passage.content if q.passage else None,
        )
        for q in questions
    ]


@router.get("/stats")
async def get_question_stats(
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get overall question statistics."""
    total = (await db.execute(select(func.count(Question.id)))).scalar() or 0
    
    # Count by domain
    domain_counts = {}
    result = await db.execute(
        select(Question.domain, func.count(Question.id))
        .group_by(Question.domain)
    )
    for domain, count in result:
        if domain:
            domain_counts[domain.value] = count

    # Count by difficulty
    difficulty_counts = {}
    result = await db.execute(
        select(Question.difficulty, func.count(Question.id))
        .group_by(Question.difficulty)
    )
    for diff, count in result:
        if diff:
            difficulty_counts[diff.value] = count

    # Most missed (lowest accuracy with > 5 attempts)
    result = await db.execute(
        select(Question)
        .where(Question.times_answered >= 5)
        .order_by((Question.times_correct * 1.0 / Question.times_answered).asc())
        .limit(5)
    )
    hardest = result.scalars().all()

    return {
        "total": total,
        "by_domain": domain_counts,
        "by_difficulty": difficulty_counts,
        "hardest_questions": [
            {
                "id": q.id,
                "text": q.question_text[:100],
                "domain": q.domain.value if q.domain else None,
                "accuracy": round((q.times_correct / q.times_answered) * 100, 1) if q.times_answered > 0 else None,
            }
            for q in hardest
        ],
    }


@router.post("/bulk", response_model=BulkImportResponse)
async def bulk_import_questions(
    data: BulkImportRequest,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Bulk import questions to a module."""
    # Verify module exists
    module_result = await db.execute(
        select(TestModule).where(TestModule.id == data.module_id)
    )
    module = module_result.scalar_one_or_none()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    # Get current max question number in module
    max_num_result = await db.execute(
        select(func.max(Question.question_number))
        .where(Question.module_id == data.module_id)
    )
    current_max = max_num_result.scalar() or 0

    imported = 0
    errors = []

    for i, q_data in enumerate(data.questions):
        try:
            question = Question(
                module_id=data.module_id,
                question_number=current_max + i + 1,
                question_text=q_data.question_text,
                question_type=q_data.question_type,
                options=q_data.options,
                correct_answer=q_data.correct_answer,
                explanation=q_data.explanation,
                domain=q_data.domain,
                difficulty=q_data.difficulty,
                question_image_url=q_data.question_image_url,
            )
            db.add(question)
            imported += 1
        except Exception as e:
            errors.append(f"Question {i + 1}: {str(e)}")

    await db.flush()

    return BulkImportResponse(imported=imported, errors=errors)
