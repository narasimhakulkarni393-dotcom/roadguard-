"""Local filesystem storage manager."""
from __future__ import annotations

import logging
import uuid
from pathlib import Path

import aiofiles  # type: ignore

from app.core.config import settings

logger = logging.getLogger("roadguard.storage")


def _ensure_dirs() -> None:
    for d in (settings.UPLOADS_DIR, settings.ANNOTATED_DIR, settings.REPORTS_DIR):
        d.mkdir(parents=True, exist_ok=True)


async def save_upload(file_bytes: bytes, original_filename: str) -> Path:
    """Save raw uploaded bytes with a UUID filename. Returns absolute path."""
    _ensure_dirs()
    suffix = Path(original_filename).suffix.lower()
    filename = f"{uuid.uuid4()}{suffix}"
    dest = settings.UPLOADS_DIR / filename
    async with aiofiles.open(dest, "wb") as f:
        await f.write(file_bytes)
    logger.info("Saved upload: %s (%d bytes)", dest.name, len(file_bytes))
    return dest


def get_upload_path(stored_filename: str) -> Path:
    return settings.UPLOADS_DIR / stored_filename


def get_annotated_path(analysis_id: str) -> Path:
    return settings.ANNOTATED_DIR / f"{analysis_id}_annotated.jpg"
