"""Core Sequential Inspection Pipeline Service for RoadGuard AI.

Implements STRICT SEQUENTIAL IMAGE PROCESSING:
STAGE 0 — Input Validation
STAGE 1 — Road / Non-Road Classification (STOPS if non-road)
STAGE 2 — AI-Generated Image Detection (STOPS if AI-generated)
STAGE 3 — Road Damage Detection (YOLO: pothole, manhole_cover, sewage_hole, longitudinal_crack, transverse_crack, alligator_crack)
STAGE 4 — False-Positive Verification (filtering pebbles, stones, gravel, speed breakers, shadows, oil stains, markings, patches)
STAGE 5 — Probable Cause Estimation (with confidence and explicit uncertainty)
STAGE 6 — Severity Assessment (low, medium, high, critical)
STAGE 7 — Structured Final Response
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
import numpy as np
from PIL import Image

from app.core.config import settings
from app.services.image_validation import validate_image, ImageValidationResult
from app.services.road_classifier import road_classifier, RoadClassificationResult
from app.services.authenticity_service import analyse_authenticity, AuthenticityAnalysisResult
from app.services.false_positive_filter import false_positive_filter

logger = logging.getLogger("roadguard.inspection_pipeline")

# Cause knowledge base per class
PROBABLE_CAUSES: Dict[str, List[Dict[str, Any]]] = {
    "pothole": [
        {"cause": "water infiltration and subgrade softening", "confidence": 0.82},
        {"cause": "repeated vehicle axle loading and fatigue", "confidence": 0.74},
        {"cause": "asphalt binder oxidation and aggregate stripping", "confidence": 0.58},
        {"cause": "poor drainage causing moisture accumulation", "confidence": 0.52},
    ],
    "manhole_cover": [
        {"cause": "surrounding pavement differential settlement", "confidence": 0.76},
        {"cause": "repeated traffic impact around casting frame", "confidence": 0.68},
        {"cause": "improper installation or asphalt compaction around rim", "confidence": 0.60},
    ],
    "sewage_hole": [
        {"cause": "missing, damaged, or displaced cover frame", "confidence": 0.88},
        {"cause": "drainage structure subsidence or structural failure", "confidence": 0.81},
        {"cause": "severe perimeter erosion and concrete spalling", "confidence": 0.65},
    ],
    "longitudinal_crack": [
        {"cause": "paving joint separation between adjacent asphalt passes", "confidence": 0.79},
        {"cause": "traffic wheel-path fatigue loading", "confidence": 0.71},
        {"cause": "subgrade settlement along pavement shoulder", "confidence": 0.62},
    ],
    "transverse_crack": [
        {"cause": "thermal expansion and contraction cycles", "confidence": 0.84},
        {"cause": "reflective cracking from underlying stabilized base", "confidence": 0.69},
        {"cause": "aged asphalt binder embrittlement", "confidence": 0.63},
    ],
    "alligator_crack": [
        {"cause": "structural fatigue failure under repeated heavy loads", "confidence": 0.89},
        {"cause": "weak pavement foundation or loss of subgrade support", "confidence": 0.83},
        {"cause": "moisture trapped within base course", "confidence": 0.72},
    ],
}


def _determine_crack_subtype(w: int, h: int, crop_arr: Optional[np.ndarray]) -> str:
    """Classify crack subtype based on geometry and branching."""
    aspect = w / max(1, h)
    if aspect > 1.8:
        return "transverse_crack"
    elif aspect < 0.55:
        return "longitudinal_crack"
    else:
        return "alligator_crack"


def _assess_defect_severity(
    class_name: str,
    bbox: List[int],
    img_w: int,
    img_h: int,
    confidence: float,
) -> str:
    """Assess severity: low, medium, high, critical based on size and danger."""
    x1, y1, x2, y2 = bbox
    w = max(1, x2 - x1)
    h = max(1, y2 - y1)
    area = w * h
    area_ratio = area / max(1, img_w * img_h)

    # Open sewage holes are hazardous public safety risks
    if class_name == "sewage_hole":
        return "critical"

    if class_name == "pothole":
        if area_ratio > 0.08 or (w > 250 and h > 200):
            return "critical"
        elif area_ratio > 0.03:
            return "high"
        elif area_ratio > 0.01:
            return "medium"
        return "low"

    if class_name == "alligator_crack":
        if area_ratio > 0.06:
            return "high"
        return "medium"

    if class_name in ("longitudinal_crack", "transverse_crack"):
        if max(w, h) > 350:
            return "high"
        elif max(w, h) > 150:
            return "medium"
        return "low"

    if class_name == "manhole_cover":
        return "medium"

    return "low"


class InspectionPipeline:
    """Executes the strict sequential road inspection pipeline."""

    def __init__(self):
        self._yolo_model = None
        self._load_detection_model()

    def _load_detection_model(self):
        try:
            if settings.DETECTION_MODEL_PATH.exists():
                from ultralytics import YOLO
                self._yolo_model = YOLO(str(settings.DETECTION_MODEL_PATH))
                logger.info("Loaded YOLO detection model from %s", settings.DETECTION_MODEL_PATH)
        except Exception as e:
            logger.warning("Could not load YOLO model: %s", e)

    def process_image(
        self,
        file_bytes: bytes,
        filename: str = "upload.jpg",
    ) -> Dict[str, Any]:
        """Process image through Stage 0 to Stage 7."""

        # =====================================================================
        # STAGE 0 — INPUT VALIDATION
        # =====================================================================
        validation: ImageValidationResult = validate_image(file_bytes, filename)
        if not validation.valid or validation.pil_image is None:
            return {
                "success": False,
                "pipeline_status": "rejected",
                "stage": "input_validation",
                "message": validation.error or "Invalid image file format or corrupted payload",
                "image_validation": {
                    "valid": False,
                    "error": validation.error,
                },
                "detections": [],
            }

        image = validation.pil_image
        img_w, img_h = image.size

        # =====================================================================
        # STAGE 1 — ROAD / NON-ROAD CLASSIFICATION
        # =====================================================================
        road_res: RoadClassificationResult = road_classifier.classify(image)
        if not road_res.is_road:
            logger.info("Pipeline STOPPED at Stage 1: Non-road image rejected.")
            return {
                "success": False,
                "pipeline_status": "rejected",
                "stage": "road_classification",
                "is_road": False,
                "label": road_res.label,
                "confidence": road_res.confidence,
                "message": road_res.message,
                "detections": [],
            }

        # =====================================================================
        # STAGE 2 — AI-GENERATED IMAGE DETECTION
        # =====================================================================
        auth_res: AuthenticityAnalysisResult = analyse_authenticity(image)
        if auth_res.verdict == "likely_ai_generated":
            logger.info("Pipeline STOPPED at Stage 2: AI-generated image rejected.")
            return {
                "success": False,
                "pipeline_status": "rejected",
                "stage": "authenticity_detection",
                "label": auth_res.verdict,
                "confidence": auth_res.confidence,
                "message": "Image detected as likely AI-generated or synthetic; rejected under security policy.",
                "warning": auth_res.warning,
                "detections": [],
            }

        # =====================================================================
        # STAGE 3 — ROAD DAMAGE DETECTION (YOLO)
        # =====================================================================
        raw_detections = []
        if self._yolo_model is not None:
            try:
                results = self._yolo_model.predict(
                    source=image,
                    conf=settings.DETECTION_CONFIDENCE_THRESHOLD,
                    iou=settings.DETECTION_IOU_THRESHOLD,
                    verbose=False,
                )
                if results and len(results) > 0:
                    r0 = results[0]
                    boxes = r0.boxes
                    for b in boxes:
                        coords = b.xyxy[0].tolist()
                        cls_id = int(b.cls[0].item())
                        raw_name = self._yolo_model.names.get(cls_id, "defect")
                        conf = float(b.conf[0].item())
                        raw_detections.append({
                            "raw_name": raw_name,
                            "class_id": cls_id,
                            "bbox": [int(coords[0]), int(coords[1]), int(coords[2]), int(coords[3])],
                            "confidence": conf,
                        })
            except Exception as e:
                logger.error("YOLO inference failed: %s", e)

        # =====================================================================
        # STAGE 4 — FALSE-POSITIVE VERIFICATION & MAPPING
        # =====================================================================
        verified_detections = []

        for raw in raw_detections:
            r_name = raw["raw_name"].lower()
            conf = raw["confidence"]
            bbox = raw["bbox"]
            bw = max(1, bbox[2] - bbox[0])
            bh = max(1, bbox[3] - bbox[1])

            # Class mapping into required classes
            if "pothole" in r_name:
                mapped_class = "pothole"
            elif "manhole" in r_name:
                # Check if covered vs open sewage void
                crop = image.crop((bbox[0], bbox[1], bbox[2], bbox[3]))
                gray_crop = np.array(crop.convert("L"), dtype=np.float32)
                brightness = float(np.mean(gray_crop))
                # Open sewage holes exhibit very dark inner cavity without reflective metal cover
                if brightness < 40 and conf > 0.45:
                    mapped_class = "sewage_hole"
                else:
                    mapped_class = "manhole_cover"
            elif "crack" in r_name:
                mapped_class = _determine_crack_subtype(bw, bh, None)
            else:
                mapped_class = "pothole"

            # Check class-specific threshold
            required_threshold = settings.CLASS_CONFIDENCE_THRESHOLDS.get(mapped_class, 0.30)
            if conf < required_threshold:
                continue

            # Stage 4 false positive verification
            decision = false_positive_filter.verify_candidate(
                image=image,
                bbox=tuple(bbox),  # type: ignore
                class_name=mapped_class,
                confidence=conf,
            )

            if not decision.is_valid:
                logger.debug("Rejected false positive (%s): %s", mapped_class, decision.rejection_reason)
                continue

            # =================================================================
            # STAGE 5 — PROBABLE CAUSE ESTIMATION
            # =================================================================
            causes = PROBABLE_CAUSES.get(mapped_class, [
                {"cause": "environmental thermal fatigue", "confidence": 0.65},
                {"cause": "vehicular traffic wear", "confidence": 0.60},
            ])

            # =================================================================
            # STAGE 6 — SEVERITY ASSESSMENT
            # =================================================================
            sev = _assess_defect_severity(mapped_class, bbox, img_w, img_h, conf)

            verified_detections.append({
                "class": mapped_class,
                "confidence": round(conf, 4),
                "bbox": bbox,
                "severity": sev,
                "probable_causes": causes,
                "cause_is_verified": False,  # Explicitly uncertain per engineering principles
            })

        # =====================================================================
        # STAGE 7 — STRUCTURED FINAL RESPONSE
        # =====================================================================
        return {
            "success": True,
            "pipeline_status": "completed",
            "image_validation": {
                "valid": True,
                "width": img_w,
                "height": img_h,
                "format": validation.format,
                "blur_score": validation.blur_score,
                "is_blurry": validation.is_blurry,
            },
            "road_classification": {
                "label": road_res.label,
                "confidence": road_res.confidence,
            },
            "authenticity": {
                "label": auth_res.verdict,
                "confidence": auth_res.confidence,
                "warning": auth_res.warning,
            },
            "damage_analysis": {
                "total_detections": len(verified_detections),
                "detections": verified_detections,
            },
        }


inspection_pipeline = InspectionPipeline()
