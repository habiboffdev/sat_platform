"""Drill/Practice Mode Endpoints - For students to practice specific domains."""
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import ActiveUser
from app.models.enums import QuestionDomain, QuestionDifficulty, SATSection
from app.models.test import Question, TestModule, Passage
from app.services.analytics_service import AnalyticsService


router = APIRouter(prefix="/drills", tags=["Drills"])


# === Request/Response schemas ===

class DrillConfig(BaseModel):
    """Configuration for creating a drill."""
    section: str | None = None  # reading_writing, math, or None for both
    domains: list[str] | None = None  # List of domain strings to include
    difficulty: str | None = None  # easy, medium, hard, or None for all
    question_count: int = Field(default=10, ge=5, le=50)


class DrillQuestionView(BaseModel):
    """Question view for drill mode (no correct answer during drill)."""
    id: int
    question_number: int
    question_text: str
    question_type: str
    question_image_url: str | None = None
    options: list[dict] | None = None
    passage: dict | None = None
    domain: str | None = None
    difficulty: str | None = None

    class Config:
        from_attributes = True


class DrillSession(BaseModel):
    """A drill practice session."""
    drill_id: str  # UUID or timestamp-based ID
    question_count: int
    questions: list[DrillQuestionView]
    section: str | None = None
    domains: list[str] | None = None
    difficulty: str | None = None


class DrillAnswer(BaseModel):
    """Answer submission for a drill question."""
    question_id: int
    answer: str | None


class DrillSubmitRequest(BaseModel):
    """Request to submit drill answers."""
    answers: list[DrillAnswer]


class DrillQuestionResult(BaseModel):
    """Result for a single drill question."""
    id: int
    question_number: int
    question_text: str
    question_type: str
    question_image_url: str | None = None
    options: list[dict] | None = None
    correct_answer: list[str]
    explanation: str | None = None
    user_answer: str | None
    is_correct: bool
    domain: str | None = None
    difficulty: str | None = None


class DrillResult(BaseModel):
    """Result summary for a completed drill."""
    total_questions: int
    correct_count: int
    accuracy: float
    domain_breakdown: list[dict]
    questions: list[DrillQuestionResult]


