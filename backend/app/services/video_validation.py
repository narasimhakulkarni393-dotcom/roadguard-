"""Video container validation by extension and magic bytes.

Container sniffing only proves the file claims to be a video; the pipeline
still verifies that OpenCV can decode frames.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from app.core.config import settings


def detect_video_container(file_bytes: bytes) -> Optional[str]:
    head = file_bytes[:16]
    if len(head) >= 12 and head[4:8] == b"ftyp":
        return "isobmff"  # mp4 / mov / m4v
    if head[:4] == b"RIFF" and file_bytes[8:12] == b"AVI ":
        return "avi"
    if head[:4] == b"\x1a\x45\xdf\xa3":
        return "matroska"  # webm / mkv
    return None


def validate_video_upload(header: bytes, total_size: int, original_filename: str) -> Optional[str]:
    """Return an error message, or None when the upload looks acceptable.

    ``header`` is the first bytes of the stream; ``total_size`` is the full size.
    """
    suffix = Path(original_filename or "").suffix.lower()
    if suffix not in settings.ALLOWED_VIDEO_EXTENSIONS:
        allowed = ", ".join(sorted(settings.ALLOWED_VIDEO_EXTENSIONS))
        return f"File type '{suffix or 'unknown'}' is not allowed. Allowed: {allowed}"
    if total_size <= 0:
        return "Uploaded file is empty."
    if total_size > settings.MAX_VIDEO_SIZE_MB * 1024 * 1024:
        return f"File exceeds maximum size of {settings.MAX_VIDEO_SIZE_MB} MB."
    if detect_video_container(header) is None:
        return "File signature does not match a supported video container."
    return None
