from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import ActiveUser
from app.models import (
    AttemptAnswer,
    ModuleResult,
    Question,
    Test,
    TestAttempt,
    TestModule,
)
from app.models.enums import AttemptStatus, ModuleDifficulty, SATModule, SATSection, TestScope
from app.schemas import (
    AttemptListResponse,
    DomainBreakdown,
    SubmitModuleRequest,
    TestAttemptDetailResponse,
    TestAttemptResponse,
    TestModuleWithQuestions,
)
from app.schemas.test import QuestionReviewView, QuestionStudentView, ModuleResultResponse
from app.services.analytics_service import AnalyticsService


# === Request/Response schemas for new endpoints ===

class TestConfigRequest(BaseModel):
    """Configuration options when starting a test."""
    time_multiplier: float = 1.0  # 1, 1.5, or 2
    scope: str = "full"  # full, rw_only, math_only, single_module
    selected_module_id: int | None = None


class StartTestWithConfigRequest(BaseModel):
    """Request body for starting a test with configuration."""
    test_id: int
    config: TestConfigRequest | None = None


class ModuleReviewResponse(BaseModel):
    """A module with its questions for review."""
    module_id: int
    section: str
    module_type: str
    difficulty: str
    questions: list[QuestionReviewView]


class AttemptReviewResponse(BaseModel):
    """Full review response with all questions and answers."""
    attempt_id: int
    test_id: int
    test_title: str
    status: str
    started_at: datetime
    completed_at: datetime | None
    total_score: int | None
    reading_writing_scaled_score: int | None
    math_scaled_score: int | None
    modules: list[ModuleReviewResponse]
    summary: dict

router = APIRouter(prefix="/attempts", tags=["Test Attempts"])


@router.post("", response_model=TestAttemptResponse, status_code=status.HTTP_201_CREATED)
async def start_test(
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    test_id: int | None = None,
    request_body: StartTestWithConfigRequest | None = None,
):
    """
    Start a new test attempt with optional configuration.

    Supports both query param (test_id) for backwards compatibility
    and request body for full configuration.

    Config options:
    - time_multiplier: 1, 1.5, or 2 (for extended time)
    - scope: full, rw_only, math_only, single_module
    - selected_module_id: Required if scope is single_module
    """
    # Get test_id from either query param or body
    actual_test_id = test_id
    config = None

    if request_body:
        actual_test_id = request_body.test_id
        config = request_body.config

    if not actual_test_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="test_id is required (either as query param or in request body)"
        )

    # Verify test exists and is published
    result = await db.execute(
        select(Test)
        .options(selectinload(Test.modules))
        .where(Test.id == actual_test_id, Test.is_published == True)  # noqa: E712
    )
    test = result.scalar_one_or_none()

    if not test:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")

    # Check for existing in-progress attempt (only for same test with no config)
    if not config or config.scope == "full":
        result = await db.execute(
            select(TestAttempt).where(
                TestAttempt.user_id == current_user.id,
                TestAttempt.test_id == actual_test_id,
                TestAttempt.status == AttemptStatus.IN_PROGRESS,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Return existing attempt instead of creating new one
            return TestAttemptResponse(
                id=existing.id,
                test_id=existing.test_id,
                test_title=test.title,
                status=existing.status,
                started_at=existing.started_at,
                completed_at=existing.completed_at,
                current_module_id=existing.current_module_id,
                current_question_number=existing.current_question_number,
            )

    # Filter modules based on config scope
    available_modules = test.modules
    if config:
        scope = config.scope.lower()

        if scope == "rw_only":
            available_modules = [m for m in test.modules if m.section.value == "reading_writing"]
        elif scope == "math_only":
            available_modules = [m for m in test.modules if m.section.value == "math"]
        elif scope == "single_module" and config.selected_module_id:
            available_modules = [m for m in test.modules if m.id == config.selected_module_id]
            if not available_modules:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Selected module not found in this test"
                )

    if not available_modules:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No modules available for the selected scope"
        )

    # Sort by section (reading_writing first) then order_index
    section_order = {'reading_writing': 0, 'math': 1}
    sorted_modules = sorted(
        available_modules,
        key=lambda m: (section_order.get(m.section.value, 99), m.order_index)
    )

    first_module = sorted_modules[0] if sorted_modules else None

    # Create attempt with config data
    attempt = TestAttempt(
        user_id=current_user.id,
        test_id=actual_test_id,
        current_module_id=first_module.id if first_module else None,
    )

    # Store config in domain_breakdown JSON field as metadata
    # Note: In production, you'd add dedicated columns for these
    if config:
        attempt.domain_breakdown = {
            "_config": {
                "time_multiplier": config.time_multiplier,
                "scope": config.scope,
                "selected_module_id": config.selected_module_id,
                "filtered_module_ids": [m.id for m in sorted_modules]
            }
        }

    db.add(attempt)
    await db.flush()

    return TestAttemptResponse(
        id=attempt.id,
        test_id=attempt.test_id,
        test_title=test.title,
        status=attempt.status,
        started_at=attempt.started_at,
        completed_at=attempt.completed_at,
        current_module_id=attempt.current_module_id,
        current_question_number=attempt.current_question_number,
    )


