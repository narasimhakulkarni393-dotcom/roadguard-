"""Annotation service — draws bounding boxes on images using OpenCV."""
from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import List

import cv2
import numpy as np
from PIL import Image

from app.core.config import settings
from app.services.detection_service import RawDetection

logger = logging.getLogger("roadguard.annotation")

# BGR colours (OpenCV uses BGR)
CLASS_COLOURS = {
    "Pothole": (68, 68, 239),          # #EF4444 → BGR
    "Longitudinal Crack": (235, 130, 59),  # #3B82F6 → BGR
    "Transverse Crack": (8, 179, 234),    # #EAB308 → BGR
    "Alligator Crack": (22, 115, 249),   # #F97316 → BGR
}
DEFAULT_COLOUR = (0, 255, 0)


def annotate_image(
    pil_image: Image.Image,
    detections: List[RawDetection],
    analysis_id: str,
) -> Path:
    """Draw bounding boxes, save annotated image, return its path."""
    img = cv2.cvtColor(np.array(pil_image.convert("RGB")), cv2.COLOR_RGB2BGR)
    h, w = img.shape[:2]
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = max(0.4, min(1.2, w / 800))
    thickness = max(1, int(w / 400))

    for idx, det in enumerate(detections):
        colour = CLASS_COLOURS.get(det.class_name, DEFAULT_COLOUR)
        x1, y1, x2, y2 = int(det.x1), int(det.y1), int(det.x2), int(det.y2)

        # Bounding box
        cv2.rectangle(img, (x1, y1), (x2, y2), colour, thickness + 1)

        # Label background
        label = f"[{idx+1}] {det.class_name} {det.confidence:.2f}"
        (lw, lh), baseline = cv2.getTextSize(label, font, font_scale, thickness)
        label_y = max(y1 - 5, lh + 5)
        cv2.rectangle(img, (x1, label_y - lh - baseline), (x1 + lw, label_y + baseline), colour, -1)

        # Label text (white)
        cv2.putText(img, label, (x1, label_y), font, font_scale, (255, 255, 255), thickness)

    # Save
    settings.ANNOTATED_DIR.mkdir(parents=True, exist_ok=True)
    out_path = settings.ANNOTATED_DIR / f"{analysis_id}_annotated.jpg"
    cv2.imwrite(str(out_path), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    logger.info("Annotated image saved to %s", out_path)
    return out_path
