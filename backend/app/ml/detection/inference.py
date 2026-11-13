"""YOLO inference wrapper — detection ML module."""
from __future__ import annotations

import logging
from typing import List, Optional
from PIL import Image

logger = logging.getLogger("roadguard.ml.detection")

# Re-use the same loading logic from detection_service to avoid duplicate model instances
from app.services.detection_service import run_detection, DetectionServiceResult


def run_inference(pil_image: Image.Image) -> DetectionServiceResult:
    """Public entrypoint for the detection ML module."""
    return run_detection(pil_image)
