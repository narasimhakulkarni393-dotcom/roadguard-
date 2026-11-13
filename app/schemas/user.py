from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from app.models.user import RoleEnum


class UserRead(BaseModel):
    """User representation returned to clients (never exposes password hash)."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    username: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    updated_at: datetime


class UserCreate(BaseModel):
    """Internal user creation schema."""
    email: EmailStr
    username: str
    password: str
    full_name: Optional[str] = None
    role: RoleEnum = RoleEnum.USER


class UserUpdate(BaseModel):
    """User profile update request."""
    full_name: Optional[str] = Field(None, max_length=100)
    email: Optional[EmailStr] = None


class UserRoleUpdate(BaseModel):
    """Administrator-only role modification schema."""
    role: RoleEnum


class PasswordChangeRequest(BaseModel):
    """Authenticated user password modification request."""
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)
