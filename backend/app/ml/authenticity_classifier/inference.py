"""Inference helper for authenticity classifier."""
from __future__ import annotations
from PIL import Image
from typing import Dict, Any

from app.ml.authenticity_classifier.model import AuthenticityClassifierModel

_model_instance = None

def get_authenticity_classifier() -> AuthenticityClassifierModel:
    global _model_instance
    if _model_instance is None:
        _model_instance = AuthenticityClassifierModel()
    return _model_instance

def classify_authenticity(image: Image.Image) -> Dict[str, Any]:
    return get_authenticity_classifier().predict(image)
