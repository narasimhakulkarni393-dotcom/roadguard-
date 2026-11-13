from typing import Optional
from fastapi import APIRouter, Depends, Header, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies.auth import get_current_user
from app.dependencies.database import get_db
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    RefreshTokenRequest,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.common import APIResponse
from app.schemas.user import UserRead
from app.services.auth_service import AuthService

router = APIRouter()


@router.post(
    "/register",
    response_model=APIResponse[UserRead],
    status_code=status.HTTP_201_CREATED,
    summary="User Registration",
    description="Registers a new user with email, unique username, and an Argon2id-hashed password.",
)
async def register(
    req: RegisterRequest,
    session: AsyncSession = Depends(get_db),
) -> APIResponse[UserRead]:
    service = AuthService(session)
    user = await service.register(req)
    return APIResponse(
        success=True,
        message="User registered successfully",
        data=UserRead.model_validate(user),
    )


@router.post(
    "/login",
    response_model=APIResponse[TokenResponse],
    status_code=status.HTTP_200_OK,
    summary="User Login",
    description="Authenticates credentials and returns a short-lived JWT access token and a high-entropy refresh token.",
)
async def login(
    req: LoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> APIResponse[TokenResponse]:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    service = AuthService(session)
    token_resp, _ = await service.authenticate(
        req, client_ip=client_ip, user_agent=user_agent
    )
    return APIResponse(
        success=True,
        message="Authentication successful",
        data=token_resp,
    )


@router.post(
    "/refresh",
    response_model=APIResponse[TokenResponse],
    status_code=status.HTTP_200_OK,
    summary="Refresh Access Token",
    description="Rotates the refresh token (revokes current, issues new pair) and returns a new access token.",
)
async def refresh_tokens(
    req: RefreshTokenRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> APIResponse[TokenResponse]:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    service = AuthService(session)
    new_tokens = await service.refresh_tokens(
        raw_refresh_token=req.refresh_token,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    return APIResponse(
        success=True,
        message="Tokens refreshed successfully",
        data=new_tokens,
    )


@router.post(
    "/logout",
    response_model=APIResponse[dict],
    status_code=status.HTTP_200_OK,
    summary="User Logout",
    description="Revokes the specified refresh token or all user sessions.",
)
async def logout(
    req: LogoutRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> APIResponse[dict]:
    service = AuthService(session)
    await service.logout(
        user_id=current_user.id,
        raw_refresh_token=req.refresh_token,
        all_sessions=req.all_sessions,
    )
    return APIResponse(
        success=True,
        message="Logged out successfully and token(s) revoked",
        data={"user_id": current_user.id, "all_sessions_revoked": req.all_sessions},
    )
