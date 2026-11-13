import time
from datetime import datetime, timezone
from fastapi import APIRouter, status
from app.core.config import settings
from app.db.init_db import check_database_health
from app.schemas.common import APIResponse, HealthResponse

router = APIRouter()
_APP_START_TIME = time.time()


@router.get(
    "/health",
    response_model=APIResponse[HealthResponse],
    status_code=status.HTTP_200_OK,
    summary="Application and Database Health Check",
    description="Returns live operational status, database connectivity verification, latency, and uptime metrics.",
)
async def health_check() -> APIResponse[HealthResponse]:
    db_healthy, latency_ms, db_message = await check_database_health()
    uptime = time.time() - _APP_START_TIME

    overall_status = "healthy" if db_healthy else "degraded"

    data = HealthResponse(
        status=overall_status,
        environment=settings.ENVIRONMENT,
        version=settings.APP_VERSION,
        uptime_seconds=round(uptime, 2),
        database={
            "connected": db_healthy,
            "latency_ms": latency_ms,
            "message": db_message,
        },
        timestamp=datetime.now(timezone.utc).isoformat(),
    )

    return APIResponse(
        success=db_healthy,
        message=f"Application is {overall_status}",
        data=data,
    )
