"""
Analytics endpoints for students, teachers, and admins.
"""

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import ActiveUser, AdminUser, TeacherOrAdmin
from app.models import (
    Leaderboard,
    Notification,
    PlatformAnalytics,
    ScoreHistory,
    StudentAnalytics,
    StudyPlan,
    StudyPlanTask,
    TestAttempt,
    User,
)
from app.models.enums import AttemptStatus
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["Analytics"])


# === Public Stats ===


@router.get("/public/stats")
async def get_public_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get public platform stats (no auth required)."""
    total_users = (await db.execute(
        select(func.count()).select_from(User)
    )).scalar() or 0

    tests_completed = (await db.execute(
        select(func.count()).select_from(TestAttempt)
        .where(TestAttempt.status == AttemptStatus.COMPLETED)
    )).scalar() or 0

    avg_score_result = (await db.execute(
        select(func.avg(TestAttempt.total_score))
        .where(
            TestAttempt.status == AttemptStatus.COMPLETED,
            TestAttempt.total_score.isnot(None),
        )
    )).scalar()

    return {
        "total_users": total_users,
        "tests_completed": tests_completed,
        "avg_score": round(avg_score_result, 0) if avg_score_result else None,
    }


# === Student Analytics ===


@router.get("/me")
async def get_my_analytics(
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get current user's analytics dashboard."""
    service = AnalyticsService(db)
    return await service.get_student_dashboard_stats(current_user.id)


@router.get("/me/score-history")
async def get_my_score_history(
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(20, ge=1, le=100),
):
    """Get score progression history."""
    result = await db.execute(
        select(ScoreHistory)
        .where(ScoreHistory.user_id == current_user.id)
        .order_by(ScoreHistory.recorded_at.desc())
        .limit(limit)
    )
    scores = result.scalars().all()

    return {
        "scores": [
            {
                "id": s.id,
                "test_attempt_id": s.test_attempt_id,
                "total_score": s.total_score,
                "reading_writing_score": s.reading_writing_score,
                "math_score": s.math_score,
                "recorded_at": s.recorded_at.isoformat(),
            }
            for s in scores
        ]
    }


@router.get("/me/domain-performance")
async def get_my_domain_performance(
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get performance breakdown by domain."""
    result = await db.execute(
        select(StudentAnalytics).where(StudentAnalytics.user_id == current_user.id)
    )
    analytics = result.scalar_one_or_none()

    if not analytics or not analytics.domain_performance:
        return []

    domain_list = []
    for domain_key, stats in analytics.domain_performance.items():
        domain_list.append({
            "domain": domain_key,
            "total": stats.get("count", 0),
            "correct": stats.get("correct", 0),
            "percentage": round(stats.get("accuracy", 0) * 100, 1)
        })

    return sorted(domain_list, key=lambda x: x["domain"])


@router.post("/me/refresh")
async def refresh_my_analytics(
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Force refresh of analytics."""
    service = AnalyticsService(db)
    analytics = await service.update_student_analytics(current_user.id)
    return {"message": "Analytics refreshed", "last_calculated_at": analytics.last_calculated_at}


# === Leaderboard ===


@router.get("/leaderboard")
async def get_leaderboard(
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    scope_type: str = Query("global", regex="^(global|org|class)$"),
    scope_id: int | None = None,
    period_type: str = Query("weekly", regex="^(weekly|monthly|alltime)$"),
    limit: int = Query(50, ge=1, le=100),
):
    """Get leaderboard rankings."""
    query = select(Leaderboard, User).join(User, User.id == Leaderboard.user_id)

    query = query.where(
        Leaderboard.scope_type == scope_type,
        Leaderboard.period_type == period_type,
    )

    if scope_id:
        query = query.where(Leaderboard.scope_id == scope_id)

    query = query.order_by(Leaderboard.rank).limit(limit)

    result = await db.execute(query)
    entries = result.all()

    # Find current user's rank
    user_rank = None
    for entry in entries:
        if entry.Leaderboard.user_id == current_user.id:
            user_rank = entry.Leaderboard.rank
            break

    return {
        "leaderboard": [
            {
                "rank": e.Leaderboard.rank,
                "user_id": e.Leaderboard.user_id,
                "user_name": e.User.full_name or "Anonymous",
                "avatar_url": e.User.avatar_url,
                "score": e.Leaderboard.score,
                "tests_completed": e.Leaderboard.tests_completed,
                "average_accuracy": e.Leaderboard.average_accuracy,
            }
            for e in entries
        ],
        "my_rank": user_rank,
        "scope_type": scope_type,
        "period_type": period_type,
    }


# === Notifications ===


@router.get("/notifications")
async def get_notifications(
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    unread_only: bool = False,
    limit: int = Query(50, ge=1, le=100),
):
    """Get user's notifications."""
    query = select(Notification).where(Notification.user_id == current_user.id)

    if unread_only:
        query = query.where(Notification.is_read == False)  # noqa: E712

    query = query.order_by(Notification.created_at.desc()).limit(limit)

    result = await db.execute(query)
    notifications = result.scalars().all()

    # Count unread
    unread_count = await db.execute(
        select(func.count())
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False  # noqa: E712
        )
    )

    return {
        "notifications": [
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "type": n.notification_type,
                "action_url": n.action_url,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat(),
            }
            for n in notifications
        ],
        "unread_count": unread_count.scalar() or 0,
    }