@router.get("", response_model=AttemptListResponse)
async def list_my_attempts(
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: AttemptStatus | None = None,
):
    """List current user's test attempts."""
    query = select(TestAttempt).where(TestAttempt.user_id == current_user.id)

    if status_filter:
        query = query.where(TestAttempt.status == status_filter)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.offset((page - 1) * page_size).limit(page_size)
    query = query.order_by(TestAttempt.started_at.desc())
    query = query.options(
        selectinload(TestAttempt.test),
        selectinload(TestAttempt.module_results)
    )

    result = await db.execute(query)
    attempts = result.scalars().all()

    items = []
    for a in attempts:
        # Calculate total time spent across all modules
        total_time = sum(
            (mr.time_spent_seconds or 0) for mr in a.module_results
        )
        
        # Extract scope from metadata
        scope = (a.domain_breakdown or {}).get("_config", {}).get("scope", "full")
        
        items.append(TestAttemptResponse(
            id=a.id,
            test_id=a.test_id,
            test_title=a.test.title,
            status=a.status,
            started_at=a.started_at,
            completed_at=a.completed_at,
            current_module_id=a.current_module_id,
            current_question_number=a.current_question_number,
            total_score=a.total_score,
            time_spent_seconds=total_time,
            scope=scope,
        ))

    return AttemptListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.get("/{attempt_id}", response_model=TestAttemptDetailResponse)
