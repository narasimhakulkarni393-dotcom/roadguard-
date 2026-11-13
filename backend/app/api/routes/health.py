"""Health check route."""
from fastapi import APIRouter
from app.core.config import settings
from app.database.session import engine
import datetime

router = APIRouter(prefix="/api/v1/health", tags=["health"])


@router.get("")
async def health_check():
    db_ok = True
    try:
        with engine.connect() as conn:
            conn.execute(engine.dialect.has_table.__func__.__doc__ and None or __import__("sqlalchemy").text("SELECT 1"))
    except Exception:
        # Try simpler check
        try:
            with engine.connect() as conn:
                from sqlalchemy import text
                conn.execute(text("SELECT 1"))
        except Exception:
            db_ok = False

    from app.core.config import settings as s
    detection_model_ready = s.DETECTION_MODEL_PATH.exists()

    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "database": "connected" if db_ok else "error",
        "detection_model_ready": detection_model_ready,
        "authenticity_model_ready": s.AUTHENTICITY_MODEL_PATH.exists(),
    }
