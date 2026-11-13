from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any, Dict
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool, QueuePool
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("app.db.session")


def create_engine_and_sessionmaker() -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    """Creates the configured async database engine and sessionmaker."""
    db_url = settings.DATABASE_URL

    engine_kwargs: Dict[str, Any] = {
        "echo": settings.DEBUG,
        "future": True,
    }

    if "sqlite" in db_url:
        # SQLite async engine configuration
        if ":memory:" in db_url:
            from sqlalchemy.pool import StaticPool
            engine_kwargs["poolclass"] = StaticPool
            engine_kwargs["connect_args"] = {"check_same_thread": False}
        else:
            engine_kwargs["poolclass"] = NullPool
            engine_kwargs["connect_args"] = {"check_same_thread": False}
    else:
        # PostgreSQL / production pool configuration
        engine_kwargs["poolclass"] = QueuePool
        engine_kwargs["pool_size"] = settings.DATABASE_POOL_SIZE
        engine_kwargs["max_overflow"] = settings.DATABASE_MAX_OVERFLOW
        engine_kwargs["pool_timeout"] = settings.DATABASE_POOL_TIMEOUT
        engine_kwargs["pool_pre_ping"] = True

    engine = create_async_engine(db_url, **engine_kwargs)
    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )
    return engine, session_factory


engine, AsyncSessionLocal = create_engine_and_sessionmaker()


@asynccontextmanager
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Context manager for acquiring an isolated database session with auto-rollback on error."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
