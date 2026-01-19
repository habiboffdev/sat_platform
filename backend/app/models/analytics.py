"""
Analytics models for tracking student progress, platform usage, and generating reports.
"""

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import QuestionDomain, SATSection


class StudentAnalytics(Base, TimestampMixin):
    """
    Aggregated analytics for a student.
    Updated periodically or after each test attempt.
    """

    __tablename__ = "student_analytics"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )

    # Overall stats
    total_tests_taken: Mapped[int] = mapped_column(Integer, default=0)
    total_questions_answered: Mapped[int] = mapped_column(Integer, default=0)
    total_study_time_minutes: Mapped[int] = mapped_column(Integer, default=0)

    # Score progression
    first_score: Mapped[int | None] = mapped_column(Integer)
    highest_score: Mapped[int | None] = mapped_column(Integer)
    latest_score: Mapped[int | None] = mapped_column(Integer)
    average_score: Mapped[float | None] = mapped_column(Float)
    score_improvement: Mapped[int | None] = mapped_column(Integer)  # latest - first

    # Section breakdown
    reading_writing_avg: Mapped[float | None] = mapped_column(Float)
    math_avg: Mapped[float | None] = mapped_column(Float)

    # Strengths and weaknesses by domain
    # Format: {"algebra": {"accuracy": 0.85, "count": 50}, ...}
    domain_performance: Mapped[dict | None] = mapped_column(JSON)

    # Skill-level analysis
    # Format: {"linear-equations": {"accuracy": 0.9, "count": 20}, ...}
    skill_performance: Mapped[dict | None] = mapped_column(JSON)

    # Weakest areas (for recommendations)
    weak_domains: Mapped[list[str] | None] = mapped_column(JSON)
    weak_skills: Mapped[list[str] | None] = mapped_column(JSON)

    # Strongest areas
    strong_domains: Mapped[list[str] | None] = mapped_column(JSON)
    strong_skills: Mapped[list[str] | None] = mapped_column(JSON)

    # Time analytics
    avg_time_per_question_seconds: Mapped[float | None] = mapped_column(Float)
    avg_time_per_test_minutes: Mapped[float | None] = mapped_column(Float)

    # Streak and engagement
    current_streak_days: Mapped[int] = mapped_column(Integer, default=0)
    longest_streak_days: Mapped[int] = mapped_column(Integer, default=0)
    last_activity_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Predicted score based on trends
    predicted_score: Mapped[int | None] = mapped_column(Integer)

    # Last recalculation
    last_calculated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    # Relationship
    user: Mapped["User"] = relationship("User")


