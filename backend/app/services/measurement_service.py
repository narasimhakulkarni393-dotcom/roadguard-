"""Stage 4 — Measurement service."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.services.detection_service import RawDetection


@dataclass
class Measurement:
    width_pixels: float
    height_pixels: float
    area_pixels: float
    shape_ratio: float
    relative_area: float
    measurement_method: str
    real_world_width_m: Optional[float]
    real_world_height_m: Optional[float]
    limitation: str


def measure_detection(det: RawDetection, image_width: int, image_height: int) -> Measurement:
    w = det.x2 - det.x1
    h = det.y2 - det.y1
    area = w * h
    img_area = image_width * image_height
    relative_area = area / img_area if img_area > 0 else 0.0
    shape_ratio = w / h if h > 0 else 1.0

    return Measurement(
        width_pixels=round(w, 2),
        height_pixels=round(h, 2),
        area_pixels=round(area, 2),
        shape_ratio=round(shape_ratio, 3),
        relative_area=round(relative_area, 6),
        measurement_method="pixel_only",
        real_world_width_m=None,
        real_world_height_m=None,
        limitation=(
            "Real-world dimensions cannot be computed without camera calibration data "
            "(focal length, altitude, or known reference objects)."
        ),
    )