async def get_attempt(
    attempt_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get attempt details with domain breakdown."""
    result = await db.execute(
        select(TestAttempt)
        .options(
            selectinload(TestAttempt.test).selectinload(Test.modules),
            selectinload(TestAttempt.module_results),
            selectinload(TestAttempt.answers),
        )
        .where(TestAttempt.id == attempt_id, TestAttempt.user_id == current_user.id)
    )
    attempt = result.scalar_one_or_none()

    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

    # Calculate domain breakdown from answers
    domain_breakdown = []
    if attempt.status == AttemptStatus.COMPLETED and attempt.answers:
        # Get all question IDs from this attempt
        question_ids = [a.question_id for a in attempt.answers]

        # Fetch questions with their domains
        questions_result = await db.execute(
            select(Question).where(Question.id.in_(question_ids))
        )
        questions = {q.id: q for q in questions_result.scalars().all()}

        # Group answers by domain
        domain_stats: dict[str, dict] = {}
        for answer in attempt.answers:
            question = questions.get(answer.question_id)
            if question and question.domain:
                domain_key = question.domain.value
                if domain_key not in domain_stats:
                    domain_stats[domain_key] = {"correct": 0, "total": 0}
                domain_stats[domain_key]["total"] += 1
                if answer.is_correct:
                    domain_stats[domain_key]["correct"] += 1

        # Convert to DomainBreakdown list
        from app.models.enums import QuestionDomain
        for domain_key, stats in domain_stats.items():
            try:
                domain_enum = QuestionDomain(domain_key)
                percentage = (stats["correct"] / stats["total"] * 100) if stats["total"] > 0 else 0
                domain_breakdown.append(DomainBreakdown(
                    domain=domain_enum,
                    correct=stats["correct"],
                    total=stats["total"],
                    percentage=round(percentage, 1)
                ))
            except ValueError:
                pass  # Skip invalid domain values

    # Build module results
    module_results_response = []
    for mr in attempt.module_results:
        # Get module info
        module_result = await db.execute(
            select(TestModule).where(TestModule.id == mr.module_id)
        )
        module = module_result.scalar_one_or_none()
        if module:
            module_results_response.append(ModuleResultResponse(
                module_id=mr.module_id,
                section=module.section,
                module_type=module.module,
                correct_count=mr.correct_count,
                total_count=mr.total_count,
                time_spent_seconds=mr.time_spent_seconds,
                next_module_difficulty=mr.next_module_difficulty
            ))

    return TestAttemptDetailResponse(
        id=attempt.id,
        test_id=attempt.test_id,
        test_title=attempt.test.title,
        status=attempt.status,
        started_at=attempt.started_at,
        completed_at=attempt.completed_at,
        current_module_id=attempt.current_module_id,
        current_question_number=attempt.current_question_number,
        reading_writing_raw_score=attempt.reading_writing_raw_score,
        math_raw_score=attempt.math_raw_score,
        reading_writing_scaled_score=attempt.reading_writing_scaled_score,
        math_scaled_score=attempt.math_scaled_score,
        total_score=attempt.total_score,
        percentile=attempt.percentile,
        domain_breakdown=domain_breakdown if domain_breakdown else None,
        module_results=module_results_response,
        scope=(attempt.domain_breakdown or {}).get("_config", {}).get("scope", "full")
    )


@router.get("/{attempt_id}/current-module", response_model=TestModuleWithQuestions)
async def get_current_module(
    attempt_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get the current module with questions for an in-progress attempt."""
    result = await db.execute(
        select(TestAttempt).where(
            TestAttempt.id == attempt_id,
            TestAttempt.user_id == current_user.id,
            TestAttempt.status == AttemptStatus.IN_PROGRESS,
        )
    )
    attempt = result.scalar_one_or_none()

    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active attempt not found",
        )

    if not attempt.current_module_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No current module set",
        )

    # Get module with questions
    result = await db.execute(
        select(TestModule)
        .options(selectinload(TestModule.questions).selectinload(Question.passage))
        .where(TestModule.id == attempt.current_module_id)
    )
    module = result.scalar_one_or_none()

    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    # Convert questions to student view (no correct answers)
    questions = sorted(module.questions, key=lambda q: q.question_number)
    student_questions = [
        QuestionStudentView(
            id=q.id,
            question_number=q.question_number,
            question_text=q.question_text,
            question_type=q.question_type,
            question_image_url=q.question_image_url,
            question_image_alt=q.question_image_alt,
            options=q.options,
            answer_constraints=q.answer_constraints,
            passage=q.passage,
        )
        for q in questions
    ]

    # Get time multiplier from attempt config
    config_data = (attempt.domain_breakdown or {}).get("_config", {})
    time_multiplier = config_data.get("time_multiplier", 1.0)
    adjusted_time_limit = int(module.time_limit_minutes * time_multiplier)

    return TestModuleWithQuestions(
        id=module.id,
        test_id=module.test_id,
        section=module.section,
        module=module.module,
        difficulty=module.difficulty,
        time_limit_minutes=adjusted_time_limit,
        order_index=module.order_index,
        created_at=module.created_at,
        updated_at=module.updated_at,
        question_count=len(questions),
        questions=student_questions,
    )


