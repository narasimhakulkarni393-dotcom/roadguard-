from typing import Callable, List, Union
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import AuthenticationError, PermissionDeniedError
from app.core.security import decode_access_token
from app.dependencies.database import get_db
from app.models.user import RoleEnum, User
from app.repositories.user_repository import UserRepository

# HTTPBearer scheme with auto_error=False for custom exception control
security_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Union[HTTPAuthorizationCredentials, None] = Depends(security_scheme),
    session: AsyncSession = Depends(get_db),
) -> User:
    """Dependency that extracts, validates, and decodes the JWT access token and returns the current user."""
    if not credentials or not credentials.credentials:
        raise AuthenticationError("Authentication token is required")

    token = credentials.credentials
    payload = decode_access_token(token)
    user_id = payload.get("sub")

    if not user_id:
        raise AuthenticationError("Token payload missing subject identifier")

    repo = UserRepository(session)
    user = await repo.get_by_id(user_id)

    if not user:
        raise AuthenticationError("User associated with token no longer exists")

    if not user.is_active:
        raise AuthenticationError("User account is inactive or disabled")

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensures that the authenticated user is currently active."""
    if not current_user.is_active:
        raise AuthenticationError("User account is inactive")
    return current_user


def require_role(allowed_roles: List[Union[RoleEnum, str]]) -> Callable:
    """Factory dependency enforcing Role-Based Access Control (RBAC)."""
    roles_normalized = [r.value if isinstance(r, RoleEnum) else str(r) for r in allowed_roles]

    async def role_checker(current_user: User = Depends(get_current_active_user)) -> User:
        if current_user.role not in roles_normalized:
            raise PermissionDeniedError(
                f"Operation requires one of the following roles: {', '.join(roles_normalized)}"
            )
        return current_user

    return role_checker
