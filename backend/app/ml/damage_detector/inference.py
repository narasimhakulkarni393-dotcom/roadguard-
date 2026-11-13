"""Inference helper for damage detector."""
from __future__ import annotations
from PIL import Image
from typing import Dict, Any

from app.ml.damage_detector.model import DamageDetectorModel

_model_instance = None

def get_damage_detector() -> DamageDetectorModel:
    global _model_instance
    if _model_instance is None:
        _model_instance = DamageDetectorModel()
    return _model_instance

def detect_damage(image: Image.Image, **kwargs: Any) -> Dict[str, Any]:
    return get_damage_detector().predict(image, **kwargs)
