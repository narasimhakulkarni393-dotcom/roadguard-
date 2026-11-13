from typing import Any, Generic, List, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    """Standardized top-level API response envelope."""
    success: bool = True
    message: str = "Operation successful"
    data: Optional[T] = None


class PaginatedResponse(BaseModel, Generic[T]):
    """Standardized pagination structure."""
    items: List[T]
    total: int
    page: int
    limit: int
    pages: int


class HealthResponse(BaseModel):
    """Detailed health check response model."""
    status: str
    environment: str
    version: str
    uptime_seconds: float
    database: dict
    timestamp: str
