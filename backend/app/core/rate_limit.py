"""In-process fixed-window rate limiting.

Suitable for a single-instance deployment. A multi-instance deployment needs a
shared counter (Redis); see SYSTEM_ARCHITECTURE.md for the boundary.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.core.config import settings

_EXEMPT_PREFIXES = ("/health", "/ready", "/docs", "/redoc", "/openapi.json")


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, limit: int, window_seconds: int = 60) -> None:
        super().__init__(app)
        self.limit = max(1, limit)
        self.window = float(window_seconds)
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _client_id(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _allow(self, client_id: str) -> bool:
        now = time.monotonic()
        cutoff = now - self.window
        with self._lock:
            bucket = self._hits[client_id]
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= self.limit:
                return False
            bucket.append(now)
            return True

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not settings.RATE_LIMIT_ENABLED or request.url.path.startswith(_EXEMPT_PREFIXES):
            return await call_next(request)

        if not self._allow(self._client_id(request)):
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Retry later."},
                headers={"Retry-After": str(int(self.window))},
            )
        return await call_next(request)
