from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.exceptions import AuthenticationError, ConflictError, NotFoundError
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    needs_rehash,
    verify_password,
)
from app.models.user import RoleEnum, User
from app.repositories.user_repository import UserRepository
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse

logger = get_logger("app.services.auth")


class AuthService:
    """Business logic for user registration, authentication, token rotation, and revocation."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = UserRepository(session)

    async def register(self, req: RegisterRequest) -> User:
        """Registers a new user after verifying unique constraints and hashing the password with Argon2."""
        # Check email uniqueness
        existing_email = await self.repo.get_by_email(req.email)
        if existing_email:
            raise ConflictError("An account with this email address already exists")

        # Check username uniqueness
        existing_username = await self.repo.get_by_username(req.username)
        if existing_username:
            raise ConflictError("This username is already taken")

        # Hash password securely with Argon2id
        hashed_pw = hash_password(req.password)

        user = User(
            email=req.email.lower(),
            username=req.username,
            hashed_password=hashed_pw,
            full_name=req.full_name,
            role=RoleEnum.USER.value,
            is_active=True,
            is_verified=False,
        )

        created_user = await self.repo.create(user)
        logger.info(f"User registered successfully: {created_user.id}")
        return created_user

    async def authenticate(
        self,
        req: LoginRequest,
        client_ip: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Tuple[TokenResponse, User]:
        """Authenticates a user by email/username and password, returning tokens and rotating sessions."""
        user = await self.repo.get_by_email_or_username(req.email_or_username)
        if not user:
            # Constant-time mitigation against timing attacks: perform dummy verify
            verify_password("dummy_password", "$argon2id$v=19$m=65536,t=3,p=4$dummy$dummy")
            raise AuthenticationError("Invalid email/username or password")

        if not user.is_active:
            raise AuthenticationError("User account is inactive or disabled")

        if not verify_password(req.password, user.hashed_password):
            raise AuthenticationError("Invalid email/username or password")

        # Check if hash needs update due to security parameter changes
        if needs_rehash(user.hashed_password):
            user.hashed_password = hash_password(req.password)
            await self.session.flush()

        # Generate access token
        access_token = create_access_token(
            subject=user.id,
            role=user.role,
            email=user.email,
        )

        # Generate and hash refresh token
        raw_refresh_token = generate_refresh_token()
        token_hash = hash_token(raw_refresh_token)
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

        await self.repo.create_refresh_token(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            user_agent=user_agent,
            client_ip=client_ip,
        )

        token_resp = TokenResponse(
            access_token=access_token,
            refresh_token=raw_refresh_token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

        logger.info(f"User authenticated successfully: {user.id}")
        return token_resp, user

    async def refresh_tokens(
        self,
        raw_refresh_token: str,
        client_ip: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> TokenResponse:
        """Rotates refresh tokens and issues a new access token, revoking the used refresh token."""
        token_hash = hash_token(raw_refresh_token)
        stored_token = await self.repo.get_refresh_token_by_hash(token_hash)

        if not stored_token:
            raise AuthenticationError("Invalid refresh token")

        if stored_token.is_revoked:
            # Token reuse detection: possible compromise. Revoke all user tokens as safety measure.
            logger.warning(f"Revoked refresh token reuse detected for user {stored_token.user_id}")
            await self.repo.revoke_all_user_tokens(stored_token.user_id)
            raise AuthenticationError("Invalid or revoked refresh token")

        if stored_token.is_expired:
            await self.repo.revoke_refresh_token(token_hash)
            raise AuthenticationError("Refresh token has expired")

        user = await self.repo.get_by_id(stored_token.user_id)
        if not user or not user.is_active:
            raise AuthenticationError("User is no longer active")

        # 1. Revoke the old token (strict token rotation)
        await self.repo.revoke_refresh_token(token_hash)

        # 2. Issue new access token
        new_access_token = create_access_token(
            subject=user.id,
            role=user.role,
            email=user.email,
        )

        # 3. Issue and persist new refresh token
        new_raw_refresh = generate_refresh_token()
        new_token_hash = hash_token(new_raw_refresh)
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

        await self.repo.create_refresh_token(
            user_id=user.id,
            token_hash=new_token_hash,
            expires_at=expires_at,
            user_agent=user_agent,
            client_ip=client_ip,
        )

        logger.info(f"Token rotated successfully for user: {user.id}")
        return TokenResponse(
            access_token=new_access_token,
            refresh_token=new_raw_refresh,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    async def logout(
        self,
        user_id: str,
        raw_refresh_token: Optional[str] = None,
        all_sessions: bool = False,
    ) -> None:
        """Revokes active refresh tokens for the user."""
        if all_sessions:
            count = await self.repo.revoke_all_user_tokens(user_id)
            logger.info(f"Revoked all {count} sessions for user: {user_id}")
        elif raw_refresh_token:
            token_hash = hash_token(raw_refresh_token)
            await self.repo.revoke_refresh_token(token_hash)
            logger.info(f"Revoked specific refresh token for user: {user_id}")
        else:
            # If no token passed, revoke all as safe default
            await self.repo.revoke_all_user_tokens(user_id)
            logger.info(f"Revoked all sessions for user on logout: {user_id}")
