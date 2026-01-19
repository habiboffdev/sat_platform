import hashlib
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import RefreshToken, Subscription, SubscriptionPlan, SubscriptionStatus, User
from app.schemas import TokenResponse, UserRegister


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def register_user(self, data: UserRegister) -> User:
        """Register a new user."""
        # Check if email already exists
        result = await self.db.execute(select(User).where(User.email == data.email))
        if result.scalar_one_or_none():
            raise ValueError("Email already registered")

        # Create user
        user = User(
            email=data.email,
            password_hash=hash_password(data.password),
            full_name=data.full_name,
            phone=data.phone,
        )
        self.db.add(user)
        await self.db.flush()

        # Create default free subscription
        subscription = Subscription(
            user_id=user.id,
            plan=SubscriptionPlan.FREE,
            status=SubscriptionStatus.ACTIVE,
        )
        self.db.add(subscription)

        return user

    async def authenticate_user(self, email: str, password: str) -> User | None:
        """Authenticate user with email and password."""
        result = await self.db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if not user:
            return None

        if not verify_password(password, user.password_hash):
            return None

        # Update last login
        user.last_login_at = datetime.now(UTC)

        return user

    async def create_tokens(
        self,
        user: User,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> tuple[TokenResponse, str]:
        """Create access and refresh tokens for a user."""
        # Create access token
        access_token = create_access_token(
            subject=user.id,
            additional_claims={"role": user.role.value},
        )

        # Create refresh token
        refresh_token = create_refresh_token(subject=user.id)

        # Store refresh token hash in database
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        refresh_token_record = RefreshToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
            user_agent=user_agent,
            ip_address=ip_address,
        )
        self.db.add(refresh_token_record)

        token_response = TokenResponse(
            access_token=access_token,
            expires_in=settings.access_token_expire_minutes * 60,
        )

        return token_response, refresh_token

    async def refresh_tokens(
        self,
        refresh_token: str,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> tuple[TokenResponse, str] | None:
        """Refresh access token using refresh token. Implements token rotation."""
        try:
            payload = decode_token(refresh_token)
            if payload.get("type") != "refresh":
                return None

            user_id = int(payload.get("sub", 0))
        except Exception:
            return None

        # Verify token exists and is not revoked
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.revoked == False,  # noqa: E712
                RefreshToken.expires_at > datetime.now(UTC),
            )
        )
        stored_token = result.scalar_one_or_none()

        if not stored_token:
            return None

        # Get user
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user or not user.is_active:
            return None

        # Revoke old token (token rotation)
        stored_token.revoked = True
        stored_token.revoked_at = datetime.now(UTC)

        # Create new tokens
        return await self.create_tokens(user, user_agent, ip_address)

    async def revoke_refresh_token(self, refresh_token: str) -> bool:
        """Revoke a specific refresh token."""
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        result = await self.db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        stored_token = result.scalar_one_or_none()

        if stored_token:
            stored_token.revoked = True
            stored_token.revoked_at = datetime.now(UTC)
            return True

        return False

    async def revoke_all_user_tokens(self, user_id: int) -> int:
        """Revoke all refresh tokens for a user. Returns count of revoked tokens."""
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked == False,  # noqa: E712
            )
        )
        tokens = result.scalars().all()

        count = 0
        for token in tokens:
            token.revoked = True
            token.revoked_at = datetime.now(UTC)
            count += 1

        return count

    async def change_password(
        self, user: User, current_password: str, new_password: str
    ) -> bool:
        """Change user's password."""
        if not verify_password(current_password, user.password_hash):
            return False

        user.password_hash = hash_password(new_password)

        # Revoke all refresh tokens on password change
        await self.revoke_all_user_tokens(user.id)

        return True

    async def get_user_by_id(self, user_id: int) -> User | None:
        """Get user by ID."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_user_by_email(self, email: str) -> User | None:
        """Get user by email."""
        result = await self.db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()
