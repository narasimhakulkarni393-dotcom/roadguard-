from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings
from app.database.base import Base
import logging

logger = logging.getLogger("roadguard.db")


def is_sqlite(url: str | None = None) -> bool:
    return (url or settings.DATABASE_URL).startswith("sqlite")


def engine_options(url: str) -> dict:
    """Engine options per backend. SQLite needs thread sharing; Postgres needs liveness checks."""
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    return {"pool_pre_ping": True, "pool_recycle": 300}


engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    **engine_options(settings.DATABASE_URL),
)

if is_sqlite():
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        """Enable WAL mode and foreign keys on every new SQLite connection."""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    """Create all tables if they don't exist."""
    # Import models so they are registered on Base.metadata
    import app.models.database  # noqa: F401
    Base.metadata.create_all(bind=engine)
    backend = "SQLite WAL" if is_sqlite() else "PostgreSQL"
    logger.info("Database initialised (%s).", backend)


def get_db():
    """FastAPI dependency — yields a DB session and closes it afterwards."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
