"""Health check route."""
from __future__ import annotations

import datetime

from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.database.session import engine

router = APIRouter(prefix="/api/v1/health", tags=["health"])


@router.get("")
async def health_check():
    db_ok = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    return {
        "status": "healthy" if db_ok else "degraded",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "database": "connected" if db_ok else "error",
        "detection_model_ready": settings.DETECTION_MODEL_PATH.exists(),
        "authenticity_model_ready": settings.AUTHENTICITY_MODEL_PATH.exists(),
    }
