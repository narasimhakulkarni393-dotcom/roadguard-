import time
from typing import Dict, Tuple
from sqlalchemy import text
from app.db.base import Base
from app.db.session import engine
from app.core.logging import get_logger

logger = get_logger("app.db.init")


async def check_database_health() -> Tuple[bool, float, str]:
    """
    Executes a lightweight query against the database to measure connectivity and response latency.
    Returns (is_healthy, latency_ms, message).
    """
    start_time = time.perf_counter()
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        latency = (time.perf_counter() - start_time) * 1000
        return True, round(latency, 2), "Database connection healthy"
    except Exception as exc:
        latency = (time.perf_counter() - start_time) * 1000
        logger.error(f"Database health check failed: {exc}")
        return False, round(latency, 2), str(exc)


async def init_models() -> None:
    """Creates database tables directly from SQLAlchemy metadata (used for testing and local dev)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables verified/initialized")
