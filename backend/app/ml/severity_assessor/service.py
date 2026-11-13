"""Severity Assessment Service.

Stage 6: Evaluates severity level (low, medium, high, critical) based on visible geometry,
defect type, confidence, and roadway hazard.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger("roadguard.ml.severity_assessor")


class SeverityAssessment(BaseModel):
    level: str  # low | medium | high | critical
    score: int  # 0 to 100
    factors: List[str]
    priority: str  # routine | expedited | urgent | emergency
    ruleset_version: str = "severity_rules_v1.0"
    uncertainty_note: str = (
        "Severity is estimated from 2D pixel area and visible geometry. "
        "Physical depth, volume, or structural subgrade distress cannot be measured without calibrated 3D sensors or field probing."
    )


def assess_defect_severity(
    class_name: str,
    bbox: List[int],
    img_w: int,
    img_h: int,
    confidence: float,
    total_detections: int = 1,
) -> SeverityAssessment:
    """Assess severity objectively and explainably."""
    x1, y1, x2, y2 = bbox
    bw = max(1, x2 - x1)
    bh = max(1, y2 - y1)
    area = bw * bh
    img_area = max(1, img_w * img_h)
    area_ratio = area / img_area

    factors = []
    score = 30

    # 1. Immediate Critical Public Safety Hazards
    if class_name == "sewage_hole":
        factors.append("Open utility void poses immediate wheel drop and pedestrian hazard")
        factors.append("Visible surface cavity without cover")
        return SeverityAssessment(
            level="critical",
            score=95,
            factors=factors,
            priority="emergency",
        )

    # 2. Defect Specific Rules
    if class_name == "pothole":
        if area_ratio > settings.SEVERITY_CRITICAL_AREA_RATIO or (bw > 300 and bh > 220):
            level = "critical"
            score = 90
            factors.append("Severe large pothole spanning significant roadway lane width")
            priority = "emergency"
        elif area_ratio > settings.SEVERITY_HIGH_AREA_RATIO or (bw > 180 and bh > 140):
            level = "high"
            score = 78
            factors.append("High vehicle wheel impact area with deep cavity indicators")
            priority = "urgent"
        elif area_ratio > 0.015:
            level = "medium"
            score = 58
            factors.append("Moderate localized asphalt depression")
            priority = "expedited"
        else:
            level = "low"
            score = 35
            factors.append("Early stage shallow surface loss")
            priority = "routine"

    elif class_name == "alligator_crack":
        if area_ratio > 0.06:
            level = "high"
            score = 80
            factors.append("Extensive interconnected block cracking indicating subgrade fatigue")
            priority = "urgent"
        else:
            level = "medium"
            score = 62
            factors.append("Structural crocodile pattern cracking along wheel path")
            priority = "expedited"

    elif class_name in ("longitudinal_crack", "transverse_crack"):
        max_extent = max(bw, bh)
        if max_extent > 350:
            level = "high"
            score = 72
            factors.append(f"Significant crack extension ({max_extent}px) prone to water infiltration")
            priority = "urgent"
        elif max_extent > 160:
            level = "medium"
            score = 50
            factors.append(f"Moderate linear crack ({max_extent}px) requiring sealant")
            priority = "expedited"
        else:
            level = "low"
            score = 30
            factors.append("Minor hairline crack")
            priority = "routine"

    elif class_name == "manhole_cover":
        level = "medium"
        score = 52
        factors.append("Utility casting frame subject to differential settlement with surrounding asphalt")
        priority = "routine"

    else:
        level = "low"
        score = 25
        factors.append("Surface anomaly")
        priority = "routine"

    # Multi-defect density factor
    if total_detections > 3:
        factors.append(f"High defect cluster density ({total_detections} defects detected in scene)")
        score = min(100, score + 10)

    return SeverityAssessment(
        level=level,
        score=score,
        factors=factors,
        priority=priority,
    )
