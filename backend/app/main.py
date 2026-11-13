"""FastAPI application entry point for PitScout."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    admin,
    analysis,
    analytics,
    datasets,
    feedback,
    health,
    inspect,
    inspections,
    models,
    pothole_reports,
    potholes,
    reports,
    training,
    video,
)
from app.core.config import settings
from app.core.logging_config import setup_logging
from app.core.rate_limit import RateLimitMiddleware
from app.database.session import init_db

logger = logging.getLogger("pitscout.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: start-up and tear-down."""
    setup_logging()
    logger.info("Starting %s API v%s", settings.APP_NAME, settings.APP_VERSION)

    for directory in (
        settings.STORAGE_DIR,
        settings.UPLOADS_DIR,
        settings.ANNOTATED_DIR,
        settings.REPORTS_DIR,
        settings.VIDEO_DIR,
        settings.KEYFRAMES_DIR,
        settings.EVIDENCE_DIR,
    ):
        directory.mkdir(parents=True, exist_ok=True)
    logger.info("Storage directories confirmed at: %s", settings.STORAGE_DIR)

    init_db()
    logger.info("Database schema initialized.")

    if not settings.API_KEY:
        logger.warning(
            "ROADGUARD_API_KEY is not set. Protected endpoints will answer 503 until it is configured."
        )

    logger.info("Detection model ready: %s (%s)", settings.DETECTION_MODEL_PATH.exists(), settings.DETECTION_MODEL_PATH)
    logger.info("Authenticity model ready: %s (%s)", settings.AUTHENTICITY_MODEL_PATH.exists(), settings.AUTHENTICITY_MODEL_PATH)

    yield

    logger.info("Shutting down %s API.", settings.APP_NAME)


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI pothole detection, GPS reporting and duplicate identification platform",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Explicit origin allow-list. Credentials stay disabled because authentication
# uses a server-to-server API key, never browser cookies.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Idempotency-Key"],
)
app.add_middleware(
    RateLimitMiddleware,
    limit=settings.RATE_LIMIT_REQUESTS_PER_MINUTE,
    window_seconds=60,
)

app.include_router(health.router)
app.include_router(inspect.router)
app.include_router(feedback.router)
app.include_router(analysis.router)
app.include_router(analytics.router)
app.include_router(datasets.router)
app.include_router(training.router)
app.include_router(reports.router)
app.include_router(inspections.router)
app.include_router(models.router)
app.include_router(admin.router)
app.include_router(video.router)
app.include_router(pothole_reports.router)
app.include_router(potholes.router)


@app.get("/health")
async def health_root():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "auth_configured": bool(settings.API_KEY),
        "detection_model_ready": settings.DETECTION_MODEL_PATH.exists(),
    }


@app.get("/ready")
async def readiness_probe():
    from app.ml.registry import registry

    return {
        "status": "ready" if registry.is_all_ready() else "degraded",
        "models_ready": registry.is_all_ready(),
        "detection_weights_present": settings.DETECTION_MODEL_PATH.exists(),
        "components": registry.health(),
    }


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "online",
        "docs": "/docs",
        "health": "/api/v1/health",
    }
