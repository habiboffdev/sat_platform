"""
Tests for test/question management and test-taking flow.
"""

import pytest
from httpx import AsyncClient

from app.models import Test
from tests.conftest import auth_headers


class TestListTests:
    """Tests for listing available tests."""

    @pytest.mark.asyncio
    async def test_list_tests_authenticated(
        self, client: AsyncClient, test_user, user_token, test_full_sat
    ):
        """Test listing tests when authenticated."""
        response = await client.get(
            "/api/v1/tests",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert len(data["items"]) >= 1

        # Verify test data
        test = data["items"][0]
        assert test["title"] == "SAT Practice Test 1"
        assert test["test_type"] == "full_test"
        assert test["is_published"] is True

    @pytest.mark.asyncio
    async def test_list_tests_unauthenticated(self, client: AsyncClient):
        """Test listing tests without auth fails."""
        response = await client.get("/api/v1/tests")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_list_tests_filter_by_type(
        self, client: AsyncClient, test_user, user_token, test_full_sat
    ):
        """Test filtering tests by type."""
        response = await client.get(
            "/api/v1/tests",
            headers=auth_headers(user_token),
            params={"test_type": "full_test"},
        )

        assert response.status_code == 200
        data = response.json()
        for test in data["items"]:
            assert test["test_type"] == "full_test"


class TestGetTestDetail:
    """Tests for getting test details."""

    @pytest.mark.asyncio
    async def test_get_test_detail(
        self, client: AsyncClient, test_user, user_token, test_full_sat
    ):
        """Test getting test details with modules."""
        response = await client.get(
            f"/api/v1/tests/{test_full_sat.id}",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_full_sat.id
        assert data["title"] == "SAT Practice Test 1"
        assert "modules" in data
        assert len(data["modules"]) > 0

    @pytest.mark.asyncio
    async def test_get_nonexistent_test(
        self, client: AsyncClient, test_user, user_token
    ):
        """Test getting non-existent test returns 404."""
        response = await client.get(
            "/api/v1/tests/99999",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 404


class TestAdminTestManagement:
    """Tests for admin test management."""

    @pytest.mark.asyncio
    async def test_create_test_as_admin(
        self, client: AsyncClient, test_admin, admin_token
    ):
        """Test creating a test as admin."""
        response = await client.post(
            "/api/v1/tests",
            headers=auth_headers(admin_token),
            json={
                "title": "New Practice Test",
                "description": "A new test for practice",
                "test_type": "section_test",
                "section": "math",
                "time_limit_minutes": 60,
                "is_published": False,
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "New Practice Test"
        assert data["test_type"] == "section_test"

    @pytest.mark.asyncio
    async def test_create_test_as_student_fails(
        self, client: AsyncClient, test_user, user_token
    ):
        """Test that students cannot create tests."""
        response = await client.post(
            "/api/v1/tests",
            headers=auth_headers(user_token),
            json={
                "title": "Unauthorized Test",
                "test_type": "mini_test",
            },
        )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_update_test_as_admin(
        self, client: AsyncClient, test_admin, admin_token, test_full_sat
    ):
        """Test updating a test as admin."""
        response = await client.patch(
            f"/api/v1/tests/{test_full_sat.id}",
            headers=auth_headers(admin_token),
            json={
                "title": "Updated Test Title",
                "is_premium": True,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Updated Test Title"
        assert data["is_premium"] is True

    @pytest.mark.asyncio
    async def test_delete_test_as_admin(
        self, client: AsyncClient, db_session, test_admin, admin_token
    ):
        """Test deleting a test as admin."""
        # Create a test to delete
        test = Test(
            title="Test to Delete",
            test_type="mini_test",
            is_published=False,
        )
        db_session.add(test)
        await db_session.commit()

        response = await client.delete(
            f"/api/v1/tests/{test.id}",
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 204


class TestModuleManagement:
    """Tests for module management."""

    @pytest.mark.asyncio
    async def test_create_module(
        self, client: AsyncClient, test_admin, admin_token, db_session
    ):
        """Test creating a module for a test."""
        # Create a new test first
        from app.models import Test
        from app.models.enums import TestType
        
        test = Test(
            title="Empty Test",
            test_type=TestType.FULL_TEST,
            is_published=True
        )
        db_session.add(test)
        await db_session.commit()

        response = await client.post(
            f"/api/v1/tests/{test.id}/modules",
            headers=auth_headers(admin_token),
            json={
                "section": "reading_writing",
                "module": "module_1",
                "difficulty": "standard",
                "time_limit_minutes": 32,
                "order_index": 10,
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["section"] == "reading_writing"
        assert data["module"] == "module_1"


class TestQuestionManagement:
    """Tests for question management."""

    @pytest.mark.asyncio
    async def test_create_multiple_choice_question(
        self, client: AsyncClient, test_admin, admin_token, test_full_sat, db_session
    ):
        """Test creating a multiple choice question."""
        # Get first module
        from sqlalchemy import select
        from app.models import TestModule

        result = await db_session.execute(
            select(TestModule).where(TestModule.test_id == test_full_sat.id).limit(1)
        )
        module = result.scalar_one()

        response = await client.post(
            f"/api/v1/tests/modules/{module.id}/questions",
            headers=auth_headers(admin_token),
            json={
                "question_number": 100,
                "question_text": "What is the meaning of 'ubiquitous'?",
                "question_type": "multiple_choice",
                "options": [
                    {"id": "A", "text": "Rare"},
                    {"id": "B", "text": "Present everywhere"},
                    {"id": "C", "text": "Ancient"},
                    {"id": "D", "text": "Modern"},
                ],
                "correct_answer": ["B"],
                "explanation": "Ubiquitous means present everywhere.",
                "difficulty": "medium",
                "domain": "craft_and_structure",
                "skill_tags": ["vocabulary"],
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["question_text"] == "What is the meaning of 'ubiquitous'?"
        assert data["correct_answer"] == ["B"]

    @pytest.mark.asyncio
    async def test_create_grid_in_question(
        self, client: AsyncClient, test_admin, admin_token, test_full_sat, db_session
    ):
        """Test creating a grid-in (student-produced response) question."""
        from sqlalchemy import select
        from app.models import TestModule
        from app.models.enums import SATSection

        result = await db_session.execute(
            select(TestModule).where(
                TestModule.test_id == test_full_sat.id,
                TestModule.section == SATSection.MATH,
            ).limit(1)
        )
        module = result.scalar_one()

        response = await client.post(
            f"/api/v1/tests/modules/{module.id}/questions",
            headers=auth_headers(admin_token),
            json={
                "question_number": 100,
                "question_text": "If x² = 64, what is the positive value of x?",
                "question_type": "student_produced_response",
                "correct_answer": ["8"],
                "explanation": "√64 = 8",
                "difficulty": "easy",
                "domain": "algebra",
                "skill_tags": ["square-roots", "equations"],
                "answer_constraints": {
                    "min": 0,
                    "max": 100,
                    "allow_fraction": False,
                    "allow_decimal": False,
                },
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["question_type"] == "student_produced_response"
        assert data["correct_answer"] == ["8"]

    @pytest.mark.asyncio
    async def test_create_question_with_image(
        self, client: AsyncClient, test_admin, admin_token, test_full_sat, db_session
    ):
        """Test creating a question with images."""
        from sqlalchemy import select
        from app.models import TestModule

        result = await db_session.execute(
            select(TestModule).where(TestModule.test_id == test_full_sat.id).limit(1)
        )
        module = result.scalar_one()

        response = await client.post(
            f"/api/v1/tests/modules/{module.id}/questions",
            headers=auth_headers(admin_token),
            json={
                "question_number": 101,
                "question_text": "Which graph represents the function f(x) = x²?",
                "question_type": "multiple_choice_math",
                "question_image_url": "https://example.com/graphs/parabola.png",
                "question_image_alt": "Four different graphs labeled A, B, C, D",
                "options": [
                    {"id": "A", "text": "Graph A", "image_url": "https://example.com/a.png"},
                    {"id": "B", "text": "Graph B", "image_url": "https://example.com/b.png"},
                    {"id": "C", "text": "Graph C", "image_url": "https://example.com/c.png"},
                    {"id": "D", "text": "Graph D", "image_url": "https://example.com/d.png"},
                ],
                "correct_answer": ["A"],
                "difficulty": "medium",
                "domain": "algebra",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["question_image_url"] is not None
        assert data["options"][0]["image_url"] is not None
