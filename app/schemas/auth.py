from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    """Payload for creating a new user account."""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_-]+$")
    password: str = Field(..., min_length=8, max_length=128, description="Strong password at least 8 characters")
    full_name: Optional[str] = Field(None, max_length=100)


class LoginRequest(BaseModel):
    """Payload for user authentication."""
    email_or_username: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class TokenResponse(BaseModel):
    """Response containing newly issued JWT and refresh tokens."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # Lifetime of access token in seconds


class RefreshTokenRequest(BaseModel):
    """Payload for rotating an expired access token."""
    refresh_token: str = Field(..., min_length=32)


class LogoutRequest(BaseModel):
    """Payload for revoking active sessions."""
    refresh_token: Optional[str] = None
    all_sessions: bool = False
