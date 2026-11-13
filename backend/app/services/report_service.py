"""Stage 8 — Report assembly service."""
from __future__ import annotations

import datetime
import json
import logging
import uuid
from typing import List, Optional

from app.schemas.analysis import (
    AnalysisResponse,
    AnalysisSummary,
    AuthenticityResult,
    BoundingBox,
    CauseItem,
    DetectionItem,
    ImageInfo,
    MeasurementResult,
    QualityResult,
    SeverityFactor,
    SeverityResult,
)
from app.services.detection_service import RawDetection, DetectionServiceResult
from app.services.measurement_service import Measurement
from app.services.severity_service import SeverityAnalysis
from app.services.cause_service import CauseEntry
from app.services.image_validation import ImageValidationResult
from app.services.authenticity_service import AuthenticityAnalysisResult

logger = logging.getLogger("roadguard.report")


def _overall_severity(detections: List[DetectionItem]) -> tuple[str, float]:
    if not detections:
        return "NONE", 0.0
    scores = [d.severity.score for d in detections]
    max_score = max(scores)
    if max_score >= 75:
        return "CRITICAL", max_score
    if max_score >= 50:
        return "HIGH", max_score
    if max_score >= 25:
        return "MODERATE", max_score
    return "LOW", max_score


def _road_condition(severity: str) -> str:
    mapping = {"NONE": "good", "LOW": "good", "MODERATE": "fair", "HIGH": "poor", "CRITICAL": "critical"}
    return mapping.get(severity, "unknown")


def build_analysis_response(
    analysis_id: str,
    inspection_id: str,
    created_at: datetime.datetime,
    validation: ImageValidationResult,
    authenticity: AuthenticityAnalysisResult,
    detection_result: DetectionServiceResult,
    raw_detections: List[RawDetection],
    measurements: List[Measurement],
    severities: List[SeverityAnalysis],
    causes: List[List[CauseEntry]],
    recommended_actions: List[List[str]],
    annotated_image_url: Optional[str],
) -> AnalysisResponse:
    # Build detection items
    detection_items: List[DetectionItem] = []
    for idx, (det, meas, sev, cau, acts) in enumerate(
        zip(raw_detections, measurements, severities, causes, recommended_actions)
    ):
        det_id = str(uuid.uuid4())[:8]
        detection_items.append(DetectionItem(
            detection_id=det_id,
            class_id=det.class_id,
            class_name=det.class_name,
            display_name=f"{det.class_code} — {det.class_name}",
            confidence=det.confidence,
            bbox=BoundingBox(x1=det.x1, y1=det.y1, x2=det.x2, y2=det.y2),
            measurements=MeasurementResult(
                width_pixels=meas.width_pixels,
                height_pixels=meas.height_pixels,
                area_pixels=meas.area_pixels,
                shape_ratio=meas.shape_ratio,
                relative_area=meas.relative_area,
                measurement_method=meas.measurement_method,
                real_world_width_m=meas.real_world_width_m,
                real_world_height_m=meas.real_world_height_m,
                limitation=meas.limitation,
            ),
            severity=SeverityResult(
                level=sev.level,
                score=sev.score,
                factors=[
                    SeverityFactor(
                        name=f.name,
                        value=f.value,
                        max_value=f.max_value,
                        contribution=f.contribution,
                        description=f.description,
                    )
                    for f in sev.factors
                ],
            ),
            possible_causes=[
                CauseItem(
                    cause=c.cause,
                    likelihood=c.likelihood,
                    supporting_observations=c.supporting_observations,
                    recommended_inspection=c.recommended_inspection,
                )
                for c in cau
            ],
            recommended_actions=acts,
        ))

    # Summary
    overall_sev, overall_score = _overall_severity(detection_items)
    road_cond = _road_condition(overall_sev)
    classes_found = list({d.class_name for d in detection_items})
    priority_issues = [
        f"{d.class_name} at severity {d.severity.level}"
        for d in detection_items
        if d.severity.level in ("HIGH", "CRITICAL")
    ]
    immediate_action = overall_sev in ("HIGH", "CRITICAL")

    summary = AnalysisSummary(
        total_detections=len(detection_items),
        damage_classes_found=classes_found,
        overall_severity=overall_sev,
        overall_severity_score=round(overall_score, 2),
        road_condition=road_cond,
        immediate_action_required=immediate_action,
        priority_issues=priority_issues,
    )

    quality_issues = []
    if validation.is_blurry:
        quality_issues.append("Image is blurry — detection accuracy may be reduced.")
    if validation.exposure_quality != "normal":
        quality_issues.append(f"Image appears {validation.exposure_quality}.")
    quality_score = 100.0
    if validation.is_blurry:
        quality_score -= 30
    if validation.exposure_quality != "normal":
        quality_score -= 20

    return AnalysisResponse(
        analysis_id=analysis_id,
        inspection_id=inspection_id,
        status="completed",
        created_at=created_at,
        completed_at=datetime.datetime.utcnow(),
        image_info=ImageInfo(
            filename=validation.filename,
            file_size_bytes=validation.file_size_bytes,
            width=validation.width,
            height=validation.height,
            format=validation.format,
            mode=validation.mode,
            md5_hash=validation.md5_hash,
            blur_score=round(validation.blur_score, 2),
            is_blurry=validation.is_blurry,
            brightness=round(validation.brightness, 2),
            exposure_quality=validation.exposure_quality,
            exif_orientation_corrected=validation.exif_orientation_corrected,
        ),
        authenticity=AuthenticityResult(
            verdict=authenticity.verdict,
            confidence=authenticity.confidence,
            model_used=authenticity.model_used,
            factors=authenticity.factors,
            limitations=authenticity.limitations,
        ),
        quality=QualityResult(
            is_acceptable=quality_score >= 50,
            issues=quality_issues,
            score=max(0.0, quality_score),
        ),
        model_ready=detection_result.model_ready,
        detections=detection_items,
        annotated_image_url=annotated_image_url,
        summary=summary,
    )
