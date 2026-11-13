"""Inference helper for false positive filter."""
from __future__ import annotations
from PIL import Image
from typing import Dict, Any, List

from app.ml.false_positive_filter.model import FalsePositiveFilterModel

_filter_instance = None

def get_false_positive_filter() -> FalsePositiveFilterModel:
    global _filter_instance
    if _filter_instance is None:
        _filter_instance = FalsePositiveFilterModel()
    return _filter_instance

def verify_candidate(image: Image.Image, bbox: List[int], class_name: str, confidence: float) -> Dict[str, Any]:
    return get_false_positive_filter().predict(image, bbox=bbox, class_name=class_name, confidence=confidence)
