from datetime import datetime

from pydantic import EmailStr, Field, field_validator

from app.models.enums import SubscriptionPlan, SubscriptionStatus, UserRole
from app.schemas.base import BaseSchema, TimestampSchema


# === Auth Schemas ===


class UserRegister(BaseSchema):
    """Schema for user registration."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=50)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class UserLogin(BaseSchema):
    """Schema for user login."""

    email: EmailStr
    password: str


class TokenResponse(BaseSchema):
    """Schema for token response."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds until expiration


class TokenRefreshRequest(BaseSchema):
    """Schema for token refresh request."""

    refresh_token: str


class PasswordChangeRequest(BaseSchema):
    """Schema for password change."""

    current_password: str
    new_password: str = Field(min_length=8, max_length=72)

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


# === User Schemas ===


class UserBase(BaseSchema):
    """Base user schema with common fields."""

    email: EmailStr
    full_name: str | None = None
    phone: str | None = None
    avatar_url: str | None = None


class UserCreate(UserBase):
    """Schema for creating a user (admin only)."""

    password: str = Field(min_length=8, max_length=72)
    role: UserRole = UserRole.STUDENT
    is_active: bool = True
    is_verified: bool = False


class UserUpdate(BaseSchema):
    """Schema for updating user profile."""

    full_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    avatar_url: str | None = Field(default=None, max_length=500)


class UserAdminUpdate(UserUpdate):
    """Schema for admin updating a user."""

    email: EmailStr | None = None
    role: UserRole | None = None
    is_active: bool | None = None
    is_verified: bool | None = None


class UserResponse(UserBase, TimestampSchema):
    """Schema for user response."""

    id: int
    role: UserRole
    is_active: bool
    is_verified: bool
    last_login_at: datetime | None = None


class UserWithSubscription(UserResponse):
    """Schema for user response with subscription info."""

    subscription: "SubscriptionResponse | None" = None


# === Subscription Schemas ===


class SubscriptionResponse(BaseSchema):
    """Schema for subscription response."""

    id: int
    plan: SubscriptionPlan
    status: SubscriptionStatus
    starts_at: datetime | None = None
    expires_at: datetime | None = None


class SubscriptionCreate(BaseSchema):
    """Schema for creating/updating subscription (admin)."""

    user_id: int
    plan: SubscriptionPlan
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE
    starts_at: datetime | None = None
    expires_at: datetime | None = None


# Rebuild models that have forward references
UserWithSubscription.model_rebuild()
