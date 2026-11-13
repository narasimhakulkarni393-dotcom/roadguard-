"""Models info route."""
from fastapi import APIRouter
from app.core.config import settings

router = APIRouter(prefix="/api/v1/models", tags=["models"])


@router.get("")
async def list_models():
    detection_exists = settings.DETECTION_MODEL_PATH.exists()
    authenticity_exists = settings.AUTHENTICITY_MODEL_PATH.exists()
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
                "metrics": {
                    "mAP50": 0.71,
                    "precision": 0.74,
                    "recall": 0.68,
                },
            },
            {
                "name": "Road Scene Binary Classifier",
                "type": "scene_classification",
                "ready": True,
                "threshold": settings.ROAD_CONFIDENCE_THRESHOLD,
                "classes": ["road", "non_road", "uncertain"],
            },
            {
                "name": "Image Authenticity Forensic Classifier",
                "type": "authenticity_detection",
                "ready": True,
                "classes": ["likely_real", "likely_ai_generated", "uncertain"],
                "policy": "Strict rejection on likely_ai_generated",
            },
        ]
    }
