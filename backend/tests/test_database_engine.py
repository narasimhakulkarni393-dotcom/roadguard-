"""Database engine configuration — SQLite vs PostgreSQL options."""
from app.database.session import engine_options, is_sqlite
from app.core.config import settings


def test_sqlite_uses_thread_sharing_and_no_pool_pre_ping():
    opts = engine_options("sqlite:///./roadguard.db")
    assert opts == {"connect_args": {"check_same_thread": False}}


def test_postgres_uses_liveness_pool_options():
    opts = engine_options("postgresql://user:pass@host:5432/db")
    assert opts["pool_pre_ping"] is True
    assert "connect_args" not in opts


def test_is_sqlite_detects_scheme():
    assert is_sqlite("sqlite:///x.db") is True
    assert is_sqlite("postgresql://u:p@h/db") is False


def test_postgres_scheme_is_normalised():
    assert not settings.DATABASE_URL.startswith("postgres://")
