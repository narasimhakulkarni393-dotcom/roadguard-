import uuid
import datetime

from sqlalchemy import Column, String, DateTime, Float, Integer, Text, Boolean, JSON, ForeignKey
from sqlalchemy.orm import declarative_base, relationship  # noqa: F401

Base = declarative_base()


def gen_uuid() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime.datetime:
    """Naive UTC timestamp (stored columns are timezone-naive)."""
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
