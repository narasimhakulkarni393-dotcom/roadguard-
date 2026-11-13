"""Stage 6 — Explainable severity engine."""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List

from app.services.detection_service import RawDetection
from app.services.measurement_service import Measurement

# Base type scores (out of 30)
TYPE_SCORES = {
    "Pothole": 30,
    "Alligator Crack": 25,
    "Longitudinal Crack": 20,
    "Transverse Crack": 15,
}


@dataclass
class SeverityFactor:
    name: str
    value: float
    max_value: float
    contribution: float
    description: str


@dataclass
class SeverityAnalysis:
    level: str
    score: float
    factors: List[SeverityFactor] = field(default_factory=list)


def _level_from_score(score: float) -> str:
    if score < 25:
        return "LOW"
    if score < 50:
        return "MODERATE"
    if score < 75:
        return "HIGH"
    return "CRITICAL"


def calculate_severity(
    det: RawDetection,
    meas: Measurement,
    total_detections: int = 1,
) -> SeverityAnalysis:
    factors: List[SeverityFactor] = []

    # 1. Area factor (0 – 30 points)
    area_pct = meas.relative_area * 100  # percentage of image
    area_score = min(30.0, area_pct * 200)  # 0.15% → 30 pts
    factors.append(SeverityFactor(
        name="area",
        value=round(meas.relative_area, 5),
        max_value=0.15,
        contribution=round(area_score, 2),
        description="Relative size of damage bounding box vs full image.",
    ))

    # 2. Type factor (0 – 30 points)
    type_score = float(TYPE_SCORES.get(det.class_name, 15))
    factors.append(SeverityFactor(
        name="damage_type",
        value=1.0,
        max_value=1.0,
        contribution=type_score,
        description=f"Intrinsic severity weight for {det.class_name}.",
    ))

    # 3. Confidence factor (0 – 20 points)
    conf_score = det.confidence * 20
    factors.append(SeverityFactor(
        name="confidence",
        value=round(det.confidence, 4),
        max_value=1.0,
        contribution=round(conf_score, 2),
        description="Detection confidence × 20.",
    ))

    # 4. Shape factor (0 – 10 points) — potholes more severe when squarish
    if det.class_name == "Pothole":
        # circularity proxy: 1 when square, 0 when very elongated
        ratio = meas.shape_ratio
        squareness = 1.0 - abs(1.0 - ratio) / max(ratio, 1 / ratio)
        shape_score = squareness * 10
    else:
        shape_score = 0.0
    factors.append(SeverityFactor(
        name="shape",
        value=round(meas.shape_ratio, 3),
        max_value=1.0,
        contribution=round(shape_score, 2),
        description="For potholes: more circular → higher severity.",
    ))

    # 5. Multi-defect factor (0 – 10 points)
    multi_score = min(10.0, (total_detections - 1) * 2.5)
    factors.append(SeverityFactor(
        name="multi_defect",
        value=float(total_detections),
        max_value=5.0,
        contribution=round(multi_score, 2),
        description="Multiple detected defects compound overall severity.",
    ))

    total = area_score + type_score + conf_score + shape_score + multi_score
    # Normalise to 0-100 (max possible ≈ 30+30+20+10+10 = 100)
    score = min(100.0, max(0.0, total))

    return SeverityAnalysis(
        level=_level_from_score(score),
        score=round(score, 2),
        factors=factors,
    )