@router.post("/create", response_model=DrillSession)
async def create_drill(
    config: DrillConfig,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Create a practice drill by selecting random questions matching filters.
    Returns a drill session with questions (simpler than full test flow).
    """
    # Build query for questions
    query = select(Question).options(selectinload(Question.passage))
    
    # Join with module to filter by section
    query = query.join(TestModule)
    
    # Filter by section
    if config.section:
        try:
            section_enum = SATSection(config.section)
            query = query.where(TestModule.section == section_enum)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid section: {config.section}"
            )
    
    # Filter by domains
    if config.domains:
        domain_enums = []
        for d in config.domains:
            try:
                domain_enums.append(QuestionDomain(d))
            except ValueError:
                pass  # Skip invalid domains
        if domain_enums:
            query = query.where(Question.domain.in_(domain_enums))
    
    # Filter by difficulty
    if config.difficulty:
        try:
            diff_enum = QuestionDifficulty(config.difficulty)
            query = query.where(Question.difficulty == diff_enum)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid difficulty: {config.difficulty}"
            )
    
    # Randomize and limit
    query = query.order_by(func.random()).limit(config.question_count)
    
    result = await db.execute(query)
    questions = result.scalars().all()
    
    if len(questions) < 5:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not enough questions match your criteria. Try broadening your filters."
        )
    
    # Build drill session
    drill_id = f"drill_{current_user.id}_{int(datetime.now(UTC).timestamp())}"
    
    drill_questions = []
    for i, q in enumerate(questions, 1):
        passage_data = None
        if q.passage:
            passage_data = {
                "id": q.passage.id,
                "content": q.passage.content,
                "title": q.passage.title,
                "source": q.passage.source,
            }
        
        drill_questions.append(DrillQuestionView(
            id=q.id,
            question_number=i,
            question_text=q.question_text,
            question_type=q.question_type.value,
            question_image_url=q.question_image_url,
            options=q.options,
            passage=passage_data,
            domain=q.domain.value if q.domain else None,
            difficulty=q.difficulty.value if q.difficulty else None,
        ))
    
    return DrillSession(
        drill_id=drill_id,
        question_count=len(drill_questions),
        questions=drill_questions,
        section=config.section,
        domains=config.domains,
        difficulty=config.difficulty,
    )


@router.post("/submit", response_model=DrillResult)
async def submit_drill(
    data: DrillSubmitRequest,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Submit drill answers and get results with correct answers and explanations.
    """
    # Get question IDs from answers
    question_ids = [a.question_id for a in data.answers]
    
    if not question_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No answers provided"
        )
    
    # Fetch questions with correct answers
    result = await db.execute(
        select(Question)
        .options(selectinload(Question.passage))
        .where(Question.id.in_(question_ids))
    )
    questions = {q.id: q for q in result.scalars().all()}
    
    # Score answers
    correct_count = 0
    domain_stats: dict[str, dict] = {}
    question_results = []
    
    for i, answer in enumerate(data.answers, 1):
        question = questions.get(answer.question_id)
        if not question:
            continue
        
        is_correct = answer.answer in question.correct_answer if answer.answer else False
        
        if is_correct:
            correct_count += 1
            question.times_correct += 1
        question.times_answered += 1
        
        # Track domain stats
        if question.domain:
            domain_key = question.domain.value
            if domain_key not in domain_stats:
                domain_stats[domain_key] = {"correct": 0, "total": 0}
            domain_stats[domain_key]["total"] += 1
            if is_correct:
                domain_stats[domain_key]["correct"] += 1
        
        question_results.append(DrillQuestionResult(
            id=question.id,
            question_number=i,
            question_text=question.question_text,
            question_type=question.question_type.value,
            question_image_url=question.question_image_url,
            options=question.options,
            correct_answer=question.correct_answer,
            explanation=question.explanation,
            user_answer=answer.answer,
            is_correct=is_correct,
            domain=question.domain.value if question.domain else None,
            difficulty=question.difficulty.value if question.difficulty else None,
        ))
    
    # Build domain breakdown
    domain_breakdown = []
    for domain_key, stats in domain_stats.items():
        accuracy = (stats["correct"] / stats["total"] * 100) if stats["total"] > 0 else 0
        domain_breakdown.append({
            "domain": domain_key,
            "correct": stats["correct"],
            "total": stats["total"],
            "accuracy": round(accuracy, 1)
        })
    
    total = len(question_results)
    accuracy = (correct_count / total * 100) if total > 0 else 0
    
    # Update analytics (optional - track drill performance)
    try:
        analytics_service = AnalyticsService(db)
        await analytics_service.update_student_analytics(current_user.id)
    except Exception:
        pass  # Non-critical
    
    return DrillResult(
        total_questions=total,
        correct_count=correct_count,
        accuracy=round(accuracy, 1),
        domain_breakdown=domain_breakdown,
        questions=question_results,
    )


@router.get("/weak-areas", response_model=DrillSession)
async def get_weak_area_drill(
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    question_count: int = Query(10, ge=5, le=30),
):
    """
    Generate a drill from the user's weakest domains based on analytics.
    """
    # Get user's weak domains from analytics
    analytics_service = AnalyticsService(db)
    analytics = await analytics_service.get_student_analytics(current_user.id)
    
    weak_domains = []
    if analytics and analytics.domain_performance:
        # Get domains with accuracy < 60%
        for domain, stats in analytics.domain_performance.items():
            if isinstance(stats, dict) and stats.get("accuracy", 100) < 60:
                weak_domains.append(domain)
    
    if not weak_domains:
        # No weak areas identified, get a general mix
        weak_domains = None
    
    # Create drill with weak domains
    config = DrillConfig(
        domains=weak_domains,
        question_count=question_count,
    )
    
    return await create_drill(config, current_user, db)


@router.get("/domains")
async def get_available_domains(
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get list of available domains with question counts."""
    # Query question counts by domain
    result = await db.execute(
        select(
            Question.domain,
            func.count(Question.id).label("count")
        )
        .where(Question.domain.isnot(None))
        .group_by(Question.domain)
    )
    
    domain_counts = {}
    for row in result:
        if row.domain:
            domain_counts[row.domain.value] = row.count
    
    # Also get section info
    rw_domains = ["craft_and_structure", "information_and_ideas", 
                  "standard_english_conventions", "expression_of_ideas"]
    math_domains = ["algebra", "advanced_math", 
                    "problem_solving_data_analysis", "geometry_trigonometry"]
    
    return {
        "reading_writing": {d: domain_counts.get(d, 0) for d in rw_domains},
        "math": {d: domain_counts.get(d, 0) for d in math_domains},
    }
