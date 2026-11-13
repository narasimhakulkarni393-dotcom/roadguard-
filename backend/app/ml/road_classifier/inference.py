"""Inference helper for road classifier."""
from __future__ import annotations
from PIL import Image
from typing import Dict, Any

from app.ml.road_classifier.model import RoadClassifierModel

_model_instance = None

def get_road_classifier() -> RoadClassifierModel:
    global _model_instance
    if _model_instance is None:
        _model_instance = RoadClassifierModel()
    return _model_instance

def classify_road(image: Image.Image) -> Dict[str, Any]:
    return get_road_classifier().predict(image)
