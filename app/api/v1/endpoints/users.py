from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies.auth import get_current_active_user, require_role
from app.dependencies.database import get_db
from app.models.user import RoleEnum, User
from app.schemas.common import APIResponse, PaginatedResponse
from app.schemas.user import PasswordChangeRequest, UserRead, UserRoleUpdate, UserUpdate
from app.services.user_service import UserService

router = APIRouter()


@router.get(
    "/me",
    response_model=APIResponse[UserRead],
    status_code=status.HTTP_200_OK,
    summary="Get Current User Profile",
    description="Retrieves the authenticated user's profile details.",
)
async def get_current_user_profile(
    current_user: User = Depends(get_current_active_user),
) -> APIResponse[UserRead]:
    return APIResponse(
        success=True,
        message="Profile retrieved successfully",
        data=UserRead.model_validate(current_user),
    )


@router.patch(
    "/me",
    response_model=APIResponse[UserRead],
    status_code=status.HTTP_200_OK,
    summary="Update Current User Profile",
    description="Updates the profile details (e.g. full name, email) of the authenticated user.",
)
async def update_current_user_profile(
    req: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_db),
) -> APIResponse[UserRead]:
    service = UserService(session)
    updated_user = await service.update_profile(current_user.id, req)
    return APIResponse(
        success=True,
        message="Profile updated successfully",
        data=UserRead.model_validate(updated_user),
    )


@router.post(
    "/me/change-password",
    response_model=APIResponse[dict],
    status_code=status.HTTP_200_OK,
    summary="Change User Password",
    description="Validates current password, updates to a new Argon2-hashed password, and revokes all active sessions.",
)
async def change_password(
    req: PasswordChangeRequest,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_db),
) -> APIResponse[dict]:
    service = UserService(session)
    await service.change_password(current_user.id, req)
    return APIResponse(
        success=True,
        message="Password changed successfully. Please log in again with your new password.",
        data={"user_id": current_user.id},
    )


# ---------------------------------------------------------------------------
# Administrative Endpoints (Role-Based Access Control: ADMIN)
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=APIResponse[PaginatedResponse[UserRead]],
    status_code=status.HTTP_200_OK,
    summary="List Users (Admin Only)",
    description="Returns a paginated list of all registered users.",
    dependencies=[Depends(require_role([RoleEnum.ADMIN]))],
)
async def list_users(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    session: AsyncSession = Depends(get_db),
) -> APIResponse[PaginatedResponse[UserRead]]:
    service = UserService(session)
    paginated_users = await service.list_users(page=page, limit=limit)
    return APIResponse(
        success=True,
        message="Users retrieved successfully",
        data=paginated_users,
    )


@router.get(
    "/{user_id}",
    response_model=APIResponse[UserRead],
    status_code=status.HTTP_200_OK,
    summary="Get User By ID (Admin Only)",
    description="Retrieves a specific user's record by UUID.",
    dependencies=[Depends(require_role([RoleEnum.ADMIN]))],
)
async def get_user_by_id(
    user_id: str,
    session: AsyncSession = Depends(get_db),
) -> APIResponse[UserRead]:
    service = UserService(session)
    user = await service.get_by_id(user_id)
    return APIResponse(
        success=True,
        message="User retrieved successfully",
        data=UserRead.model_validate(user),
    )


@router.patch(
    "/{user_id}/role",
    response_model=APIResponse[UserRead],
    status_code=status.HTTP_200_OK,
    summary="Update User Role (Admin Only)",
    description="Updates the RBAC role for a specific user.",
    dependencies=[Depends(require_role([RoleEnum.ADMIN]))],
)
async def update_user_role(
    user_id: str,
    req: UserRoleUpdate,
    session: AsyncSession = Depends(get_db),
) -> APIResponse[UserRead]:
    service = UserService(session)
    updated_user = await service.update_user_role(user_id, req.role)
    return APIResponse(
        success=True,
        message="User role updated successfully",
        data=UserRead.model_validate(updated_user),
    )
