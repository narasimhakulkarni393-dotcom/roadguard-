import math
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import AuthenticationError, ConflictError, NotFoundError
from app.core.logging import get_logger
from app.core.security import hash_password, verify_password
from app.models.user import RoleEnum, User
from app.repositories.user_repository import UserRepository
from app.schemas.common import PaginatedResponse
from app.schemas.user import PasswordChangeRequest, UserRead, UserUpdate

logger = get_logger("app.services.user")


class UserService:
    """Business logic for user account management, profile updates, and admin functions."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = UserRepository(session)

    async def get_by_id(self, user_id: str) -> User:
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError(f"User with ID {user_id} not found")
        return user

    async def update_profile(self, user_id: str, req: UserUpdate) -> User:
        user = await self.get_by_id(user_id)

        if req.email and req.email.lower() != user.email.lower():
            existing = await self.repo.get_by_email(req.email)
            if existing and existing.id != user.id:
                raise ConflictError("An account with this email address already exists")
            user.email = req.email.lower()

        if req.full_name is not None:
            user.full_name = req.full_name

        await self.session.flush()
        await self.session.refresh(user)
        logger.info(f"User profile updated: {user_id}")
        return user

    async def change_password(self, user_id: str, req: PasswordChangeRequest) -> None:
        user = await self.get_by_id(user_id)

        if not verify_password(req.current_password, user.hashed_password):
            raise AuthenticationError("Current password does not match")

        user.hashed_password = hash_password(req.new_password)
        # Revoke all existing sessions for security
        await self.repo.revoke_all_user_tokens(user_id)
        await self.session.flush()
        logger.info(f"Password changed and active sessions revoked for user: {user_id}")

    async def list_users(self, page: int = 1, limit: int = 20) -> PaginatedResponse[UserRead]:
        page = max(page, 1)
        limit = min(max(limit, 1), 100)
        skip = (page - 1) * limit

        items, total = await self.repo.list_paginated(skip=skip, limit=limit)
        pages = math.ceil(total / limit) if total > 0 else 0

        user_reads = [UserRead.model_validate(u) for u in items]

        return PaginatedResponse(
            items=user_reads,
            total=total,
            page=page,
            limit=limit,
            pages=pages,
        )

    async def update_user_role(self, target_user_id: str, new_role: RoleEnum) -> User:
        user = await self.get_by_id(target_user_id)
        user.role = new_role.value
        await self.session.flush()
        await self.session.refresh(user)
        logger.info(f"User {target_user_id} role updated to: {new_role.value}")
        return user