class ScoreHistory(Base, TimestampMixin):
    """Track score progression over time for trend analysis."""

    __tablename__ = "score_history"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    test_attempt_id: Mapped[int] = mapped_column(
        ForeignKey("test_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Scores
    total_score: Mapped[int | None] = mapped_column(Integer)
    reading_writing_score: Mapped[int | None] = mapped_column(Integer)
    math_score: Mapped[int | None] = mapped_column(Integer)

    # Date for easy querying
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )


class DomainProgress(Base, TimestampMixin):
    """Track progress in each domain over time."""

    __tablename__ = "domain_progress"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    domain: Mapped[str] = mapped_column(String(100), nullable=False)
    section: Mapped[str] = mapped_column(String(50), nullable=False)

    # Rolling stats
    total_questions: Mapped[int] = mapped_column(Integer, default=0)
    correct_answers: Mapped[int] = mapped_column(Integer, default=0)
    accuracy: Mapped[float] = mapped_column(Float, default=0.0)

    # Trend
    accuracy_trend: Mapped[str | None] = mapped_column(String(20))  # improving, declining, stable

    # Last 10 attempts for trend calculation
    recent_results: Mapped[list[bool] | None] = mapped_column(JSON)


class StudySession(Base, TimestampMixin):
    """Track study sessions for engagement analytics."""

    __tablename__ = "study_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    duration_minutes: Mapped[int | None] = mapped_column(Integer)

    # What was studied
    activity_type: Mapped[str] = mapped_column(String(50))  # test, content, practice, review
    test_attempt_id: Mapped[int | None] = mapped_column(
        ForeignKey("test_attempts.id", ondelete="SET NULL")
    )
    content_id: Mapped[int | None] = mapped_column(ForeignKey("contents.id", ondelete="SET NULL"))

    # Questions answered in this session
    questions_answered: Mapped[int] = mapped_column(Integer, default=0)
    questions_correct: Mapped[int] = mapped_column(Integer, default=0)


class PlatformAnalytics(Base, TimestampMixin):
    """
    Platform-wide analytics for admin dashboard.
    Aggregated daily/weekly/monthly.
    """

    __tablename__ = "platform_analytics"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Time period
    period_type: Mapped[str] = mapped_column(String(20), nullable=False)  # daily, weekly, monthly
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Optional organization filter (null = platform-wide)
    organization_id: Mapped[int | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )

    # User metrics
    total_users: Mapped[int] = mapped_column(Integer, default=0)
    new_users: Mapped[int] = mapped_column(Integer, default=0)
    active_users: Mapped[int] = mapped_column(Integer, default=0)  # Users who logged in
    engaged_users: Mapped[int] = mapped_column(Integer, default=0)  # Users who took action

    # Test metrics
    tests_started: Mapped[int] = mapped_column(Integer, default=0)
    tests_completed: Mapped[int] = mapped_column(Integer, default=0)
    average_score: Mapped[float | None] = mapped_column(Float)

    # Content metrics
    content_views: Mapped[int] = mapped_column(Integer, default=0)
    content_completions: Mapped[int] = mapped_column(Integer, default=0)

    # Engagement
    total_study_minutes: Mapped[int] = mapped_column(Integer, default=0)
    total_questions_answered: Mapped[int] = mapped_column(Integer, default=0)

    # Score distribution
    score_distribution: Mapped[dict | None] = mapped_column(JSON)  # {"400-600": 10, ...}

    # Top performing domains/skills
    domain_accuracy: Mapped[dict | None] = mapped_column(JSON)


class Leaderboard(Base, TimestampMixin):
    """Leaderboard entries for gamification."""

    __tablename__ = "leaderboard"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Scope: global, organization, or class
    scope_type: Mapped[str] = mapped_column(String(20), nullable=False)  # global, org, class
    scope_id: Mapped[int | None] = mapped_column(Integer)  # org_id or class_id

    # Time period
    period_type: Mapped[str] = mapped_column(String(20), nullable=False)  # weekly, monthly, alltime

    # Metrics
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    score: Mapped[int] = mapped_column(Integer, default=0)  # Points/XP
    tests_completed: Mapped[int] = mapped_column(Integer, default=0)
    study_time_minutes: Mapped[int] = mapped_column(Integer, default=0)
    average_accuracy: Mapped[float | None] = mapped_column(Float)

    # Valid period
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Achievement(Base, TimestampMixin):
    """Achievement definitions for gamification."""

    __tablename__ = "achievements"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    icon: Mapped[str | None] = mapped_column(String(100))

    # Requirements
    requirement_type: Mapped[str] = mapped_column(String(50))  # score, streak, tests, accuracy
    requirement_value: Mapped[int] = mapped_column(Integer)
    requirement_domain: Mapped[str | None] = mapped_column(String(100))  # Optional domain filter

    # Points/XP awarded
    points: Mapped[int] = mapped_column(Integer, default=0)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class UserAchievement(Base, TimestampMixin):
    """Tracks achievements earned by users."""

    __tablename__ = "user_achievements"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    achievement_id: Mapped[int] = mapped_column(
        ForeignKey("achievements.id", ondelete="CASCADE"), nullable=False, index=True
    )

    earned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    # Relationships
    achievement: Mapped["Achievement"] = relationship("Achievement")


class Notification(Base, TimestampMixin):
    """User notifications."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    # Type for filtering/styling
    notification_type: Mapped[str] = mapped_column(String(50))  # achievement, assignment, reminder, system

    # Optional link
    action_url: Mapped[str | None] = mapped_column(String(500))

    # Read status
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Optional: related entities
    related_type: Mapped[str | None] = mapped_column(String(50))  # assignment, test, content
    related_id: Mapped[int | None] = mapped_column(Integer)

    # Relationship
    user: Mapped["User"] = relationship("User", back_populates="notifications")


class StudyPlan(Base, TimestampMixin):
    """Personalized study plans for students."""

    __tablename__ = "study_plans"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    # Goals
    target_score: Mapped[int | None] = mapped_column(Integer)
    target_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Focus areas based on analytics
    focus_domains: Mapped[list[str] | None] = mapped_column(JSON)
    focus_skills: Mapped[list[str] | None] = mapped_column(JSON)

    # Weekly schedule
    # Format: {"monday": {"tasks": [...], "time_minutes": 60}, ...}
    weekly_schedule: Mapped[dict | None] = mapped_column(JSON)

    # Progress
    total_tasks: Mapped[int] = mapped_column(Integer, default=0)
    completed_tasks: Mapped[int] = mapped_column(Integer, default=0)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Created by (teacher or AI-generated)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    user: Mapped["User"] = relationship(
        "User", back_populates="study_plans", foreign_keys=[user_id]
    )
    tasks: Mapped[list["StudyPlanTask"]] = relationship(
        "StudyPlanTask", back_populates="study_plan", cascade="all, delete-orphan"
    )


class StudyPlanTask(Base, TimestampMixin):
    """Individual tasks within a study plan."""

    __tablename__ = "study_plan_tasks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    study_plan_id: Mapped[int] = mapped_column(
        ForeignKey("study_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    task_type: Mapped[str] = mapped_column(String(50))  # test, content, practice, review
    target_id: Mapped[int | None] = mapped_column(Integer)  # test_id, content_id, etc.

    # Scheduling
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    day_of_week: Mapped[int | None] = mapped_column(Integer)  # 0=Monday, 6=Sunday
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    # Estimated time
    estimated_minutes: Mapped[int | None] = mapped_column(Integer)

    # Completion
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Optional: focus area
    domain: Mapped[str | None] = mapped_column(String(100))
    skills: Mapped[list[str] | None] = mapped_column(JSON)

    # Relationship
    study_plan: Mapped["StudyPlan"] = relationship("StudyPlan", back_populates="tasks")


# Import at end to avoid circular imports
from app.models.user import User  # noqa: E402
