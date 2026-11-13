"""FastAPI application entry point for RoadGuard AI."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.logging_config import setup_logging
from app.database.session import init_db
from app.api.routes import (
    health,
    analysis,
    analytics,
    datasets,
    training,
    reports,
    inspections,
    models,
    inspect,
    feedback,
    admin,
)

logger = logging.getLogger("roadguard.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: start-up and tear-down."""
    setup_logging()
    logger.info("Starting RoadGuard AI API v%s", settings.APP_VERSION)

    # 1. Ensure storage directories exist
    for d in (settings.STORAGE_DIR, settings.UPLOADS_DIR, settings.ANNOTATED_DIR, settings.REPORTS_DIR):
        d.mkdir(parents=True, exist_ok=True)
    logger.info("Storage directories confirmed at: %s", settings.STORAGE_DIR)

    # 2. Initialize database schema
    init_db()
    logger.info("Database schema initialized.")

    # 3. Model status check
    det_ready = settings.DETECTION_MODEL_PATH.exists()
    auth_ready = settings.AUTHENTICITY_MODEL_PATH.exists()
    logger.info("Detection model ready: %s (%s)", det_ready, settings.DETECTION_MODEL_PATH)
    logger.info("Authenticity model ready: %s (%s)", auth_ready, settings.AUTHENTICITY_MODEL_PATH)

    yield

    logger.info("Shutting down RoadGuard AI API.")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-powered road damage detection, measurement, severity analysis & road intelligence platform",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware - allow all origins (including Vercel preview & production domains)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
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

# Mount storage for direct static access if needed
app.mount("/static/annotated", StaticFiles(directory=str(settings.ANNOTATED_DIR)), name="annotated")
app.mount("/static/uploads", StaticFiles(directory=str(settings.UPLOADS_DIR)), name="uploads")


@app.get("/health")
async def health_root():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "mode": "production_pipeline",
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
