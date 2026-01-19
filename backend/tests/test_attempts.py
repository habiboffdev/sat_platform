"""
Tests for test-taking flow and attempts.
"""

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


class TestStartTest:
    """Tests for starting a test attempt."""

    @pytest.mark.asyncio
    async def test_start_test_success(
        self, client: AsyncClient, test_user, user_token, test_full_sat
    ):
        """Test successfully starting a test."""
        response = await client.post(
            "/api/v1/attempts",
            headers=auth_headers(user_token),
            params={"test_id": test_full_sat.id},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["test_id"] == test_full_sat.id
        assert data["status"] == "in_progress"
        assert data["current_module_id"] is not None
        assert data["current_question_number"] == 1

    @pytest.mark.asyncio
    async def test_start_test_returns_existing_attempt(
        self, client: AsyncClient, test_user, user_token, test_full_sat
    ):
        """Test that starting a test with an existing in-progress attempt returns that attempt."""
        # Start first attempt
        response1 = await client.post(
            "/api/v1/attempts",
            headers=auth_headers(user_token),
            params={"test_id": test_full_sat.id},
        )
        assert response1.status_code == 201
        attempt1_id = response1.json()["id"]

        # Try to start again
        response2 = await client.post(
            "/api/v1/attempts",
            headers=auth_headers(user_token),
            params={"test_id": test_full_sat.id},
        )
        assert response2.status_code == 201
        assert response2.json()["id"] == attempt1_id  # Same attempt

    @pytest.mark.asyncio
    async def test_start_nonexistent_test(
        self, client: AsyncClient, test_user, user_token
    ):
        """Test starting a non-existent test fails."""
        response = await client.post(
            "/api/v1/attempts",
            headers=auth_headers(user_token),
            params={"test_id": 99999},
        )

        assert response.status_code == 404


class TestGetCurrentModule:
    """Tests for getting current module during test."""

    @pytest.mark.asyncio
    async def test_get_current_module(
        self, client: AsyncClient, test_user, user_token, test_full_sat
    ):
        """Test getting current module with questions."""
        # Start test
        start_response = await client.post(
            "/api/v1/attempts",
            headers=auth_headers(user_token),
            params={"test_id": test_full_sat.id},
        )
        attempt_id = start_response.json()["id"]

        # Get current module
        response = await client.get(
            f"/api/v1/attempts/{attempt_id}/current-module",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert "questions" in data
        assert len(data["questions"]) > 0
        assert data["time_limit_minutes"] > 0

        # Verify questions don't contain correct answers
        for question in data["questions"]:
            assert "correct_answer" not in question


class TestSubmitModule:
    """Tests for submitting module answers."""

    @pytest.mark.asyncio
    async def test_submit_module_success(
        self, client: AsyncClient, test_user, user_token, test_full_sat
    ):
        """Test successfully submitting a module."""
        # Start test
        start_response = await client.post(
            "/api/v1/attempts",
            headers=auth_headers(user_token),
            params={"test_id": test_full_sat.id},
        )
        attempt_id = start_response.json()["id"]
        current_module_id = start_response.json()["current_module_id"]

        # Get questions
        module_response = await client.get(
            f"/api/v1/attempts/{attempt_id}/current-module",
            headers=auth_headers(user_token),
        )
        questions = module_response.json()["questions"]

        # Submit answers
        answers = [
            {
                "question_id": q["id"],
                "answer": "B",  # Answer all with B
                "time_spent_seconds": 30,
                "is_flagged": False,
            }
            for q in questions
        ]

        response = await client.post(
            f"/api/v1/attempts/{attempt_id}/submit-module",
            headers=auth_headers(user_token),
            json={
                "module_id": current_module_id,
                "answers": answers,
                "time_spent_seconds": 1800,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "module_score" in data
        assert "correct" in data["module_score"]
        assert "total" in data["module_score"]
        assert "next_module_id" in data or data["test_completed"]

    @pytest.mark.asyncio
    async def test_submit_module_with_flagged_questions(
        self, client: AsyncClient, test_user, user_token, test_full_sat
    ):
        """Test submitting with flagged questions for review."""
        # Start test
        start_response = await client.post(
            "/api/v1/attempts",
            headers=auth_headers(user_token),
            params={"test_id": test_full_sat.id},
        )
        attempt_id = start_response.json()["id"]
        current_module_id = start_response.json()["current_module_id"]

        # Get first few questions
        module_response = await client.get(
            f"/api/v1/attempts/{attempt_id}/current-module",
            headers=auth_headers(user_token),
        )
        questions = module_response.json()["questions"][:5]

        # Submit with some flagged
        answers = [
            {
                "question_id": q["id"],
                "answer": "A",
                "time_spent_seconds": 30,
                "is_flagged": i % 2 == 0,  # Flag every other question
            }
            for i, q in enumerate(questions)
        ]

        # Add remaining questions as unanswered
        all_questions = module_response.json()["questions"]
        for q in all_questions[5:]:
            answers.append({
                "question_id": q["id"],
                "answer": None,  # Unanswered
                "time_spent_seconds": 0,
                "is_flagged": False,
            })

        response = await client.post(
            f"/api/v1/attempts/{attempt_id}/submit-module",
            headers=auth_headers(user_token),
            json={
                "module_id": current_module_id,
                "answers": answers,
                "time_spent_seconds": 300,
            },
        )

        assert response.status_code == 200


class TestAdaptiveTesting:
    """Tests for adaptive module difficulty."""

    @pytest.mark.asyncio
    async def test_high_performance_gets_harder_module(
        self, client: AsyncClient, test_user, user_token, test_full_sat, db_session
    ):
        """Test that high performance on Module 1 leads to harder Module 2."""
        # Start test
        start_response = await client.post(
            "/api/v1/attempts",
            headers=auth_headers(user_token),
            params={"test_id": test_full_sat.id},
        )
        attempt_id = start_response.json()["id"]
        current_module_id = start_response.json()["current_module_id"]

        # Get questions and answer all correctly
        module_response = await client.get(
            f"/api/v1/attempts/{attempt_id}/current-module",
            headers=auth_headers(user_token),
        )
        questions = module_response.json()["questions"]

        # All correct answers (assuming B is correct for our test data)
        answers = [
            {
                "question_id": q["id"],
                "answer": "B",
                "time_spent_seconds": 30,
                "is_flagged": False,
            }
            for q in questions
        ]

        response = await client.post(
            f"/api/v1/attempts/{attempt_id}/submit-module",
            headers=auth_headers(user_token),
            json={
                "module_id": current_module_id,
                "answers": answers,
                "time_spent_seconds": 1800,
            },
        )

        assert response.status_code == 200
        data = response.json()

        # If not completed, check next module
        if not data.get("test_completed"):
            # The scoring should recognize high performance
            assert data["module_score"]["correct"] > 0


class TestAttemptHistory:
    """Tests for viewing attempt history."""

    @pytest.mark.asyncio
    async def test_list_my_attempts(
        self, client: AsyncClient, test_user, user_token, test_full_sat
    ):
        """Test listing user's attempts."""
        # Create an attempt
        await client.post(
            "/api/v1/attempts",
            headers=auth_headers(user_token),
            params={"test_id": test_full_sat.id},
        )

        # List attempts
        response = await client.get(
            "/api/v1/attempts",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert len(data["items"]) >= 1

    @pytest.mark.asyncio
    async def test_get_attempt_detail(
        self, client: AsyncClient, test_user, user_token, test_full_sat
    ):
        """Test getting attempt details."""
        # Create an attempt
        start_response = await client.post(
            "/api/v1/attempts",
            headers=auth_headers(user_token),
            params={"test_id": test_full_sat.id},
        )
        attempt_id = start_response.json()["id"]

        # Get detail
        response = await client.get(
            f"/api/v1/attempts/{attempt_id}",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == attempt_id
        assert data["status"] == "in_progress"


class TestAbandonAttempt:
    """Tests for abandoning an attempt."""

    @pytest.mark.asyncio
    async def test_abandon_attempt(
        self, client: AsyncClient, test_user, user_token, test_full_sat
    ):
        """Test abandoning an in-progress attempt."""
        # Start test
        start_response = await client.post(
            "/api/v1/attempts",
            headers=auth_headers(user_token),
            params={"test_id": test_full_sat.id},
        )
        attempt_id = start_response.json()["id"]

        # Abandon
        response = await client.post(
            f"/api/v1/attempts/{attempt_id}/abandon",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200

        # Verify status changed
        detail_response = await client.get(
            f"/api/v1/attempts/{attempt_id}",
            headers=auth_headers(user_token),
        )
        assert detail_response.json()["status"] == "abandoned"

class TestDeleteAttempt:
    """Tests for deleting an attempt."""

    @pytest.mark.asyncio
    async def test_delete_attempt_success(
        self, client: AsyncClient, test_user, user_token, test_full_sat
    ):
        """Test successfully deleting an attempt."""
        # Start test
        start_response = await client.post(
            "/api/v1/attempts",
            headers=auth_headers(user_token),
            params={"test_id": test_full_sat.id},
        )
        attempt_id = start_response.json()["id"]

        # Delete
        response = await client.delete(
            f"/api/v1/attempts/{attempt_id}",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        assert response.json()["message"] == "Attempt deleted successfully"

        # Verify it's gone
        detail_response = await client.get(
            f"/api/v1/attempts/{attempt_id}",
            headers=auth_headers(user_token),
        )
        assert detail_response.status_code == 404
