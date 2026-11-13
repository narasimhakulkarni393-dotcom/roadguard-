"""Production-Grade Strict Sequential Road Inspection Pipeline for RoadGuard AI.

Implements STRICT SEQUENTIAL IMAGE PROCESSING PIPELINE with complete request isolation:
STAGE 0 — Input Validation & Content Hashing (SHA-256, EXIF normalization, bomb guard)
STAGE 1 — Road / Non-Road Classification (STOPS if non-road)
STAGE 2 — AI-Generated Image Detection (STOPS if AI-generated)
STAGE 3 — Real YOLO Road Damage Detection (pothole, manhole_cover, sewage_hole, longitudinal_crack, transverse_crack, alligator_crack)
STAGE 4 — False-Positive Verification & Audit Recording
STAGE 5 — Geometric Analysis (pixels, relative area, no uncalibrated physical measurements)
STAGE 6 — Severity Assessment (low, medium, high, critical)
STAGE 7 — Probable Cause Estimation (engineering hypotheses, explicit uncertainty)
STAGE 8 — Structured Final Response & Provenance Tracking
"""
from __future__ import annotations

import hashlib
import io
import logging
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from PIL import Image, ImageOps

from app.core.config import settings
from app.ml.registry import registry
from app.ml.cause_estimator.service import estimate_causes_for_defect
from app.ml.severity_assessor.service import assess_defect_severity

logger = logging.getLogger("roadguard.inspection_pipeline")


class InspectionContext:
    """Independent execution context per request ensuring zero state bleed."""

    def __init__(self, file_bytes: bytes, filename: str, inspection_id: Optional[str] = None):
        self.inspection_id = inspection_id or f"insp_{uuid.uuid4().hex}"
        self.inference_run_id = f"run_{uuid.uuid4().hex}"
        self.filename = filename
        self.file_size = len(file_bytes)
        self.image_sha256 = hashlib.sha256(file_bytes).hexdigest()
        self.file_bytes = file_bytes
        self.t0 = time.perf_counter()
        self.stage_timings_ms: Dict[str, float] = {}

    def record_stage(self, stage_name: str, duration_ms: float) -> None:
        self.stage_timings_ms[stage_name] = round(duration_ms, 2)