@router.post("/{attempt_id}/submit-module")
async def submit_module(
    attempt_id: int,
    data: SubmitModuleRequest,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Submit answers for a module and move to next or complete test."""
    # Get attempt
    result = await db.execute(
        select(TestAttempt)
        .options(selectinload(TestAttempt.test).selectinload(Test.modules))
        .where(
            TestAttempt.id == attempt_id,
            TestAttempt.user_id == current_user.id,
            TestAttempt.status == AttemptStatus.IN_PROGRESS,
        )
    )
    attempt = result.scalar_one_or_none()

    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active attempt not found")

    # Verify module belongs to this test
    if data.module_id != attempt.current_module_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Module does not match current module",
        )

    # Get module and its questions
    result = await db.execute(
        select(TestModule)
        .options(selectinload(TestModule.questions))
        .where(TestModule.id == data.module_id)
    )
    module = result.scalar_one_or_none()

    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    # Score the answers
    correct_count = 0
    total_count = len(module.questions)
    question_map = {q.id: q for q in module.questions}

    for answer_data in data.answers:
        question = question_map.get(answer_data.question_id)
        if not question:
            continue

        # Check if answer is correct
        is_correct = False
        if answer_data.answer:
            # For MCQ, direct comparison
            # For grid-in, check against all acceptable answers
            is_correct = answer_data.answer in question.correct_answer

        if is_correct:
            correct_count += 1
            question.times_correct += 1
        question.times_answered += 1

        # Save answer
        attempt_answer = AttemptAnswer(
            attempt_id=attempt_id,
            question_id=answer_data.question_id,
            answer=answer_data.answer,
            is_correct=is_correct,
            time_spent_seconds=answer_data.time_spent_seconds,
            is_flagged=answer_data.is_flagged,
        )
        db.add(attempt_answer)

    # Create module result
    module_result = ModuleResult(
        attempt_id=attempt_id,
        module_id=data.module_id,
        correct_count=correct_count,
        total_count=total_count,
        time_spent_seconds=data.time_spent_seconds,
        completed_at=datetime.now(UTC),
    )

    # Determine next module difficulty for adaptive testing (Module 1 -> Module 2)
    if module.module.value == "module_1":
        # Calculate performance percentage
        performance = correct_count / total_count if total_count > 0 else 0

        if performance >= 0.7:
            module_result.next_module_difficulty = ModuleDifficulty.HARDER
        elif performance <= 0.4:
            module_result.next_module_difficulty = ModuleDifficulty.EASIER
        else:
            module_result.next_module_difficulty = ModuleDifficulty.STANDARD

    db.add(module_result)

    # Determine next module or complete test
    current_section = module.section
    current_module_num = module.module
    
    # Check scope from metadata
    config = (attempt.domain_breakdown or {}).get("_config", {})
    scope = config.get("scope", "full")

    next_module = None

    # Logic for finishing based on scope
    should_complete = False
    if scope == "single_module":
        should_complete = True
    elif scope == "rw_only" and current_section == SATSection.READING_WRITING and current_module_num == SATModule.MODULE_2:
        should_complete = True
    elif scope == "math_only" and current_section == SATSection.MATH and current_module_num == SATModule.MODULE_2:
        should_complete = True

    if not should_complete:
        if current_module_num == SATModule.MODULE_1:
            # Move to Module 2 of the SAME section
            target_difficulty = module_result.next_module_difficulty or ModuleDifficulty.STANDARD
            
            result = await db.execute(
                select(TestModule).where(
                    TestModule.test_id == attempt.test_id,
                    TestModule.section == current_section,
                    TestModule.module == SATModule.MODULE_2,
                    TestModule.difficulty == target_difficulty
                )
            )
            next_module = result.scalar_one_or_none()

            if not next_module:
                 result = await db.execute(
                    select(TestModule).where(
                        TestModule.test_id == attempt.test_id,
                        TestModule.section == current_section,
                        TestModule.module == SATModule.MODULE_2
                    ).order_by(TestModule.difficulty)
                 )
                 potential_modules = result.scalars().all()
                 
                 if potential_modules:
                     if target_difficulty == ModuleDifficulty.HARDER:
                         next_module = next((m for m in potential_modules if m.difficulty == ModuleDifficulty.HARDER), potential_modules[0])
                     elif target_difficulty == ModuleDifficulty.EASIER:
                         next_module = next((m for m in potential_modules if m.difficulty == ModuleDifficulty.EASIER), potential_modules[0])
                     else:
                         next_module = potential_modules[0]

        else:
            # We are in Module 2. logic is to move to Module 1 of the NEXT section.
            next_section = None
            if current_section == SATSection.READING_WRITING:
                next_section = SATSection.MATH
            
            if next_section:
                result = await db.execute(
                    select(TestModule).where(
                        TestModule.test_id == attempt.test_id,
                        TestModule.section == next_section,
                        TestModule.module == SATModule.MODULE_1
                    )
                )
                next_module = result.scalar_one_or_none()

    if next_module:
        attempt.current_module_id = next_module.id
        attempt.current_question_number = 1
    else:
        # Complete the test
        attempt.status = AttemptStatus.COMPLETED
        attempt.completed_at = datetime.now(UTC)
        attempt.current_module_id = None

        # Calculate final scores using SAT-like conversion tables
        result = await db.execute(
            select(ModuleResult).where(ModuleResult.attempt_id == attempt_id)
        )
        all_results = result.scalars().all()

        # Get module IDs by section
        # We need all modules to map IDs to sections
        all_modules = attempt.test.modules
        sorted_modules = sorted(
            all_modules,
            key=lambda m: (0 if m.section.value == "reading_writing" else 1, m.order_index)
        )
        
        # Get module IDs by section
        rw_module_ids = [m.id for m in sorted_modules if m.section.value == "reading_writing"]
        math_module_ids = [m.id for m in sorted_modules if m.section.value == "math"]

        rw_correct = sum(r.correct_count for r in all_results if r.module_id in rw_module_ids)
        math_correct = sum(r.correct_count for r in all_results if r.module_id in math_module_ids)

        rw_total = sum(r.total_count for r in all_results if r.module_id in rw_module_ids)
        math_total = sum(r.total_count for r in all_results if r.module_id in math_module_ids)

        # Store raw scores
        attempt.reading_writing_raw_score = rw_correct if rw_total > 0 else None
        attempt.math_raw_score = math_correct if math_total > 0 else None

        # SAT Conversion Tables (approximate, based on typical Digital SAT curves)
        # Format: list of (raw_score_threshold, scaled_score) tuples, descending
        RW_CONVERSION = [
            (54, 800), (52, 780), (50, 760), (48, 740), (46, 720),
            (44, 700), (42, 680), (40, 660), (38, 640), (36, 620),
            (34, 600), (32, 580), (30, 560), (28, 540), (26, 520),
            (24, 500), (22, 480), (20, 460), (18, 440), (16, 420),
            (14, 400), (12, 380), (10, 360), (8, 340), (6, 320),
            (4, 300), (2, 260), (0, 200),
        ]

        MATH_CONVERSION = [
            (44, 800), (42, 780), (40, 750), (38, 720), (36, 690),
            (34, 660), (32, 630), (30, 600), (28, 570), (26, 540),
            (24, 510), (22, 480), (20, 450), (18, 420), (16, 390),
            (14, 360), (12, 330), (10, 300), (8, 280), (6, 260),
            (4, 240), (2, 220), (0, 200),
        ]

        def convert_raw_to_scaled(raw: int, total: int, conversion_table: list) -> int:
            """Convert raw score to scaled score using conversion table."""
            if total == 0:
                return 200
            # Scale raw score to standard question count (54 for RW, 44 for Math)
            standard_total = conversion_table[0][0]  # Max raw score in table
            scaled_raw = int((raw / total) * standard_total) if total > 0 else 0
            
            for threshold, scaled in conversion_table:
                if scaled_raw >= threshold:
                    return scaled
            return 200  # Minimum score

        # Get Module 2 difficulty for score ceiling adjustment
        def get_module2_difficulty(module_ids: list, results: list) -> str | None:
            """Get the difficulty of module 2 for a section."""
            for r in results:
                if r.module_id in module_ids and r.next_module_difficulty:
                    return r.next_module_difficulty.value
            return None

        # Calculate scaled scores
        if rw_total > 0:
            rw_scaled = convert_raw_to_scaled(rw_correct, rw_total, RW_CONVERSION)
            # Apply Module 2 difficulty ceiling
            rw_m2_difficulty = get_module2_difficulty(rw_module_ids, all_results)
            if rw_m2_difficulty == "easier":
                rw_scaled = min(rw_scaled, 660)
            elif rw_m2_difficulty == "standard":
                rw_scaled = min(rw_scaled, 720)
            attempt.reading_writing_scaled_score = rw_scaled

        if math_total > 0:
            math_scaled = convert_raw_to_scaled(math_correct, math_total, MATH_CONVERSION)
            # Apply Module 2 difficulty ceiling
            math_m2_difficulty = get_module2_difficulty(math_module_ids, all_results)
            if math_m2_difficulty == "easier":
                math_scaled = min(math_scaled, 660)
            elif math_m2_difficulty == "standard":
                math_scaled = min(math_scaled, 720)
            attempt.math_scaled_score = math_scaled

        # Calculate total score: sum of both sections (NOT projected)
        rw_score = attempt.reading_writing_scaled_score or 0
        math_score = attempt.math_scaled_score or 0
        
        if rw_score > 0 or math_score > 0:
            attempt.total_score = rw_score + math_score
            # Ensure minimum 200 per section taken, 400 total minimum
            if attempt.total_score < 400:
                attempt.total_score = 400

        # Update analytics
        analytics_service = AnalyticsService(db)
        await analytics_service.record_score_history(attempt)
        await analytics_service.update_student_analytics(current_user.id)

    # Build domain breakdown for this module's questions
    module_domain_stats: dict[str, dict] = {}
    question_results = []
    
    for answer_data in data.answers:
        question = question_map.get(answer_data.question_id)
        if not question:
            continue
        
        # Check correctness (recalculate for response)
        is_correct = answer_data.answer in question.correct_answer if answer_data.answer else False
        
        # Add to question results
        question_results.append({
            "id": question.id,
            "question_number": question.question_number,
            "is_correct": is_correct,
            "correct_answer": question.correct_answer,
            "user_answer": answer_data.answer,
            "domain": question.domain.value if question.domain else None,
        })
        
        # Track domain stats
        if question.domain:
            domain_key = question.domain.value
            if domain_key not in module_domain_stats:
                module_domain_stats[domain_key] = {"correct": 0, "total": 0}
            module_domain_stats[domain_key]["total"] += 1
            if is_correct:
                module_domain_stats[domain_key]["correct"] += 1
    
    # Convert domain stats to list format
    domain_breakdown = []
    for domain_key, stats in module_domain_stats.items():
        accuracy = (stats["correct"] / stats["total"] * 100) if stats["total"] > 0 else 0
        domain_breakdown.append({
            "domain": domain_key,
            "correct": stats["correct"],
            "total": stats["total"],
            "accuracy": round(accuracy, 1)
        })

    return {
        "status": attempt.status.value,
        "module_score": {"correct": correct_count, "total": total_count},
        "section": module.section.value,
        "module_type": module.module.value,
        "domain_breakdown": domain_breakdown,
        "question_results": question_results,
        "next_module_id": attempt.current_module_id,
        "test_completed": attempt.status == AttemptStatus.COMPLETED,
        "total_score": attempt.total_score,
    }


@router.post("/{attempt_id}/abandon")
async def abandon_attempt(
    attempt_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Abandon an in-progress attempt."""
    result = await db.execute(
        select(TestAttempt).where(
            TestAttempt.id == attempt_id,
            TestAttempt.user_id == current_user.id,
            TestAttempt.status == AttemptStatus.IN_PROGRESS,
        )
    )
    attempt = result.scalar_one_or_none()

    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active attempt not found")

    attempt.status = AttemptStatus.ABANDONED
    attempt.completed_at = datetime.now(UTC)

    return {"message": "Attempt abandoned"}


@router.get("/{attempt_id}/review", response_model=AttemptReviewResponse)
async def get_attempt_review(
    attempt_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get full review of a completed attempt with all questions, correct answers,
    user answers, and explanations.
    """
    # Get the attempt with all related data
    result = await db.execute(
        select(TestAttempt)
        .options(
            selectinload(TestAttempt.test).selectinload(Test.modules).selectinload(TestModule.questions).selectinload(Question.passage),
            selectinload(TestAttempt.answers),
            selectinload(TestAttempt.module_results),
        )
        .where(
            TestAttempt.id == attempt_id,
            TestAttempt.user_id == current_user.id,
        )
    )
    attempt = result.scalar_one_or_none()

    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

    if attempt.status not in [AttemptStatus.COMPLETED, AttemptStatus.ABANDONED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only review completed or abandoned attempts"
        )

    # Create a map of user answers by question_id
    user_answers = {a.question_id: a for a in attempt.answers}

    # Get module IDs that were actually used in this attempt
    used_module_ids = {mr.module_id for mr in attempt.module_results}

    # Build module review data
    modules_review = []
    total_correct = 0
    total_questions = 0
    domain_stats: dict[str, dict] = {}

    # Sort modules by section then order
    section_order = {'reading_writing': 0, 'math': 1}
    sorted_modules = sorted(
        [m for m in attempt.test.modules if m.id in used_module_ids],
        key=lambda m: (section_order.get(m.section.value, 99), m.order_index)
    )

    for module in sorted_modules:
        questions_review = []
        sorted_questions = sorted(module.questions, key=lambda q: q.question_number)

        for question in sorted_questions:
            user_answer = user_answers.get(question.id)
            is_correct = user_answer.is_correct if user_answer else None
            answer_value = user_answer.answer if user_answer else None

            # Track stats
            total_questions += 1
            if is_correct:
                total_correct += 1

            # Track domain stats
            if question.domain:
                domain_key = question.domain.value
                if domain_key not in domain_stats:
                    domain_stats[domain_key] = {"correct": 0, "total": 0}
                domain_stats[domain_key]["total"] += 1
                if is_correct:
                    domain_stats[domain_key]["correct"] += 1

            # Build passage response if exists
            passage_data = None
            if question.passage:
                from app.schemas.test import PassageResponse
                passage_data = PassageResponse(
                    id=question.passage.id,
                    title=question.passage.title,
                    content=question.passage.content,
                    source=question.passage.source,
                    author=question.passage.author,
                    word_count=question.passage.word_count,
                    figures=question.passage.figures,
                    genre=question.passage.genre,
                    topic_tags=question.passage.topic_tags,
                    created_at=question.passage.created_at,
                    updated_at=question.passage.updated_at
                )

            questions_review.append(QuestionReviewView(
                id=question.id,
                question_number=question.question_number,
                question_text=question.question_text,
                question_type=question.question_type,
                question_image_url=question.question_image_url,
                question_image_alt=question.question_image_alt,
                options=question.options,
                answer_constraints=question.answer_constraints,
                passage=passage_data,
                correct_answer=question.correct_answer,
                explanation=question.explanation,
                explanation_image_url=question.explanation_image_url,
                user_answer=answer_value,
                is_correct=is_correct,
                domain=question.domain,
                difficulty=question.difficulty,
                time_spent_seconds=user_answer.time_spent_seconds if user_answer else None
            ))

        modules_review.append(ModuleReviewResponse(
            module_id=module.id,
            section=module.section.value,
            module_type=module.module.value,
            difficulty=module.difficulty.value,
            questions=questions_review
        ))

    # Build summary with domain breakdown
    domain_breakdown = {}
    for domain_key, stats in domain_stats.items():
        accuracy = (stats["correct"] / stats["total"] * 100) if stats["total"] > 0 else 0
        domain_breakdown[domain_key] = {
            "correct": stats["correct"],
            "total": stats["total"],
            "accuracy": round(accuracy, 1)
        }

    summary = {
        "total_correct": total_correct,
        "total_questions": total_questions,
        "accuracy": round((total_correct / total_questions * 100) if total_questions > 0 else 0, 1),
        "by_domain": domain_breakdown
    }

    return AttemptReviewResponse(
        attempt_id=attempt.id,
        test_id=attempt.test_id,
        test_title=attempt.test.title,
        status=attempt.status.value,
        started_at=attempt.started_at,
        completed_at=attempt.completed_at,
        total_score=attempt.total_score,
        reading_writing_scaled_score=attempt.reading_writing_scaled_score,
        math_scaled_score=attempt.math_scaled_score,
        modules=modules_review,
        summary=summary
    )


@router.post("/{attempt_id}/practice-wrong")
async def create_practice_from_wrong(
    attempt_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Create a new practice attempt using only the questions the user got wrong
    in a previous attempt.
    """
    # Get the original attempt
    result = await db.execute(
        select(TestAttempt)
        .options(
            selectinload(TestAttempt.test),
            selectinload(TestAttempt.answers),
        )
        .where(
            TestAttempt.id == attempt_id,
            TestAttempt.user_id == current_user.id,
            TestAttempt.status == AttemptStatus.COMPLETED,
        )
    )
    original_attempt = result.scalar_one_or_none()

    if not original_attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Completed attempt not found")

    # Get wrong answer question IDs
    wrong_question_ids = [
        a.question_id for a in original_attempt.answers
        if a.is_correct is False
    ]

    if not wrong_question_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No wrong answers to practice"
        )

    # Return info about the practice session
    # Note: For a full implementation, you would create a special practice attempt
    # with just these questions. For now, return the question IDs for the frontend
    # to handle practice mode.
    return {
        "original_attempt_id": attempt_id,
        "wrong_question_ids": wrong_question_ids,
        "question_count": len(wrong_question_ids),
        "message": f"Found {len(wrong_question_ids)} questions to practice"
    }
@router.delete("/{attempt_id}")
async def delete_attempt(
    attempt_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a test attempt and all its associated data."""
    result = await db.execute(
        select(TestAttempt).where(
            TestAttempt.id == attempt_id,
            TestAttempt.user_id == current_user.id,
        )
    )
    attempt = result.scalar_one_or_none()

    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attempt not found"
        )

    await db.delete(attempt)
    await db.commit()

    return {"message": "Attempt deleted successfully"}
