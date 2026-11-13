"""Inference helper for the configured damage detector."""
from __future__ import annotations
from typing import Any, Dict

from PIL import Image

from app.core.config import settings
from app.ml.base import BaseModelInterface

_model_instance: BaseModelInterface | None = None


def get_damage_detector() -> BaseModelInterface:
    global _model_instance
    if _model_instance is None:
        if settings.DETECTION_PROVIDER == "hf-inference":
            from app.ml.damage_detector.hf_inference import HuggingFaceDamageDetector

            _model_instance = HuggingFaceDamageDetector()
        elif settings.DETECTION_PROVIDER == "gemini":
            from app.ml.damage_detector.gemini_vision import GeminiDamageDetector

            _model_instance = GeminiDamageDetector()
        else:
            from app.ml.damage_detector.model import DamageDetectorModel

            _model_instance = DamageDetectorModel()
    return _model_instance


def detect_damage(image: Image.Image, **kwargs: Any) -> Dict[str, Any]:
    return get_damage_detector().predict(image, **kwargs)
