from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.router import api_v1_router
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import get_logger, setup_logging
from app.db.init_db import check_database_health, init_models
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.request_id import RequestIdMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.middleware.timing import ProcessTimeMiddleware

logger = get_logger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan context manager handling startup and shutdown events."""
    # 1. Initialize logging
    setup_logging()
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION} [{settings.ENVIRONMENT}]")

    # 2. Verify database connection & initialize tables if in local/test environment
    try:
        is_healthy, latency, msg = await check_database_health()
        if is_healthy:
            logger.info(f"Database connected successfully (latency: {latency}ms)")
        else:
            logger.warning(f"Database connection warning at startup: {msg}")

        # In dev/test environments with sqlite, auto-create tables if missing
        if "sqlite" in settings.DATABASE_URL or settings.ENVIRONMENT == "development":
            await init_models()
    except Exception as exc:
        logger.error(f"Error during database initialization: {exc}")

    yield

    # Shutdown
    logger.info(f"Shutting down {settings.APP_NAME}")


def create_application() -> FastAPI:
    """FastAPI application factory configuring middleware, exception handlers, and API routers."""
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="Production-Ready Enterprise Backend for Hackvally built with FastAPI, PostgreSQL & SQLAlchemy 2.0.",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # 1. Custom Middlewares (order matters: executed outer to inner)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(ProcessTimeMiddleware)
    app.add_middleware(RequestIdMiddleware)

    # 2. CORS Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-Process-Time"],
    )

    # 3. Global Exception Handlers
    register_exception_handlers(app)

    # 4. Mount API Routes
    app.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)

    # 5. Preserve original root endpoint for backwards compatibility
    @app.get("/", tags=["Root"])
    def home():
        return {
            "message": "Hackvally API is running successfully!",
            "docs": "/docs",
            "health": f"{settings.API_V1_PREFIX}/health"
        }

    return app


# Application instance for Uvicorn
app = create_application()
