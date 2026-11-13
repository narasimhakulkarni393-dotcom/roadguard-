import time
from collections import defaultdict
from typing import Dict, List
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("app.middleware.ratelimit")


class RateLimitMiddleware(BaseHTTPMiddleware):
    """In-memory rate limiter using sliding window algorithm per client IP."""

    def __init__(self, app):
        super().__init__(app)
        self.requests: Dict[str, List[float]] = defaultdict(list)
        self.window_seconds = 60
        self.max_requests = settings.RATE_LIMIT_REQUESTS_PER_MINUTE

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)

        # Skip rate limits for health checks and documentation endpoints
        path = request.url.path
        if path.startswith("/docs") or path.startswith("/redoc") or path.startswith("/openapi.json") or path.endswith("/health"):
            return await call_next(request)

        # Determine client identifier
        client_ip = request.headers.get("x-forwarded-for")
        if client_ip:
            client_ip = client_ip.split(",")[0].strip()
        elif request.client:
            client_ip = request.client.host
        else:
            client_ip = "unknown"

        now = time.time()
        window_start = now - self.window_seconds

        # Clean timestamps older than current window
        request_history = [ts for ts in self.requests[client_ip] if ts > window_start]
        self.requests[client_ip] = request_history

        if len(request_history) >= self.max_requests:
            logger.warning(f"Rate limit exceeded for client IP: {client_ip} on {path}")
            retry_after = int(self.window_seconds - (now - request_history[0]))
            return JSONResponse(
                status_code=429,
                content={
                    "success": False,
                    "error": {
                        "code": "RATE_LIMIT_EXCEEDED",
                        "message": f"Too many requests. Limit is {self.max_requests} requests per minute.",
                        "details": {"retry_after_seconds": max(retry_after, 1)},
                    }
                },
                headers={"Retry-After": str(max(retry_after, 1))}
            )

        self.requests[client_ip].append(now)
        return await call_next(request)