@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Mark a notification as read."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    notification = result.scalar_one_or_none()

    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    notification.is_read = True
    notification.read_at = datetime.now(UTC)

    return {"message": "Marked as read"}


@router.post("/notifications/read-all")
async def mark_all_notifications_read(
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Mark all notifications as read."""
    result = await db.execute(
        select(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False  # noqa: E712
        )
    )
    notifications = result.scalars().all()

    now = datetime.now(UTC)
    for n in notifications:
        n.is_read = True
        n.read_at = now

    return {"message": f"Marked {len(notifications)} notifications as read"}


# === Study Plans ===


@router.get("/study-plans")
async def get_my_study_plans(
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get user's study plans."""
    result = await db.execute(
        select(StudyPlan)
        .where(StudyPlan.user_id == current_user.id)
        .order_by(StudyPlan.created_at.desc())
    )
    plans = result.scalars().all()

    return {
        "plans": [
            {
                "id": p.id,
                "title": p.title,
                "description": p.description,
                "target_score": p.target_score,
                "target_date": p.target_date.isoformat() if p.target_date else None,
                "total_tasks": p.total_tasks,
                "completed_tasks": p.completed_tasks,
                "progress_percent": (p.completed_tasks / p.total_tasks * 100) if p.total_tasks > 0 else 0,
                "is_active": p.is_active,
                "is_ai_generated": p.is_ai_generated,
            }
            for p in plans
        ]
    }


@router.get("/study-plans/{plan_id}")
async def get_study_plan(
    plan_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get study plan with tasks."""
    result = await db.execute(
        select(StudyPlan).where(
            StudyPlan.id == plan_id,
            StudyPlan.user_id == current_user.id,
        )
    )
    plan = result.scalar_one_or_none()

    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Study plan not found")

    # Get tasks
    result = await db.execute(
        select(StudyPlanTask)
        .where(StudyPlanTask.study_plan_id == plan_id)
        .order_by(StudyPlanTask.order_index)
    )
    tasks = result.scalars().all()

    return {
        "plan": {
            "id": plan.id,
            "title": plan.title,
            "description": plan.description,
            "target_score": plan.target_score,
            "target_date": plan.target_date.isoformat() if plan.target_date else None,
            "focus_domains": plan.focus_domains,
            "focus_skills": plan.focus_skills,
            "weekly_schedule": plan.weekly_schedule,
            "total_tasks": plan.total_tasks,
            "completed_tasks": plan.completed_tasks,
            "is_active": plan.is_active,
        },
        "tasks": [
            {
                "id": t.id,
                "title": t.title,
                "description": t.description,
                "task_type": t.task_type,
                "target_id": t.target_id,
                "due_date": t.due_date.isoformat() if t.due_date else None,
                "day_of_week": t.day_of_week,
                "estimated_minutes": t.estimated_minutes,
                "is_completed": t.is_completed,
                "completed_at": t.completed_at.isoformat() if t.completed_at else None,
                "domain": t.domain,
                "skills": t.skills,
            }
            for t in tasks
        ],
    }


@router.post("/study-plans/{plan_id}/tasks/{task_id}/complete")
async def complete_study_plan_task(
    plan_id: int,
    task_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Mark a study plan task as complete."""
    # Verify plan belongs to user
    result = await db.execute(
        select(StudyPlan).where(
            StudyPlan.id == plan_id,
            StudyPlan.user_id == current_user.id,
        )
    )
    plan = result.scalar_one_or_none()

    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Study plan not found")

    # Get task
    result = await db.execute(
        select(StudyPlanTask).where(
            StudyPlanTask.id == task_id,
            StudyPlanTask.study_plan_id == plan_id,
        )
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if not task.is_completed:
        task.is_completed = True
        task.completed_at = datetime.now(UTC)
        plan.completed_tasks += 1

    return {"message": "Task completed", "completed_tasks": plan.completed_tasks}


# === Teacher/Admin Analytics ===


@router.get("/students/{student_id}")
async def get_student_analytics(
    student_id: int,
    admin: TeacherOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get analytics for a specific student (teacher/admin only)."""
    service = AnalyticsService(db)
    return await service.get_student_dashboard_stats(student_id)


@router.get("/platform")
async def get_platform_analytics(
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    period_type: str = Query("daily", regex="^(daily|weekly|monthly)$"),
    days: int = Query(30, ge=1, le=365),
):
    """Get platform-wide analytics (admin only)."""
    start_date = datetime.now(UTC) - timedelta(days=days)

    result = await db.execute(
        select(PlatformAnalytics)
        .where(
            PlatformAnalytics.period_type == period_type,
            PlatformAnalytics.period_start >= start_date,
            PlatformAnalytics.organization_id.is_(None),  # Platform-wide
        )
        .order_by(PlatformAnalytics.period_start)
    )
    analytics = result.scalars().all()

    # Current totals
    total_users = await db.execute(select(func.count()).select_from(User))
    active_users = await db.execute(
        select(func.count())
        .select_from(User)
        .where(User.is_active == True)  # noqa: E712
    )
    tests_completed = await db.execute(
        select(func.count())
        .select_from(TestAttempt)
        .where(TestAttempt.status == AttemptStatus.COMPLETED)
    )

    return {
        "current": {
            "total_users": total_users.scalar() or 0,
            "active_users": active_users.scalar() or 0,
            "tests_completed": tests_completed.scalar() or 0,
        },
        "history": [
            {
                "period_start": a.period_start.isoformat(),
                "period_end": a.period_end.isoformat(),
                "new_users": a.new_users,
                "active_users": a.active_users,
                "tests_started": a.tests_started,
                "tests_completed": a.tests_completed,
                "average_score": a.average_score,
                "total_study_minutes": a.total_study_minutes,
            }
            for a in analytics
        ],
    }


@router.get("/platform/score-distribution")
async def get_score_distribution(
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get distribution of scores across the platform."""
    result = await db.execute(
        select(TestAttempt.total_score)
        .where(
            TestAttempt.status == AttemptStatus.COMPLETED,
            TestAttempt.total_score.isnot(None),
        )
    )
    scores = [row[0] for row in result]

    if not scores:
        return {"distribution": {}, "stats": {}}

    # Create distribution buckets
    buckets = {
        "400-600": 0,
        "600-800": 0,
        "800-1000": 0,
        "1000-1200": 0,
        "1200-1400": 0,
        "1400-1600": 0,
    }

    for score in scores:
        if score < 600:
            buckets["400-600"] += 1
        elif score < 800:
            buckets["600-800"] += 1
        elif score < 1000:
            buckets["800-1000"] += 1
        elif score < 1200:
            buckets["1000-1200"] += 1
        elif score < 1400:
            buckets["1200-1400"] += 1
        else:
            buckets["1400-1600"] += 1

    return {
        "distribution": buckets,
        "stats": {
            "count": len(scores),
            "average": sum(scores) / len(scores),
            "min": min(scores),
            "max": max(scores),
            "median": sorted(scores)[len(scores) // 2],
        },
    }


# === Enhanced Admin Analytics ===


@router.get("/admin/dashboard")
async def get_admin_dashboard(
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get comprehensive admin dashboard data."""
    from app.models import Test, Question

    now = datetime.now(UTC)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)

    # User stats
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    active_users = (await db.execute(
        select(func.count()).select_from(User).where(User.is_active == True)  # noqa: E712
    )).scalar() or 0
    new_users_week = (await db.execute(
        select(func.count()).select_from(User).where(User.created_at >= week_ago)
    )).scalar() or 0
    new_users_month = (await db.execute(
        select(func.count()).select_from(User).where(User.created_at >= month_ago)
    )).scalar() or 0

    # Test stats
    total_tests = (await db.execute(select(func.count()).select_from(Test))).scalar() or 0
    published_tests = (await db.execute(
        select(func.count()).select_from(Test).where(Test.is_published == True)  # noqa: E712
    )).scalar() or 0

    # Attempt stats
    total_attempts = (await db.execute(
        select(func.count()).select_from(TestAttempt)
    )).scalar() or 0
    completed_attempts = (await db.execute(
        select(func.count()).select_from(TestAttempt)
        .where(TestAttempt.status == AttemptStatus.COMPLETED)
    )).scalar() or 0
    attempts_this_week = (await db.execute(
        select(func.count()).select_from(TestAttempt)
        .where(TestAttempt.started_at >= week_ago)
    )).scalar() or 0

    # Average score
    avg_score_result = await db.execute(
        select(func.avg(TestAttempt.total_score))
        .where(TestAttempt.total_score.isnot(None))
    )
    avg_score = avg_score_result.scalar()

    # Completion rate
    completion_rate = (completed_attempts / total_attempts * 100) if total_attempts > 0 else 0

    # Recent activity (last 10 completed tests)
    recent_result = await db.execute(
        select(TestAttempt, User, Test)
        .join(User, User.id == TestAttempt.user_id)
        .join(Test, Test.id == TestAttempt.test_id)
        .where(TestAttempt.status == AttemptStatus.COMPLETED)
        .order_by(TestAttempt.completed_at.desc())
        .limit(10)
    )
    recent_activity = [
        {
            "user_name": row.User.full_name or row.User.email,
            "test_title": row.Test.title,
            "score": row.TestAttempt.total_score,
            "completed_at": row.TestAttempt.completed_at.isoformat() if row.TestAttempt.completed_at else None,
        }
        for row in recent_result
    ]

    # Top performers (last 30 days)
    top_performers_result = await db.execute(
        select(User, func.max(TestAttempt.total_score).label("best_score"))
        .join(TestAttempt, TestAttempt.user_id == User.id)
        .where(
            TestAttempt.status == AttemptStatus.COMPLETED,
            TestAttempt.completed_at >= month_ago,
        )
        .group_by(User.id)
        .order_by(func.max(TestAttempt.total_score).desc())
        .limit(10)
    )
    top_performers = [
        {
            "user_id": row.User.id,
            "user_name": row.User.full_name or row.User.email,
            "best_score": row.best_score,
        }
        for row in top_performers_result
    ]

    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "new_this_week": new_users_week,
            "new_this_month": new_users_month,
        },
        "tests": {
            "total": total_tests,
            "published": published_tests,
        },
        "attempts": {
            "total": total_attempts,
            "completed": completed_attempts,
            "this_week": attempts_this_week,
            "completion_rate": round(completion_rate, 1),
        },
        "scores": {
            "average": round(avg_score, 0) if avg_score else None,
        },
        "recent_activity": recent_activity,
        "top_performers": top_performers,
    }


@router.get("/admin/users")
async def get_admin_users_analytics(
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(30, ge=1, le=365),
):
    """Get user growth and engagement analytics for charts."""
    now = datetime.now(UTC)
    start_date = now - timedelta(days=days)

    # Daily new user counts
    daily_users = []
    for i in range(days):
        day_start = (now - timedelta(days=days - 1 - i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        count = (await db.execute(
            select(func.count()).select_from(User)
            .where(User.created_at >= day_start, User.created_at < day_end)
        )).scalar() or 0

        daily_users.append({
            "date": day_start.date().isoformat(),
            "count": count,
        })

    # User role distribution
    role_counts = {}
    for role in ["student", "teacher", "admin"]:
        count = (await db.execute(
            select(func.count()).select_from(User).where(User.role == role)
        )).scalar() or 0
        role_counts[role] = count

    # Cumulative user growth
    cumulative = []
    running_total = (await db.execute(
        select(func.count()).select_from(User).where(User.created_at < start_date)
    )).scalar() or 0

    for day_data in daily_users:
        running_total += day_data["count"]
        cumulative.append({
            "date": day_data["date"],
            "total": running_total,
        })

    return {
        "daily_signups": daily_users,
        "cumulative_growth": cumulative,
        "role_distribution": role_counts,
    }


@router.get("/admin/tests")
async def get_admin_tests_analytics(
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get test performance analytics."""
    from app.models import Test, Question

    # Most popular tests (by attempt count)
    popular_tests_result = await db.execute(
        select(Test, func.count(TestAttempt.id).label("attempt_count"))
        .join(TestAttempt, TestAttempt.test_id == Test.id)
        .group_by(Test.id)
        .order_by(func.count(TestAttempt.id).desc())
        .limit(10)
    )
    popular_tests = [
        {
            "test_id": row.Test.id,
            "title": row.Test.title,
            "test_type": row.Test.test_type.value,
            "attempt_count": row.attempt_count,
        }
        for row in popular_tests_result
    ]

    # Test completion rates
    completion_rates = []
    tests_result = await db.execute(select(Test).where(Test.is_published == True).limit(20))  # noqa: E712
    for test in tests_result.scalars():
        total = (await db.execute(
            select(func.count()).select_from(TestAttempt)
            .where(TestAttempt.test_id == test.id)
        )).scalar() or 0
        completed = (await db.execute(
            select(func.count()).select_from(TestAttempt)
            .where(TestAttempt.test_id == test.id, TestAttempt.status == AttemptStatus.COMPLETED)
        )).scalar() or 0

        if total > 0:
            completion_rates.append({
                "test_id": test.id,
                "title": test.title,
                "total_attempts": total,
                "completed": completed,
                "rate": round(completed / total * 100, 1),
            })

    # Most difficult questions (lowest accuracy) - using precomputed stats
    difficult_questions = []
    questions_result = await db.execute(
        select(Question)
        .where(Question.times_answered >= 5)  # At least 5 attempts
        .order_by((Question.times_correct * 1.0 / Question.times_answered))
        .limit(10)
    )
    for q in questions_result.scalars():
        accuracy = (q.times_correct / q.times_answered * 100) if q.times_answered > 0 else 0
        difficult_questions.append({
            "question_id": q.id,
            "question_number": q.question_number,
            "domain": q.domain.value if q.domain else None,
            "times_answered": q.times_answered,
            "accuracy": round(accuracy, 1),
        })

    return {
        "popular_tests": popular_tests,
        "completion_rates": completion_rates,
        "difficult_questions": difficult_questions,
    }


@router.get("/admin/trends")
async def get_admin_trends(
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(30, ge=7, le=365),
):
    """Get historical trend data for charts."""
    now = datetime.now(UTC)

    # Daily data for charts
    daily_data = []
    for i in range(days):
        day_start = (now - timedelta(days=days - 1 - i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        # Tests completed that day
        tests_completed = (await db.execute(
            select(func.count()).select_from(TestAttempt)
            .where(
                TestAttempt.completed_at >= day_start,
                TestAttempt.completed_at < day_end,
                TestAttempt.status == AttemptStatus.COMPLETED,
            )
        )).scalar() or 0

        # Average score that day
        avg_score = (await db.execute(
            select(func.avg(TestAttempt.total_score))
            .where(
                TestAttempt.completed_at >= day_start,
                TestAttempt.completed_at < day_end,
                TestAttempt.status == AttemptStatus.COMPLETED,
            )
        )).scalar()

        # New users that day
        new_users = (await db.execute(
            select(func.count()).select_from(User)
            .where(User.created_at >= day_start, User.created_at < day_end)
        )).scalar() or 0

        daily_data.append({
            "date": day_start.date().isoformat(),
            "tests_completed": tests_completed,
            "average_score": round(avg_score, 0) if avg_score else None,
            "new_users": new_users,
        })

    return {
        "daily": daily_data,
        "period_days": days,
    }


@router.get("/admin/score-analytics")
async def get_score_analytics(
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    start_date: str | None = None,
    end_date: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    min_score: int | None = None,
    max_score: int | None = None,
    test_id: int | None = None,
    user_id: int | None = None,
    user_search: str | None = None,
    sort_by: str = Query("completed_at", regex="^(completed_at|total_score|user_name)$"),
    sort_order: str = Query("desc", regex="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """Get detailed score analytics with filtering and pagination."""
    from app.models import Test

    # Build base query
    query = (
        select(TestAttempt, User, Test)
        .join(User, User.id == TestAttempt.user_id)
        .join(Test, Test.id == TestAttempt.test_id)
        .where(TestAttempt.status == AttemptStatus.COMPLETED)
    )

    # Apply date range filters (YYYY-MM-DD format)
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=UTC)
            query = query.where(TestAttempt.completed_at >= start_dt)
        except ValueError:
            pass

    if end_date:
        try:
            # End of day for end_date
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59, tzinfo=UTC
            )
            query = query.where(TestAttempt.completed_at <= end_dt)
        except ValueError:
            pass

    # Apply time-of-day filters (HH:mm format) - filters by hour of completion
    if start_time:
        try:
            start_hour, start_minute = map(int, start_time.split(":"))
            # Filter where the hour of completed_at >= start_hour
            query = query.where(
                func.extract("hour", TestAttempt.completed_at) * 60
                + func.extract("minute", TestAttempt.completed_at)
                >= start_hour * 60 + start_minute
            )
        except (ValueError, AttributeError):
            pass

    if end_time:
        try:
            end_hour, end_minute = map(int, end_time.split(":"))
            # Filter where the hour of completed_at <= end_hour
            query = query.where(
                func.extract("hour", TestAttempt.completed_at) * 60
                + func.extract("minute", TestAttempt.completed_at)
                <= end_hour * 60 + end_minute
            )
        except (ValueError, AttributeError):
            pass

    if min_score is not None:
        query = query.where(TestAttempt.total_score >= min_score)

    if max_score is not None:
        query = query.where(TestAttempt.total_score <= max_score)

    if test_id:
        query = query.where(TestAttempt.test_id == test_id)

    if user_id:
        query = query.where(TestAttempt.user_id == user_id)

    if user_search:
        search_pattern = f"%{user_search}%"
        query = query.where(
            (User.full_name.ilike(search_pattern)) | (User.email.ilike(search_pattern))
        )

    # Get total count for pagination
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Apply sorting
    if sort_by == "completed_at":
        order_col = TestAttempt.completed_at
    elif sort_by == "total_score":
        order_col = TestAttempt.total_score
    else:  # user_name
        order_col = User.full_name

    if sort_order == "desc":
        query = query.order_by(order_col.desc().nulls_last())
    else:
        query = query.order_by(order_col.asc().nulls_last())

    # Apply pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    rows = result.all()

    # Build items
    items = []
    for row in rows:
        attempt = row.TestAttempt
        user = row.User
        test = row.Test

        time_taken = None
        if attempt.started_at and attempt.completed_at:
            delta = attempt.completed_at - attempt.started_at
            time_taken = int(delta.total_seconds() / 60)

        items.append({
            "user_id": user.id,
            "user_name": user.full_name or user.email,
            "user_email": user.email,
            "test_id": test.id,
            "test_title": test.title,
            "total_score": attempt.total_score,
            "reading_writing_score": attempt.reading_writing_scaled_score,
            "math_score": attempt.math_scaled_score,
            "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
            "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
            "time_taken_minutes": time_taken,
        })

    # Calculate summary statistics
    summary_query = (
        select(
            func.count(TestAttempt.id).label("total"),
            func.avg(TestAttempt.total_score).label("avg"),
            func.max(TestAttempt.total_score).label("max"),
            func.min(TestAttempt.total_score).label("min"),
            func.count(func.distinct(TestAttempt.user_id)).label("unique_users"),
        )
        .where(TestAttempt.status == AttemptStatus.COMPLETED)
    )
    summary_result = await db.execute(summary_query)
    summary_row = summary_result.one()

    total_pages = (total + page_size - 1) // page_size

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "summary": {
            "total_attempts": summary_row.total or 0,
            "average_score": round(summary_row.avg, 0) if summary_row.avg else None,
            "highest_score": summary_row.max,
            "lowest_score": summary_row.min,
            "unique_users": summary_row.unique_users or 0,
        },
    }
