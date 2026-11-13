"""Stage 1 — Image validation service."""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image, ExifTags
from app.core.config import settings

# Enforce decompression bomb protection
Image.MAX_IMAGE_PIXELS = settings.MAX_IMAGE_PIXELS

logger = logging.getLogger("roadguard.image_validation")

MAGIC_BYTES: dict[str, bytes] = {
    ".jpg": b"\xff\xd8\xff",
    ".jpeg": b"\xff\xd8\xff",
    ".png": b"\x89PNG",
    ".webp": b"RIFF",
    ".bmp": b"BM",
    ".tiff": b"\x49\x49\x2a\x00",  # little-endian TIFF
}


@dataclass
class ImageValidationResult:
    valid: bool
    filename: str
    file_size_bytes: int
    width: int = 0
    height: int = 0
    format: str = ""
    mode: str = ""
    md5_hash: str = ""
    blur_score: float = 0.0
    is_blurry: bool = False
    brightness: float = 0.0
    exposure_quality: str = "unknown"
    exif_orientation_corrected: bool = False
    error: Optional[str] = None
    pil_image: Optional[Image.Image] = None


def _fix_exif_orientation(img: Image.Image) -> tuple[Image.Image, bool]:
    """Return image with EXIF orientation corrected, and a flag indicating if it was rotated."""
    try:
        exif = img._getexif()  # type: ignore[attr-defined]
        if exif is None:
            return img, False
        for tag, value in exif.items():
            if ExifTags.TAGS.get(tag) == "Orientation":
                ops = {
                    3: Image.ROTATE_180,
                    6: Image.ROTATE_270,
                    8: Image.ROTATE_90,
                }
                if value in ops:
                    img = img.transpose(ops[value])
                    return img, True
    except Exception:
        pass
    return img, False


def _compute_blur_score(img: Image.Image) -> float:
    """Laplacian variance — higher = sharper."""
    try:
        import cv2  # type: ignore

        gray = np.array(img.convert("L"))
        lap = cv2.Laplacian(gray, cv2.CV_64F)
        return float(lap.var())
    except Exception:
        return 100.0  # default: assume not blurry if we can't check


def _compute_brightness(img: Image.Image) -> float:
    """Mean pixel brightness in [0, 255]."""
    gray = np.array(img.convert("L"), dtype=np.float32)
    return float(gray.mean())


def validate_image(file_bytes: bytes, original_filename: str) -> ImageValidationResult:
    suffix = Path(original_filename).suffix.lower()
    result = ImageValidationResult(
        valid=False,
        filename=original_filename,
        file_size_bytes=len(file_bytes),
    )

    # 1. Magic-byte check
    expected_magic = MAGIC_BYTES.get(suffix)
    if expected_magic and not file_bytes[:8].startswith(expected_magic):
        # Try .webp deeper check
        if suffix == ".webp" and not (file_bytes[:4] == b"RIFF" and file_bytes[8:12] == b"WEBP"):
            result.error = "File magic bytes do not match declared extension."
            return result

    # 2. Open with Pillow
    try:
        from io import BytesIO
        pil_img = Image.open(BytesIO(file_bytes))
        pil_img.verify()  # raises on corrupt file
        pil_img = Image.open(BytesIO(file_bytes))  # re-open after verify
    except Exception as exc:
        result.error = f"Cannot decode image: {exc}"
        return result

    # 3. EXIF orientation
    pil_img, corrected = _fix_exif_orientation(pil_img)
    result.exif_orientation_corrected = corrected

    # 4. Dimensions / format
    result.width, result.height = pil_img.size
    result.format = pil_img.format or suffix.lstrip(".")
    result.mode = pil_img.mode

    if result.width < settings.MIN_IMAGE_DIMENSION or result.height < settings.MIN_IMAGE_DIMENSION:
        result.error = f"Image dimensions {result.width}x{result.height} are below minimum allowed {settings.MIN_IMAGE_DIMENSION}x{settings.MIN_IMAGE_DIMENSION}."
        return result

    if result.width > settings.MAX_IMAGE_DIMENSION or result.height > settings.MAX_IMAGE_DIMENSION:
        result.error = f"Image dimensions {result.width}x{result.height} exceed maximum allowed {settings.MAX_IMAGE_DIMENSION}x{settings.MAX_IMAGE_DIMENSION}."
        return result

    # 5. MD5
    result.md5_hash = hashlib.md5(file_bytes).hexdigest()

    # 6. Blur
    result.blur_score = _compute_blur_score(pil_img)
    result.is_blurry = result.blur_score < 50.0

    # 7. Brightness / exposure
    result.brightness = _compute_brightness(pil_img)
    if result.brightness < 30:
        result.exposure_quality = "underexposed"
    elif result.brightness > 230:
        result.exposure_quality = "overexposed"
    else:
        result.exposure_quality = "normal"

    result.valid = True
    result.pil_image = pil_img
    return result
