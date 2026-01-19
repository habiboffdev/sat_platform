"""
Analytics service for calculating and updating student/platform analytics.
"""

from datetime import UTC, datetime, timedelta
from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    AttemptAnswer,
    DomainProgress,
    Question,
    ScoreHistory,
    StudentAnalytics,
    StudySession,
    TestAttempt,
    User,
)
from app.models.enums import AttemptStatus


class AnalyticsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def update_student_analytics(self, user_id: int) -> StudentAnalytics:
        """
        Recalculate and update all analytics for a student.
        Called after test completion or periodically.
        """
        # Get or create analytics record
        result = await self.db.execute(
            select(StudentAnalytics).where(StudentAnalytics.user_id == user_id)
        )
        analytics = result.scalar_one_or_none()

        if not analytics:
            analytics = StudentAnalytics(user_id=user_id)
            self.db.add(analytics)

        # Get all completed attempts
        result = await self.db.execute(
            select(TestAttempt)
            .where(
                TestAttempt.user_id == user_id,
                TestAttempt.status == AttemptStatus.COMPLETED,
            )
            .options(selectinload(TestAttempt.answers))
            .order_by(TestAttempt.completed_at)
        )
        all_attempts = result.scalars().all()
        
        # Filter for full tests only for aggregate analytics
        attempts = [
            a for a in all_attempts 
            if (not a.domain_breakdown) or (a.domain_breakdown.get("_config", {}).get("scope", "full") == "full")
        ]

        if not attempts:
            return analytics

        # Basic stats
        analytics.total_tests_taken = len(attempts)

        # Score progression
        scores = [a.total_score for a in attempts if a.total_score]
        if scores:
            analytics.first_score = scores[0]
            analytics.latest_score = scores[-1]
            analytics.highest_score = max(scores)
            analytics.average_score = sum(scores) / len(scores)
            analytics.score_improvement = scores[-1] - scores[0]

        # Section averages
        rw_scores = [a.reading_writing_scaled_score for a in attempts if a.reading_writing_scaled_score]
        math_scores = [a.math_scaled_score for a in attempts if a.math_scaled_score]

        if rw_scores:
            analytics.reading_writing_avg = sum(rw_scores) / len(rw_scores)
        if math_scores:
            analytics.math_avg = sum(math_scores) / len(math_scores)

        # Get valid active attempt IDs for filtering nested calculations
        attempt_ids = [a.id for a in attempts]

        # Calculate domain performance
        domain_stats = await self._calculate_domain_performance(user_id, attempt_ids)
        analytics.domain_performance = domain_stats

        # Identify weak and strong areas
        sorted_domains = sorted(
            domain_stats.items(),
            key=lambda x: x[1].get("accuracy", 0)
        )

        analytics.weak_domains = [d[0] for d in sorted_domains[:3] if d[1].get("count", 0) >= 5]
        analytics.strong_domains = [d[0] for d in sorted_domains[-3:] if d[1].get("count", 0) >= 5]

        # Calculate skill performance
        skill_stats = await self._calculate_skill_performance(user_id, attempt_ids)
        analytics.skill_performance = skill_stats

        sorted_skills = sorted(
            skill_stats.items(),
            key=lambda x: x[1].get("accuracy", 0)
        )
        analytics.weak_skills = [s[0] for s in sorted_skills[:5] if s[1].get("count", 0) >= 3]
        analytics.strong_skills = [s[0] for s in sorted_skills[-5:] if s[1].get("count", 0) >= 3]

        # Time analytics
        total_questions = sum(len(a.answers) if hasattr(a, 'answers') else 0 for a in attempts)
        analytics.total_questions_answered = total_questions

        # Study time from sessions
        result = await self.db.execute(
            select(func.sum(StudySession.duration_minutes))
            .where(StudySession.user_id == user_id)
        )
        total_study_time = result.scalar() or 0
        analytics.total_study_time_minutes = total_study_time

        # Calculate streak
        analytics.current_streak_days = await self._calculate_current_streak(user_id)
        analytics.longest_streak_days = max(
            analytics.longest_streak_days or 0,
            analytics.current_streak_days
        )

        # Last activity
        analytics.last_activity_date = attempts[-1].completed_at if attempts else None

        # Predicted score (simple linear regression)
        if len(scores) >= 3:
            # Use last 5 scores for trend
            recent_scores = scores[-5:]
            avg_improvement = sum(
                recent_scores[i+1] - recent_scores[i]
                for i in range(len(recent_scores) - 1)
            ) / (len(recent_scores) - 1)
            analytics.predicted_score = min(1600, max(400, int(scores[-1] + avg_improvement * 2)))

        analytics.last_calculated_at = datetime.now(UTC)

        return analytics

    async def _calculate_domain_performance(self, user_id: int, attempt_ids: list[int] | None = None) -> dict:
        """Calculate accuracy per domain."""
        query = select(
            Question.domain,
            func.count(AttemptAnswer.id).label("total"),
            func.sum(func.cast(AttemptAnswer.is_correct, Integer)).label("correct")
        ).join(AttemptAnswer, AttemptAnswer.question_id == Question.id).join(
            TestAttempt, TestAttempt.id == AttemptAnswer.attempt_id
        ).where(
            TestAttempt.user_id == user_id,
            Question.domain.isnot(None)
        )

        if attempt_ids is not None:
            query = query.where(TestAttempt.id.in_(attempt_ids))
        elif attempt_ids == []:
            return {}

        result = await self.db.execute(query.group_by(Question.domain))

        domain_stats = {}
        for row in result:
            if row.domain:
                domain_stats[row.domain.value] = {
                    "count": row.total,
                    "correct": row.correct or 0,
                    "accuracy": (row.correct or 0) / row.total if row.total > 0 else 0
                }

        return domain_stats

    async def _calculate_skill_performance(self, user_id: int, attempt_ids: list[int] | None = None) -> dict:
        """Calculate accuracy per skill tag."""
        query = select(Question, AttemptAnswer.is_correct).join(
            AttemptAnswer, AttemptAnswer.question_id == Question.id
        ).join(
            TestAttempt, TestAttempt.id == AttemptAnswer.attempt_id
        ).where(
            TestAttempt.user_id == user_id,
            Question.skill_tags.isnot(None)
        )

        if attempt_ids is not None:
            query = query.where(TestAttempt.id.in_(attempt_ids))
        elif attempt_ids == []:
            return {}

        result = await self.db.execute(query)

        skill_stats = defaultdict(lambda: {"count": 0, "correct": 0})

        for question, is_correct in result:
            if question.skill_tags:
                for skill in question.skill_tags:
                    skill_stats[skill]["count"] += 1
                    if is_correct:
                        skill_stats[skill]["correct"] += 1

        # Calculate accuracy
        for skill in skill_stats:
            count = skill_stats[skill]["count"]
            correct = skill_stats[skill]["correct"]
            skill_stats[skill]["accuracy"] = correct / count if count > 0 else 0

        return dict(skill_stats)

    async def _calculate_current_streak(self, user_id: int) -> int:
        """Calculate current consecutive days with activity."""
        result = await self.db.execute(
            select(func.date(StudySession.started_at).distinct())
            .where(StudySession.user_id == user_id)
            .order_by(func.date(StudySession.started_at).desc())
        )
        dates = [row[0] for row in result]

        if not dates:
            return 0

        today = datetime.now(UTC).date()
        if dates[0] < today - timedelta(days=1):
            return 0  # Streak broken

        streak = 1
        for i in range(len(dates) - 1):
            if dates[i] - dates[i + 1] == timedelta(days=1):
                streak += 1
            else:
                break

        return streak

    async def record_study_session(
        self,
        user_id: int,
        activity_type: str,
        duration_minutes: int,
        test_attempt_id: int | None = None,
        content_id: int | None = None,
        questions_answered: int = 0,
        questions_correct: int = 0,
    ) -> StudySession:
        """Record a study session."""
        session = StudySession(
            user_id=user_id,
            started_at=datetime.now(UTC) - timedelta(minutes=duration_minutes),
            ended_at=datetime.now(UTC),
            duration_minutes=duration_minutes,
            activity_type=activity_type,
            test_attempt_id=test_attempt_id,
            content_id=content_id,
            questions_answered=questions_answered,
            questions_correct=questions_correct,
        )
        self.db.add(session)
        return session

    async def record_score_history(self, attempt: TestAttempt) -> ScoreHistory:
        """Record score in history for trend tracking."""
        history = ScoreHistory(
            user_id=attempt.user_id,
            test_attempt_id=attempt.id,
            total_score=attempt.total_score,
            reading_writing_score=attempt.reading_writing_scaled_score,
            math_score=attempt.math_scaled_score,
        )
        self.db.add(history)
        return history

    async def update_domain_progress(self, user_id: int, domain: str, section: str, is_correct: bool):
        """Update rolling domain progress."""
        result = await self.db.execute(
            select(DomainProgress).where(
                DomainProgress.user_id == user_id,
                DomainProgress.domain == domain
            )
        )
        progress = result.scalar_one_or_none()

        if not progress:
            progress = DomainProgress(
                user_id=user_id,
                domain=domain,
                section=section,
                recent_results=[]
            )
            self.db.add(progress)

        progress.total_questions += 1
        if is_correct:
            progress.correct_answers += 1

        progress.accuracy = progress.correct_answers / progress.total_questions

        # Update recent results (keep last 10)
        recent = progress.recent_results or []
        recent.append(is_correct)
        progress.recent_results = recent[-10:]

        # Calculate trend
        if len(recent) >= 5:
            first_half = sum(recent[:len(recent)//2]) / (len(recent)//2)
            second_half = sum(recent[len(recent)//2:]) / (len(recent) - len(recent)//2)

            if second_half > first_half + 0.1:
                progress.accuracy_trend = "improving"
            elif second_half < first_half - 0.1:
                progress.accuracy_trend = "declining"
            else:
                progress.accuracy_trend = "stable"

        return progress

    async def get_student_dashboard_stats(self, user_id: int) -> dict:
        """Get stats for student dashboard."""
        analytics = await self.db.execute(
            select(StudentAnalytics).where(StudentAnalytics.user_id == user_id)
        )
        analytics = analytics.scalar_one_or_none()

        # Recent scores
        scores_result = await self.db.execute(
            select(ScoreHistory)
            .where(ScoreHistory.user_id == user_id)
            .order_by(ScoreHistory.recorded_at.desc())
            .limit(10)
        )
        recent_scores = scores_result.scalars().all()

        # This week's activity
        week_ago = datetime.now(UTC) - timedelta(days=7)
        sessions_result = await self.db.execute(
            select(StudySession)
            .where(
                StudySession.user_id == user_id,
                StudySession.started_at >= week_ago
            )
        )
        recent_sessions = sessions_result.scalars().all()

        return {
            "analytics": analytics,
            "score_history": [
                {
                    "date": s.recorded_at.isoformat(),
                    "total": s.total_score,
                    "rw": s.reading_writing_score,
                    "math": s.math_score,
                }
                for s in reversed(recent_scores)
            ],
            "weekly_summary": {
                "study_time_minutes": sum(s.duration_minutes or 0 for s in recent_sessions),
                "sessions_count": len(recent_sessions),
                "questions_answered": sum(s.questions_answered for s in recent_sessions),
                "questions_correct": sum(s.questions_correct for s in recent_sessions),
            }
        }


# Need to import Integer for SQL casting
from sqlalchemy import Integer  # noqa: E402
