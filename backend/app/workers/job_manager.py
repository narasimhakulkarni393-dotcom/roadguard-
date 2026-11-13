"""Background job manager for analysis pipeline."""
from __future__ import annotations

import asyncio
import datetime
import json
import logging
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.database.session import SessionLocal
from app.models.database import Analysis, Detection, Inspection
from app.services.image_validation import validate_image
from app.services.authenticity_service import analyse_authenticity
from app.services.detection_service import run_detection
from app.services.measurement_service import measure_detection
from app.services.severity_service import calculate_severity
from app.services.cause_service import analyse_causes, get_recommended_actions
from app.services.annotation_service import annotate_image
from app.services.report_service import build_analysis_response

logger = logging.getLogger("roadguard.job_manager")


def _update_analysis_stage(db: Session, analysis_id: str, stage: str, status: str = "processing") -> None:
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if analysis:
        analysis.pipeline_stage = stage
        analysis.status = status
        db.commit()


async def run_analysis_pipeline(
    analysis_id: str,
    inspection_id: str,
    image_path: Path,
    original_filename: str,
) -> None:
    """Full 8-stage analysis pipeline, runs in a background asyncio task."""
    db = SessionLocal()
    try:
        started_at = datetime.datetime.utcnow()
        analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
        if not analysis:
            logger.error("Analysis %s not found", analysis_id)
            return
        analysis.started_at = started_at
        analysis.status = "processing"
        db.commit()

        # --- Stage 1: Image validation ---
        _update_analysis_stage(db, analysis_id, "image_validation")
        file_bytes = image_path.read_bytes()
        created_at = analysis.started_at or datetime.datetime.utcnow()
        validation = validate_image(file_bytes, original_filename)
        if not validation.valid:
            analysis.status = "failed"
            analysis.error_message = f"Image validation failed: {validation.error}"
            analysis.pipeline_stage = "image_validation"
            db.commit()
            return

        pil_image = validation.pil_image

        # --- Stage 2: Authenticity ---
        _update_analysis_stage(db, analysis_id, "authenticity_check")
        authenticity = await asyncio.get_event_loop().run_in_executor(
            None, analyse_authenticity, pil_image
        )

        # --- Stage 3: Detection ---
        _update_analysis_stage(db, analysis_id, "detection")
        detection_result = await asyncio.get_event_loop().run_in_executor(
            None, run_detection, pil_image
        )

        raw_detections = detection_result.detections
        total_detections = len(raw_detections)

        # --- Stages 4-7: Measure, Severity, Causes per detection ---
        _update_analysis_stage(db, analysis_id, "measurement_severity_causes")
        measurements = []
        severities = []
        all_causes = []
        all_actions = []

        for det in raw_detections:
            meas = measure_detection(det, detection_result.image_width, detection_result.image_height)
            sev = calculate_severity(det, meas, total_detections)
            cau = analyse_causes(det.class_name)
            acts = get_recommended_actions(det.class_name, sev.level)
            measurements.append(meas)
            severities.append(sev)
            all_causes.append(cau)
            all_actions.append(acts)

            # Persist detection
            det_record = Detection(
                analysis_id=analysis_id,
                class_name=det.class_name,
                class_id=det.class_id,
                confidence=det.confidence,
                bbox_x1=det.x1,
                bbox_y1=det.y1,
                bbox_x2=det.x2,
                bbox_y2=det.y2,
                width_px=meas.width_pixels,
                height_px=meas.height_pixels,
                area_px=meas.area_pixels,
                severity_level=sev.level,
                severity_score=sev.score,
                severity_factors=[{"name": f.name, "contribution": f.contribution} for f in sev.factors],
                possible_causes=[c.cause for c in cau],
                recommended_actions=acts,
            )
            db.add(det_record)
        db.commit()

        # --- Stage 8: Annotation + report assembly ---
        _update_analysis_stage(db, analysis_id, "annotation")
        annotated_path: Optional[Path] = None
        annotated_url: Optional[str] = None
        if raw_detections and pil_image:
            try:
                annotated_path = await asyncio.get_event_loop().run_in_executor(
                    None, annotate_image, pil_image, raw_detections, analysis_id
                )
                annotated_url = f"/api/v1/analysis/{analysis_id}/annotated-image"
            except Exception as exc:
                logger.warning("Annotation failed: %s", exc)

        _update_analysis_stage(db, analysis_id, "report_assembly")
        response = build_analysis_response(
            analysis_id=analysis_id,
            inspection_id=inspection_id,
            created_at=created_at,
            validation=validation,
            authenticity=authenticity,
            detection_result=detection_result,
            raw_detections=raw_detections,
            measurements=measurements,
            severities=severities,
            causes=all_causes,
            recommended_actions=all_actions,
            annotated_image_url=annotated_url,
        )

        # Persist result
        analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
        analysis.status = "completed"
        analysis.pipeline_stage = "done"
        analysis.completed_at = datetime.datetime.utcnow()
        analysis.result_json = response.model_dump_json()

        # Update inspection status
        inspection = db.query(Inspection).filter(Inspection.id == inspection_id).first()
        if inspection:
            inspection.status = "completed"

        db.commit()
        logger.info("Analysis %s completed successfully.", analysis_id)

    except Exception as exc:
        logger.exception("Pipeline error for analysis %s: %s", analysis_id, exc)
        try:
            analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
            if analysis:
                analysis.status = "failed"
                analysis.error_message = str(exc)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
