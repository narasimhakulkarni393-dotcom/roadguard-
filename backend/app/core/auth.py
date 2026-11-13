"""API Authentication dependency using constant-time key validation."""
from __future__ import annotations

import secrets
from typing import Optional
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, APIKeyHeader

from app.core.config import settings

bearer_scheme = HTTPBearer(auto_error=False)
api_key_header_scheme = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(
    bearer_auth: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme),
    header_auth: Optional[str] = Security(api_key_header_scheme),
) -> str:
    """Validate incoming API key from either Bearer token or X-API-Key header.
    
    Uses secrets.compare_digest to prevent timing attacks.
    Never reflects or logs the raw API key.
    """
    token: Optional[str] = None

    if bearer_auth and bearer_auth.credentials:
        token = bearer_auth.credentials.strip()
    elif header_auth:
        token = header_auth.strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide 'Authorization: Bearer <API_KEY>' or 'X-API-Key' header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    expected = settings.API_KEY.strip()
    if not secrets.compare_digest(token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return token
