"""
Tests for authentication endpoints.
"""

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


class TestRegistration:
    """Tests for user registration."""

    @pytest.mark.asyncio
    async def test_register_success(self, client: AsyncClient):
        """Test successful user registration."""
        response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "newuser@test.com",
                "password": "SecurePass123!",
                "full_name": "New User",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "newuser@test.com"
        assert data["full_name"] == "New User"
        assert data["role"] == "student"
        assert "password" not in data
        assert "password_hash" not in data

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, client: AsyncClient, test_user):
        """Test registration with existing email fails."""
        response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "student@test.com",  # Already exists
                "password": "SecurePass123!",
                "full_name": "Another User",
            },
        )

        assert response.status_code == 400
        assert "already registered" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_register_weak_password(self, client: AsyncClient):
        """Test registration with weak password fails validation."""
        response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "user@test.com",
                "password": "weak",  # Too short, no uppercase, no digit
                "full_name": "User",
            },
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_register_invalid_email(self, client: AsyncClient):
        """Test registration with invalid email format."""
        response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "not-an-email",
                "password": "SecurePass123!",
                "full_name": "User",
            },
        )

        assert response.status_code == 422


class TestLogin:
    """Tests for user login."""

    @pytest.mark.asyncio
    async def test_login_success(self, client: AsyncClient, test_user):
        """Test successful login."""
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "student@test.com",
                "password": "Test1234!",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "expires_in" in data

        # Check refresh token cookie is set
        assert "refresh_token" in response.cookies

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client: AsyncClient, test_user):
        """Test login with wrong password fails."""
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "student@test.com",
                "password": "WrongPassword123!",
            },
        )

        assert response.status_code == 401
        assert "incorrect" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self, client: AsyncClient):
        """Test login with non-existent email fails."""
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "nonexistent@test.com",
                "password": "Password123!",
            },
        )

        assert response.status_code == 401


class TestTokenRefresh:
    """Tests for token refresh."""

    @pytest.mark.asyncio
    async def test_refresh_token_success(self, client: AsyncClient, test_user):
        """Test successful token refresh."""
        # First login to get refresh token
        login_response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "student@test.com",
                "password": "Test1234!",
            },
        )
        assert login_response.status_code == 200

        # Use refresh token
        refresh_response = await client.post(
            "/api/v1/auth/refresh",
            cookies=login_response.cookies,
        )

        assert refresh_response.status_code == 200
        data = refresh_response.json()
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_refresh_without_token(self, client: AsyncClient):
        """Test refresh without token fails."""
        response = await client.post("/api/v1/auth/refresh")

        assert response.status_code == 401


class TestCurrentUser:
    """Tests for getting current user."""

    @pytest.mark.asyncio
    async def test_get_me_authenticated(self, client: AsyncClient, test_user, user_token):
        """Test getting current user when authenticated."""
        response = await client.get(
            "/api/v1/auth/me",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "student@test.com"
        assert data["full_name"] == "Test Student"

    @pytest.mark.asyncio
    async def test_get_me_unauthenticated(self, client: AsyncClient):
        """Test getting current user without auth fails."""
        response = await client.get("/api/v1/auth/me")

        assert response.status_code == 401  # No auth header


class TestLogout:
    """Tests for logout."""

    @pytest.mark.asyncio
    async def test_logout_success(self, client: AsyncClient, test_user):
        """Test successful logout."""
        # Login first
        login_response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "student@test.com",
                "password": "Test1234!",
            },
        )
        cookies = login_response.cookies

        # Logout
        logout_response = await client.post(
            "/api/v1/auth/logout",
            cookies=cookies,
        )

        assert logout_response.status_code == 200
        assert "logged out" in logout_response.json()["message"].lower()


class TestPasswordChange:
    """Tests for password change."""

    @pytest.mark.asyncio
    async def test_change_password_success(self, client: AsyncClient, test_user, user_token):
        """Test successful password change."""
        response = await client.post(
            "/api/v1/auth/change-password",
            headers=auth_headers(user_token),
            json={
                "current_password": "Test1234!",
                "new_password": "NewSecure456!",
            },
        )

        assert response.status_code == 200

        # Verify new password works
        login_response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "student@test.com",
                "password": "NewSecure456!",
            },
        )
        assert login_response.status_code == 200

    @pytest.mark.asyncio
    async def test_change_password_wrong_current(self, client: AsyncClient, test_user, user_token):
        """Test password change with wrong current password."""
        response = await client.post(
            "/api/v1/auth/change-password",
            headers=auth_headers(user_token),
            json={
                "current_password": "WrongPassword!",
                "new_password": "NewSecure456!",
            },
        )

        assert response.status_code == 400