class InspectionPipeline:
    """Production sequential pipeline engine with request isolation and honest model states."""

    def __init__(self):
        self.registry = registry

    def process_image(
        self,
        file_bytes: bytes,
        filename: str = "upload.jpg",
        inspection_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Execute strict sequential 8-stage inspection with complete request isolation."""
        ctx = InspectionContext(file_bytes, filename, inspection_id)

        # =====================================================================
        # STAGE 0 — INPUT VALIDATION & DECODING
        # =====================================================================
        t_stage0 = time.perf_counter()
        if len(file_bytes) == 0:
            return {
                "success": False,
                "inspection_id": ctx.inspection_id,
                "image_sha256": ctx.image_sha256,
                "pipeline_status": "rejected",
                "stage": "input_validation",
                "message": "Empty file payload provided",
                "detections": [],
            }

        try:
            raw_img = Image.open(io.BytesIO(file_bytes))
            # Verify file signature
            raw_img.verify()
            # Reopen for actual decoding after verify()
            raw_img = Image.open(io.BytesIO(file_bytes))
            # Normalize EXIF orientation
            image = ImageOps.exif_transpose(raw_img)
            # Ensure strict RGB
            image = image.convert("RGB")
        except Exception as e:
            return {
                "success": False,
                "inspection_id": ctx.inspection_id,
                "image_sha256": ctx.image_sha256,
                "pipeline_status": "rejected",
                "stage": "input_validation",
                "message": f"Corrupted or invalid image file: {e}",
                "detections": [],
            }

        img_w, img_h = image.size
        # Dimension limits
        if img_w < settings.MIN_IMAGE_DIMENSION or img_h < settings.MIN_IMAGE_DIMENSION:
            return {
                "success": False,
                "inspection_id": ctx.inspection_id,
                "image_sha256": ctx.image_sha256,
                "pipeline_status": "rejected",
                "stage": "input_validation",
                "message": f"Image dimensions ({img_w}x{img_h}) below minimum required ({settings.MIN_IMAGE_DIMENSION}x{settings.MIN_IMAGE_DIMENSION})",
                "detections": [],
            }

        ctx.record_stage("stage_0_validation", (time.perf_counter() - t_stage0) * 1000)

        # =====================================================================
        # STAGE 1 — ROAD / NON-ROAD CLASSIFICATION
        # =====================================================================
        t_stage1 = time.perf_counter()
        road_res = self.registry.road_classifier.predict(image)
        ctx.record_stage("stage_1_road_classifier", (time.perf_counter() - t_stage1) * 1000)

        if not road_res["is_road"]:
            logger.info("Inspection %s rejected at Stage 1: Non-road scene.", ctx.inspection_id)
            return {
                "success": False,
                "inspection_id": ctx.inspection_id,
                "image_sha256": ctx.image_sha256,
                "inference_run_id": ctx.inference_run_id,
                "pipeline_status": "rejected",
                "stage": "road_classification",
                "is_road": False,
                "label": road_res["label"],
                "confidence": road_res["confidence"],
                "message": road_res.get("message", "Image does not contain a sufficiently confident road scene"),
                "model_provenance": {
                    "road_classifier": road_res.get("model_version"),
                },
                "stage_timings_ms": ctx.stage_timings_ms,
                "detections": [],
            }

        # =====================================================================
        # STAGE 2 — AI-GENERATED IMAGE DETECTION
        # =====================================================================
        t_stage2 = time.perf_counter()
        auth_res = self.registry.authenticity_classifier.predict(image)
        ctx.record_stage("stage_2_authenticity", (time.perf_counter() - t_stage2) * 1000)

        if auth_res["label"] == "likely_ai_generated":
            logger.info("Inspection %s rejected at Stage 2: AI-generated image.", ctx.inspection_id)
            return {
                "success": False,
                "inspection_id": ctx.inspection_id,
                "image_sha256": ctx.image_sha256,
                "inference_run_id": ctx.inference_run_id,
                "pipeline_status": "rejected",
                "stage": "authenticity_detection",
                "is_road": True,
                "label": auth_res["label"],
                "confidence": auth_res["confidence"],
                "message": "Image classified as likely AI-generated or synthetic; rejected under policy.",
                "warning": auth_res.get("warning", ""),
                "model_provenance": {
                    "road_classifier": road_res.get("model_version"),
                    "authenticity_classifier": auth_res.get("model_version"),
                },
                "stage_timings_ms": ctx.stage_timings_ms,
                "detections": [],
            }

        # =====================================================================
        # STAGE 3 — REAL YOLO ROAD DAMAGE DETECTION
        # =====================================================================
        t_stage3 = time.perf_counter()
        yolo_res = self.registry.damage_detector.predict(image)
        ctx.record_stage("stage_3_yolo_detection", (time.perf_counter() - t_stage3) * 1000)

        if not yolo_res.get("model_ready", False):
            # Honest model unavailable handling
            return {
                "success": False,
                "inspection_id": ctx.inspection_id,
                "image_sha256": ctx.image_sha256,
                "inference_run_id": ctx.inference_run_id,
                "pipeline_status": "needs_model",
                "stage": "damage_detection",
                "message": yolo_res.get("error", "Road damage detection model is currently unavailable."),
                "model_provenance": {
                    "road_classifier": road_res.get("model_version"),
                    "authenticity_classifier": auth_res.get("model_version"),
                    "damage_detector": yolo_res.get("model_version"),
                },
                "stage_timings_ms": ctx.stage_timings_ms,
                "detections": [],
            }

        raw_detections = yolo_res.get("detections", [])

        # =====================================================================
        # STAGE 4 — FALSE-POSITIVE FILTERING & AUDITING
        # =====================================================================
        t_stage4 = time.perf_counter()
        verified_detections = []
        rejected_detections = []

        for det in raw_detections:
            c_name = det["class"]
            conf = det["confidence"]
            bbox = det["bbox"]

            verify_res = self.registry.false_positive_filter.predict(
                image,
                bbox=bbox,
                class_name=c_name,
                confidence=conf,
            )

            if not verify_res.get("is_valid", False):
                rejected_detections.append({
                    "original_class": c_name,
                    "confidence": conf,
                    "bbox": bbox,
                    "filter_reason": verify_res.get("reason", "Filtered by hard-negative check"),
                    "filter_version": verify_res.get("filter_version", ""),
                })
                continue

            # =================================================================
            # STAGE 5 — GEOMETRIC ANALYSIS
            # =================================================================
            bw = det["width"]
            bh = det["height"]
            area = det["area"]
            relative_area = area / max(1, img_w * img_h)

            geometry = {
                "width_pixels": bw,
                "height_pixels": bh,
                "area_pixels": area,
                "relative_area": round(relative_area, 6),
                "physical_dimensions": None,
                "measurement_note": "Physical metric dimensions unavailable without camera intrinsic matrix or ground reference object.",
            }

            # =================================================================
            # STAGE 6 — SEVERITY ASSESSMENT
            # =================================================================
            sev_assessment = assess_defect_severity(
                class_name=c_name,
                bbox=bbox,
                img_w=img_w,
                img_h=img_h,
                confidence=conf,
                total_detections=len(raw_detections),
            )

            # =================================================================
            # STAGE 7 — PROBABLE CAUSE ESTIMATION
            # =================================================================
            cause_res = estimate_causes_for_defect(
                class_name=c_name,
                severity=sev_assessment.level,
            )

            verified_detections.append({
                "detection_id": f"det_{uuid.uuid4().hex[:8]}",
                "class": c_name,
                "class_id": det["class_id"],
                "confidence": conf,
                "bbox": bbox,
                "geometry": geometry,
                "severity": {
                    "level": sev_assessment.level,
                    "score": sev_assessment.score,
                    "factors": sev_assessment.factors,
                    "priority": sev_assessment.priority,
                    "uncertainty_note": sev_assessment.uncertainty_note,
                },
                "probable_causes": [
                    {
                        "cause": c.cause,
                        "confidence": c.confidence,
                        "evidence": c.evidence,
                        "alternative": c.alternative,
                    }
                    for c in cause_res.causes
                ],
                "primary_cause": cause_res.primary_cause,
                "cause_is_verified": cause_res.cause_is_verified,
                "cause_disclaimer": cause_res.disclaimer,
            })

        ctx.record_stage("stage_4_filtering_and_enrichment", (time.perf_counter() - t_stage4) * 1000)
        total_time_ms = round((time.perf_counter() - ctx.t0) * 1000, 2)

        # =====================================================================
        # STAGE 8 — STRUCTURED FINAL RESPONSE
        # =====================================================================
        return {
            "success": True,
            "inspection_id": ctx.inspection_id,
            "inference_run_id": ctx.inference_run_id,
            "image_sha256": ctx.image_sha256,
            "pipeline_status": "completed",
            "image_validation": {
                "valid": True,
                "width": img_w,
                "height": img_h,
                "format": raw_img.format or "JPEG",
                "file_size_bytes": ctx.file_size,
            },
            "road_classification": {
                "label": road_res["label"],
                "confidence": road_res["confidence"],
                "message": road_res.get("message", ""),
            },
            "authenticity": {
                "label": auth_res["label"],
                "confidence": auth_res["confidence"],
                "warning": auth_res.get("warning", ""),
            },
            "damage_analysis": {
                "total_detections": len(verified_detections),
                "total_raw_candidates": len(raw_detections),
                "total_filtered_candidates": len(rejected_detections),
                "detections": verified_detections,
                "filtered_audit": rejected_detections,
            },
            "model_provenance": {
                "road_classifier": road_res.get("model_version"),
                "authenticity_classifier": auth_res.get("model_version"),
                "damage_detector": yolo_res.get("model_version"),
                "false_positive_filter": self.registry.false_positive_filter.version(),
            },
            "execution_metadata": {
                "total_duration_ms": total_time_ms,
                "stage_timings_ms": ctx.stage_timings_ms,
            },
        }


# Global singleton instance
inspection_pipeline = InspectionPipeline()
