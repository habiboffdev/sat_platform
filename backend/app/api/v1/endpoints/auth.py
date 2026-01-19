from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import ActiveUser
from app.schemas import (
    MessageResponse,
    PasswordChangeRequest,
    TokenRefreshRequest,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


def get_auth_service(db: Annotated[AsyncSession, Depends(get_db)]) -> AuthService:
    return AuthService(db)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: UserRegister,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
):
    """Register a new user account."""
    try:
        user = await auth_service.register_user(data)
        return user
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/login", response_model=TokenResponse)
async def login(
    data: UserLogin,
    request: Request,
    response: Response,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
):
    """Login with email and password. Returns access token and sets refresh token cookie."""
    user = await auth_service.authenticate_user(data.email, data.password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    token_response, refresh_token = await auth_service.create_tokens(
        user,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )

    # Set refresh token as HTTP-only cookie
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.environment != "development",
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        path="/api/v1/auth",
    )

    return token_response


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    body: TokenRefreshRequest | None = None,
):
    """
    Refresh access token using refresh token.

    The refresh token can be provided either:
    - In the request body (for mobile/desktop apps)
    - As an HTTP-only cookie (for web apps)
    """
    # Try to get refresh token from body first, then from cookie
    refresh_token_value = None
    if body and body.refresh_token:
        refresh_token_value = body.refresh_token
    else:
        refresh_token_value = request.cookies.get("refresh_token")

    if not refresh_token_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not provided",
        )

    result = await auth_service.refresh_tokens(
        refresh_token_value,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )

    if not result:
        # Clear the cookie if refresh failed
        response.delete_cookie(key="refresh_token", path="/api/v1/auth")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    token_response, new_refresh_token = result

    # Set new refresh token cookie
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=settings.environment != "development",
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        path="/api/v1/auth",
    )

    return token_response


@router.post("/logout", response_model=MessageResponse)
async def logout(
    request: Request,
    response: Response,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
):
    """Logout and revoke refresh token."""
    refresh_token_value = request.cookies.get("refresh_token")

    if refresh_token_value:
        await auth_service.revoke_refresh_token(refresh_token_value)

    response.delete_cookie(key="refresh_token", path="/api/v1/auth")

    return MessageResponse(message="Successfully logged out")


@router.get("/me", response_model=UserResponse)
async def get_current_user(current_user: ActiveUser):
    """Get current authenticated user's profile."""
    return current_user


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    data: PasswordChangeRequest,
    current_user: ActiveUser,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
):
    """Change current user's password."""
    success = await auth_service.change_password(
        current_user,
        data.current_password,
        data.new_password,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    return MessageResponse(message="Password changed successfully")


@router.post("/logout-all", response_model=MessageResponse)
async def logout_all_devices(
    current_user: ActiveUser,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
):
    """Logout from all devices by revoking all refresh tokens."""
    count = await auth_service.revoke_all_user_tokens(current_user.id)
    return MessageResponse(message=f"Logged out from {count} device(s)")
