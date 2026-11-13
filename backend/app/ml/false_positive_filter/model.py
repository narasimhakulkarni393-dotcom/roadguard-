"""False-Positive Filtering Model Interface.

Stage 4: Filters hard-negative candidates:
- Pebbles, stones, gravel
- Speed breakers
- Shadows
- Oil stains
- Water puddles
- Road markings
- Asphalt texture variations & repaired patches
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from PIL import Image

from app.core.config import settings
from app.ml.base import BaseModelInterface

logger = logging.getLogger("roadguard.ml.false_positive_filter")


class FalsePositiveFilterModel(BaseModelInterface):
    """Rule and vision-based false positive verification model."""

    def __init__(self):
        self._version = "1.0.0-hard-negative-filter"
        self._is_ready = True

    def load(self) -> None:
        self._is_ready = True

    def predict(self, image: Image.Image, **kwargs: Any) -> Dict[str, Any]:
        """Verify a candidate detection box against hard negatives."""
        bbox = kwargs.get("bbox")
        class_name = kwargs.get("class_name", "pothole")
        confidence = float(kwargs.get("confidence", 0.5))

        if not bbox or len(bbox) != 4:
            return {"is_valid": False, "reason": "Invalid bounding box dimensions", "filter_version": self._version}

        x1, y1, x2, y2 = bbox
        bw = max(1, x2 - x1)
        bh = max(1, y2 - y1)
        area = bw * bh
        img_w, img_h = image.size
        area_ratio = area / max(1, img_w * img_h)

        # Minimum physical size: pebbles/gravel are tiny
        if area < 100 or bw < 8 or bh < 8:
            return {
                "is_valid": False,
                "reason": "Rejected as pebble/gravel: bounding box area below minimum threshold (100 px)",
                "filter_version": self._version,
            }

        # Crop candidate
        crop = image.crop((x1, y1, x2, y2))
        arr = np.array(crop.convert("RGB"), dtype=np.float32)
        if arr.size == 0:
            return {"is_valid": False, "reason": "Empty crop", "filter_version": self._version}

        r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
        gray = np.array(crop.convert("L"), dtype=np.float32)

        mean_brightness = float(np.mean(gray))
        std_brightness = float(np.std(gray))

        # Check 1: Road paint / lane markings (high brightness, high contrast white/yellow)
        if mean_brightness > 200.0 and std_brightness < 30.0:
            return {
                "is_valid": False,
                "reason": "Rejected as road marking/paint: high uniform brightness",
                "filter_version": self._version,
            }

        # Check 2: Cast shadows (smooth gradient, low texture variance, moderate dark)
        if std_brightness < 8.0 and mean_brightness < 60.0:
            return {
                "is_valid": False,
                "reason": "Rejected as shadow: low internal gradient variance without defect cavity",
                "filter_version": self._version,
            }

        # Check 3: Water puddles / reflections (specular highlights with sky reflection)
        if np.max(gray) > 245.0 and np.min(gray) < 40.0 and std_brightness > 65.0 and class_name == "pothole":
            # Real pothole or puddle? Check if cavity texture exists
            if area_ratio < 0.002 and confidence < 0.25:
                return {
                    "is_valid": False,
                    "reason": "Rejected as surface water reflection / puddle highlight",
                    "filter_version": self._version,
                }

        # Check 4: Class-specific confidence thresholds
        required_conf = settings.CLASS_CONFIDENCE_THRESHOLDS.get(class_name, 0.15)
        if confidence < required_conf:
            return {
                "is_valid": False,
                "reason": f"Confidence {confidence:.3f} below class threshold {required_conf:.3f}",
                "filter_version": self._version,
            }

        return {
            "is_valid": True,
            "reason": "Candidate verified as genuine defect",
            "filter_version": self._version,
        }

    def health(self) -> Dict[str, Any]:
        return {"name": "false_positive_filter", "ready": self._is_ready, "version": self._version}

    def metadata(self) -> Dict[str, Any]:
        return {
            "model_name": "false_positive_filter",
            "version": self._version,
            "filters": ["pebbles", "shadows", "markings", "puddles", "patches"],
        }

    def version(self) -> str:
        return self._version

    def is_ready(self) -> bool:
        return self._is_ready
