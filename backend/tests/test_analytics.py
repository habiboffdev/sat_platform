"""
Tests for analytics, leaderboard, and study plans.
"""

import pytest
from httpx import AsyncClient

from app.models import StudentAnalytics, ScoreHistory, TestAttempt
from app.models.enums import AttemptStatus
from tests.conftest import auth_headers


class TestStudentAnalytics:
    """Tests for student analytics."""

    @pytest.mark.asyncio
    async def test_get_my_analytics(
        self, client: AsyncClient, test_user, user_token
    ):
        """Test getting own analytics."""
        response = await client.get(
            "/api/v1/analytics/me",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert "analytics" in data or data.get("analytics") is None
        assert "score_history" in data
        assert "weekly_summary" in data

    @pytest.mark.asyncio
    async def test_get_domain_performance(
        self, client: AsyncClient, test_user, user_token
    ):
        """Test getting domain performance breakdown."""
        response = await client.get(
            "/api/v1/analytics/me/domain-performance",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert "domains" in data
        assert "skills" in data
        assert "weak_domains" in data
        assert "strong_domains" in data

    @pytest.mark.asyncio
    async def test_refresh_analytics(
        self, client: AsyncClient, test_user, user_token
    ):
        """Test forcing analytics refresh."""
        response = await client.post(
            "/api/v1/analytics/me/refresh",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert "last_calculated_at" in data


class TestScoreHistory:
    """Tests for score history."""

    @pytest.mark.asyncio
    async def test_get_score_history(
        self, client: AsyncClient, test_user, user_token
    ):
        """Test getting score history."""
        response = await client.get(
            "/api/v1/analytics/me/score-history",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert "scores" in data

    @pytest.mark.asyncio
    async def test_score_history_with_limit(
        self, client: AsyncClient, test_user, user_token
    ):
        """Test score history with custom limit."""
        response = await client.get(
            "/api/v1/analytics/me/score-history",
            headers=auth_headers(user_token),
            params={"limit": 5},
        )

        assert response.status_code == 200


class TestLeaderboard:
    """Tests for leaderboard."""

    @pytest.mark.asyncio
    async def test_get_global_leaderboard(
        self, client: AsyncClient, test_user, user_token
    ):
        """Test getting global leaderboard."""
        response = await client.get(
            "/api/v1/analytics/leaderboard",
            headers=auth_headers(user_token),
            params={"scope_type": "global", "period_type": "weekly"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "leaderboard" in data
        assert data["scope_type"] == "global"
        assert data["period_type"] == "weekly"

    @pytest.mark.asyncio
    async def test_leaderboard_different_periods(
        self, client: AsyncClient, test_user, user_token
    ):
        """Test leaderboard with different time periods."""
        for period in ["weekly", "monthly", "alltime"]:
            response = await client.get(
                "/api/v1/analytics/leaderboard",
                headers=auth_headers(user_token),
                params={"period_type": period},
            )

            assert response.status_code == 200
            assert response.json()["period_type"] == period


class TestNotifications:
    """Tests for notification system."""

    @pytest.mark.asyncio
    async def test_get_notifications(
        self, client: AsyncClient, test_user, user_token
    ):
        """Test getting notifications."""
        response = await client.get(
            "/api/v1/analytics/notifications",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert "notifications" in data
        assert "unread_count" in data

    @pytest.mark.asyncio
    async def test_get_unread_notifications(
        self, client: AsyncClient, test_user, user_token
    ):
        """Test getting only unread notifications."""
        response = await client.get(
            "/api/v1/analytics/notifications",
            headers=auth_headers(user_token),
            params={"unread_only": True},
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_mark_notification_read(
        self, client: AsyncClient, test_user, user_token, db_session
    ):
        """Test marking a notification as read."""
        from app.models import Notification

        # Create a notification
        notification = Notification(
            user_id=test_user.id,
            title="Test Notification",
            message="This is a test",
            notification_type="system",
            is_read=False,
        )
        db_session.add(notification)
        await db_session.commit()

        # Mark as read
        response = await client.post(
            f"/api/v1/analytics/notifications/{notification.id}/read",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_mark_all_notifications_read(
        self, client: AsyncClient, test_user, user_token, db_session
    ):
        """Test marking all notifications as read."""
        from app.models import Notification

        # Create multiple notifications
        for i in range(3):
            notification = Notification(
                user_id=test_user.id,
                title=f"Notification {i}",
                message=f"Message {i}",
                notification_type="system",
                is_read=False,
            )
            db_session.add(notification)
        await db_session.commit()

        # Mark all as read
        response = await client.post(
            "/api/v1/analytics/notifications/read-all",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        assert "3" in response.json()["message"]


class TestStudyPlans:
    """Tests for study plans."""

    @pytest.mark.asyncio
    async def test_get_study_plans(
        self, client: AsyncClient, test_user, user_token
    ):
        """Test getting study plans."""
        response = await client.get(
            "/api/v1/analytics/study-plans",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert "plans" in data

    @pytest.mark.asyncio
    async def test_get_study_plan_detail(
        self, client: AsyncClient, test_user, user_token, db_session
    ):
        """Test getting study plan with tasks."""
        from app.models import StudyPlan, StudyPlanTask
        from datetime import datetime, UTC

        # Create a study plan
        plan = StudyPlan(
            user_id=test_user.id,
            title="SAT Prep Plan",
            description="8-week SAT preparation",
            target_score=1400,
            is_active=True,
            total_tasks=3,
            completed_tasks=0,
        )
        db_session.add(plan)
        await db_session.flush()

        # Add tasks
        for i in range(3):
            task = StudyPlanTask(
                study_plan_id=plan.id,
                title=f"Task {i + 1}",
                task_type="practice",
                order_index=i,
                estimated_minutes=30,
            )
            db_session.add(task)
        await db_session.commit()

        # Get plan
        response = await client.get(
            f"/api/v1/analytics/study-plans/{plan.id}",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["plan"]["title"] == "SAT Prep Plan"
        assert len(data["tasks"]) == 3

    @pytest.mark.asyncio
    async def test_complete_study_plan_task(
        self, client: AsyncClient, test_user, user_token, db_session
    ):
        """Test completing a study plan task."""
        from app.models import StudyPlan, StudyPlanTask

        # Create plan and task
        plan = StudyPlan(
            user_id=test_user.id,
            title="Test Plan",
            is_active=True,
            total_tasks=1,
            completed_tasks=0,
        )
        db_session.add(plan)
        await db_session.flush()

        task = StudyPlanTask(
            study_plan_id=plan.id,
            title="Complete practice test",
            task_type="test",
            is_completed=False,
        )
        db_session.add(task)
        await db_session.commit()

        # Complete task
        response = await client.post(
            f"/api/v1/analytics/study-plans/{plan.id}/tasks/{task.id}/complete",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        assert response.json()["completed_tasks"] == 1


class TestAdminAnalytics:
    """Tests for admin analytics."""

    @pytest.mark.asyncio
    async def test_get_platform_analytics(
        self, client: AsyncClient, test_admin, admin_token
    ):
        """Test getting platform-wide analytics."""
        response = await client.get(
            "/api/v1/analytics/platform",
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert "current" in data
        assert "history" in data
        assert "total_users" in data["current"]

    @pytest.mark.asyncio
    async def test_get_score_distribution(
        self, client: AsyncClient, test_admin, admin_token
    ):
        """Test getting score distribution."""
        response = await client.get(
            "/api/v1/analytics/platform/score-distribution",
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert "distribution" in data
        assert "stats" in data

    @pytest.mark.asyncio
    async def test_student_analytics_forbidden_for_students(
        self, client: AsyncClient, test_user, user_token
    ):
        """Test that students cannot view other students' analytics."""
        response = await client.get(
            "/api/v1/analytics/students/999",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_teacher_can_view_student_analytics(
        self, client: AsyncClient, test_user, test_teacher, teacher_token
    ):
        """Test that teachers can view student analytics."""
        response = await client.get(
            f"/api/v1/analytics/students/{test_user.id}",
            headers=auth_headers(teacher_token),
        )

        assert response.status_code == 200
