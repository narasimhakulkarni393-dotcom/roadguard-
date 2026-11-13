"""Model inventory route."""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends

from app.core.auth import verify_api_key
from app.core.config import settings

router = APIRouter(
    prefix="/api/v1/models",
    tags=["models"],
    dependencies=[Depends(verify_api_key)],
)

METRICS_PATH = Path(__file__).resolve().parents[4] / "models" / "detection" / "metrics.json"

_TAXONOMY = {
    "0": "pothole",
    "1": "manhole_cover",
    "2": "sewage_hole",
    "3": "longitudinal_crack",
    "4": "transverse_crack",
    "5": "alligator_crack",
}


def _local_metrics() -> tuple[dict | None, str]:
    """Return (metrics, note) for the deployed local checkpoint.

    Metrics are read from models/detection/metrics.json, which is written by
    training/evaluate_damage_detector.py on a held-out split. Without that file
    no numbers are reported.
    """
    if not METRICS_PATH.exists():
        return None, "No held-out evaluation file is present for the deployed checkpoint."
    try:
        payload = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None, "The evaluation file for the deployed checkpoint could not be read."
    overall = payload.get("overall") or {}
    return (
        {
            "mAP50": overall.get("mAP50"),
            "mAP50_95": overall.get("mAP50_95"),
            "precision": overall.get("precision"),
            "recall": overall.get("recall"),
            "per_class": payload.get("per_class"),
            "split": payload.get("split"),
            "split_images": payload.get("split_images"),
            "evaluated_at": payload.get("evaluated_at"),
            "imgsz": payload.get("imgsz"),
            "checkpoint_sha256_prefix": payload.get("model_sha256_prefix"),
        },
        "Held-out split evaluation. Confidence values remain uncalibrated.",
    )


@router.get("")
async def list_models():
    detection_exists = settings.DETECTION_READY
    if settings.DETECTION_PROVIDER == "hf-inference":
        detector_entry = {
            "name": "Hugging Face Inference Damage Detector",
            "type": "object_detection",
            "provider": "hf-inference",
            "model_id": settings.HF_DETECTION_MODEL_ID,
            "ready": detection_exists,
            "credentials_configured": bool(settings.HF_TOKEN),
            "classes": _TAXONOMY,
            "thresholds": settings.CLASS_CONFIDENCE_THRESHOLDS,
            "metrics": None,
            "metrics_note": "Not evaluated on a held-out set. No accuracy claim is made.",
        }
    elif settings.DETECTION_PROVIDER == "gemini":
        detector_entry = {
            "name": "Gemini Vision Damage Detector",
            "type": "object_detection",
            "provider": "gemini",
            "model_id": settings.GEMINI_MODEL_ID,
            "ready": detection_exists,
            "credentials_configured": bool(settings.GEMINI_API_KEY),
            "classes": _TAXONOMY,
            "thresholds": settings.CLASS_CONFIDENCE_THRESHOLDS,
            "metrics": None,
            "metrics_note": "LLM vision output; not a calibrated detector and not evaluated. No accuracy claim is made.",
        }
    else:
        local_metrics, metrics_note = _local_metrics()
        detector_entry = {
            "name": "RoadGuard YOLOv8 Damage Detector",
            "type": "object_detection",
            "provider": "yolo",
            "ready": detection_exists,
            "path_configured": str(settings.DETECTION_MODEL_PATH),
            "classes": _TAXONOMY,
            "thresholds": settings.CLASS_CONFIDENCE_THRESHOLDS,
            "metrics": local_metrics,
            "metrics_note": metrics_note,
        }

    return {
        "models": [
            detector_entry,
            {
                "name": "Road Scene Binary Classifier",
                "type": "scene_classification",
                "implementation": "heuristic (spectral/statistical)",
                "ready": True,
                "threshold": settings.ROAD_CONFIDENCE_THRESHOLD,
                "classes": ["road", "non_road", "uncertain"],
            },
            {
                "name": "Image Authenticity Forensic Classifier",
                "type": "authenticity_detection",
                "implementation": "heuristic (FFT + Laplacian)",
                "ready": True,
                "classes": ["likely_real", "likely_ai_generated", "uncertain"],
                "policy": "Strict rejection on likely_ai_generated",
            },
        ]
    }
