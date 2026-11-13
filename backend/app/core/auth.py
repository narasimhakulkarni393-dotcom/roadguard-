"""API authentication dependency using constant-time key validation."""
from __future__ import annotations

import secrets
from typing import Optional

from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

bearer_scheme = HTTPBearer(auto_error=False)
api_key_header_scheme = APIKeyHeader(name="X-API-Key", auto_error=False)


def _expected_key() -> str:
    """Return the configured key, or fail closed with 503 when unset."""
    expected = settings.API_KEY.strip()
    if not expected:
        # Misconfiguration must never degrade into "no authentication".
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server authentication is not configured. Set ROADGUARD_API_KEY.",
        )
    return expected


async def verify_api_key(
    bearer_auth: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme),
    header_auth: Optional[str] = Security(api_key_header_scheme),
) -> str:
    """Validate an API key supplied as Bearer token or X-API-Key header.

    Comparison uses ``secrets.compare_digest`` to avoid timing leaks.
    The submitted key is never logged or echoed back.
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

    expected = _expected_key()
    if not secrets.compare_digest(token.encode(), expected.encode()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return token
