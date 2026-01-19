"""
Tests for educational content management.
"""

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


class TestListContent:
    """Tests for listing educational content."""

    @pytest.mark.asyncio
    async def test_list_content(
        self, client: AsyncClient, test_user, user_token, test_content
    ):
        """Test listing published content."""
        response = await client.get(
            "/api/v1/content",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data

    @pytest.mark.asyncio
    async def test_list_content_filter_by_section(
        self, client: AsyncClient, test_user, user_token, test_content
    ):
        """Test filtering content by section."""
        response = await client.get(
            "/api/v1/content",
            headers=auth_headers(user_token),
            params={"section": "math"},
        )

        assert response.status_code == 200
        data = response.json()
        for item in data["items"]:
            assert item["section"] == "math"

    @pytest.mark.asyncio
    async def test_list_content_filter_by_type(
        self, client: AsyncClient, test_user, user_token, test_content
    ):
        """Test filtering content by type."""
        response = await client.get(
            "/api/v1/content",
            headers=auth_headers(user_token),
            params={"content_type": "lesson"},
        )

        assert response.status_code == 200
        data = response.json()
        for item in data["items"]:
            assert item["content_type"] == "lesson"

    @pytest.mark.asyncio
    async def test_search_content(
        self, client: AsyncClient, test_user, user_token, test_content
    ):
        """Test searching content by title/description."""
        response = await client.get(
            "/api/v1/content",
            headers=auth_headers(user_token),
            params={"search": "linear"},
        )

        assert response.status_code == 200


class TestGetContent:
    """Tests for getting content details."""

    @pytest.mark.asyncio
    async def test_get_content_detail(
        self, client: AsyncClient, test_user, user_token, test_content
    ):
        """Test getting content with user progress."""
        response = await client.get(
            f"/api/v1/content/{test_content.id}",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Solving Linear Equations"
        assert "body" in data
        assert "progress" in data  # May be null if no progress

    @pytest.mark.asyncio
    async def test_get_nonexistent_content(
        self, client: AsyncClient, test_user, user_token
    ):
        """Test getting non-existent content."""
        response = await client.get(
            "/api/v1/content/99999",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 404


class TestContentProgress:
    """Tests for tracking content progress."""

    @pytest.mark.asyncio
    async def test_update_progress(
        self, client: AsyncClient, test_user, user_token, test_content
    ):
        """Test updating content progress."""
        response = await client.post(
            f"/api/v1/content/{test_content.id}/progress",
            headers=auth_headers(user_token),
            json={
                "progress_percent": 50,
                "last_position_seconds": 300,
                "time_spent_seconds": 120,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["progress_percent"] == 50
        assert data["last_position_seconds"] == 300

    @pytest.mark.asyncio
    async def test_mark_content_complete(
        self, client: AsyncClient, test_user, user_token, test_content
    ):
        """Test marking content as complete."""
        response = await client.post(
            f"/api/v1/content/{test_content.id}/progress",
            headers=auth_headers(user_token),
            json={
                "is_completed": True,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["is_completed"] is True
        assert data["progress_percent"] == 100
        assert data["completed_at"] is not None

    @pytest.mark.asyncio
    async def test_progress_accumulates_time(
        self, client: AsyncClient, test_user, user_token, test_content
    ):
        """Test that study time accumulates."""
        # First update
        await client.post(
            f"/api/v1/content/{test_content.id}/progress",
            headers=auth_headers(user_token),
            json={"time_spent_seconds": 60},
        )

        # Second update
        response = await client.post(
            f"/api/v1/content/{test_content.id}/progress",
            headers=auth_headers(user_token),
            json={"time_spent_seconds": 60},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total_time_seconds"] == 120


class TestContentCategories:
    """Tests for content categories."""

    @pytest.mark.asyncio
    async def test_list_categories(
        self, client: AsyncClient, test_user, user_token, test_content_category
    ):
        """Test listing content categories."""
        response = await client.get(
            "/api/v1/content/categories",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestAdminContentManagement:
    """Tests for admin content management."""

    @pytest.mark.asyncio
    async def test_create_content(
        self, client: AsyncClient, test_admin, admin_token, test_content_category
    ):
        """Test creating content as admin."""
        response = await client.post(
            "/api/v1/content",
            headers=auth_headers(admin_token),
            json={
                "title": "New Lesson",
                "slug": "new-lesson",
                "description": "A new lesson on quadratics",
                "content_type": "lesson",
                "category_id": test_content_category.id,
                "body": "# Quadratic Equations\n\nA quadratic equation is...",
                "section": "math",
                "domain": "algebra",
                "is_published": True,
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "New Lesson"
        assert data["slug"] == "new-lesson"

    @pytest.mark.asyncio
    async def test_create_content_duplicate_slug(
        self, client: AsyncClient, test_admin, admin_token, test_content
    ):
        """Test that duplicate slugs are rejected."""
        response = await client.post(
            "/api/v1/content",
            headers=auth_headers(admin_token),
            json={
                "title": "Another Lesson",
                "slug": "solving-linear-equations",  # Already exists
                "content_type": "lesson",
            },
        )

        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_update_content(
        self, client: AsyncClient, test_admin, admin_token, test_content
    ):
        """Test updating content as admin."""
        response = await client.patch(
            f"/api/v1/content/{test_content.id}",
            headers=auth_headers(admin_token),
            json={
                "title": "Updated Lesson Title",
                "is_premium": True,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Updated Lesson Title"
        assert data["is_premium"] is True

    @pytest.mark.asyncio
    async def test_delete_content(
        self, client: AsyncClient, test_admin, admin_token, db_session
    ):
        """Test deleting content as admin."""
        from app.models import Content

        # Create content to delete
        content = Content(
            title="To Delete",
            slug="to-delete",
            content_type="article",
            is_published=False,
        )
        db_session.add(content)
        await db_session.commit()

        response = await client.delete(
            f"/api/v1/content/{content.id}",
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_create_content_as_student_fails(
        self, client: AsyncClient, test_user, user_token
    ):
        """Test that students cannot create content."""
        response = await client.post(
            "/api/v1/content",
            headers=auth_headers(user_token),
            json={
                "title": "Unauthorized Content",
                "slug": "unauthorized",
                "content_type": "lesson",
            },
        )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_create_category(
        self, client: AsyncClient, test_admin, admin_token
    ):
        """Test creating a content category."""
        response = await client.post(
            "/api/v1/content/categories",
            headers=auth_headers(admin_token),
            json={
                "name": "Advanced Math",
                "slug": "advanced-math",
                "description": "Advanced math topics",
                "section": "math",
                "domain": "advanced_math",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Advanced Math"
