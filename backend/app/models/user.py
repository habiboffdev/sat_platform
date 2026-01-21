from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import SubscriptionPlan, SubscriptionStatus, UserRole

if TYPE_CHECKING:
    from app.models.ocr import OCRJob


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    avatar_url: Mapped[str | None] = mapped_column(String(500))

    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole), default=UserRole.STUDENT, nullable=False
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Gamification
    total_points: Mapped[int] = mapped_column(default=0)
    level: Mapped[int] = mapped_column(default=1)

    # Relationships
    subscription: Mapped["Subscription | None"] = relationship(
        "Subscription", back_populates="user", uselist=False
    )
    test_attempts: Mapped[list["TestAttempt"]] = relationship(
        "TestAttempt", back_populates="user"
    )
    content_progress: Mapped[list["ContentProgress"]] = relationship(
        "ContentProgress", back_populates="user"
    )
    organization_memberships: Mapped[list["OrganizationMember"]] = relationship(
        "OrganizationMember", back_populates="user"
    )
    notifications: Mapped[list["Notification"]] = relationship(
        "Notification", back_populates="user"
    )
    study_plans: Mapped[list["StudyPlan"]] = relationship(
        "StudyPlan", back_populates="user", foreign_keys="StudyPlan.user_id"
    )
    ocr_jobs: Mapped[list["OCRJob"]] = relationship(
        "OCRJob", back_populates="user"
    )


class Subscription(Base, TimestampMixin):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )

    plan: Mapped[SubscriptionPlan] = mapped_column(
        Enum(SubscriptionPlan), default=SubscriptionPlan.FREE, nullable=False
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus), default=SubscriptionStatus.ACTIVE, nullable=False
    )

    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Payment reference
    payment_reference: Mapped[str | None] = mapped_column(String(255))
    payment_provider: Mapped[str | None] = mapped_column(String(50))

    # Relationship
    user: Mapped["User"] = relationship("User", back_populates="subscription")


class RefreshToken(Base, TimestampMixin):
    """Store refresh tokens for token rotation and revocation."""

    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(String(45))


# Import at bottom to avoid circular imports
from app.models.test import TestAttempt  # noqa: E402, F401
from app.models.content import ContentProgress  # noqa: E402, F401
from app.models.organization import OrganizationMember  # noqa: E402, F401
from app.models.analytics import Notification, StudyPlan  # noqa: E402, F401
# OCRJob is imported via TYPE_CHECKING to avoid registering OCR model enums during migration
