"""Model inventory route."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.auth import verify_api_key
from app.core.config import settings

router = APIRouter(
    prefix="/api/v1/models",
    tags=["models"],
    dependencies=[Depends(verify_api_key)],
)


@router.get("")
async def list_models():
    detection_exists = settings.DETECTION_MODEL_PATH.exists()
    return {
        "models": [
            {
                "name": "RoadGuard YOLOv8 Damage Detector",
                "type": "object_detection",
                "ready": detection_exists,
                "path_configured": str(settings.DETECTION_MODEL_PATH),
                "classes": {
                    "0": "pothole",
                    "1": "manhole_cover",
                    "2": "sewage_hole",
                    "3": "longitudinal_crack",
                    "4": "transverse_crack",
                    "5": "alligator_crack",
                },
                "thresholds": settings.CLASS_CONFIDENCE_THRESHOLDS,
                # No held-out evaluation has been run against the traffic
                # domain, so no accuracy numbers are reported.
                "metrics": None,
                "metrics_note": "Not evaluated on a held-out set. No accuracy claim is made.",
            },
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
