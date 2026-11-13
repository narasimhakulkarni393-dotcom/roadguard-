"""Stage 1 — Road / Non-Road Classification Service.

Determines whether the input image contains an authentic road surface or scene
before running expensive object detection pipelines.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple
import numpy as np
from PIL import Image

from app.core.config import settings

logger = logging.getLogger("roadguard.road_classifier")


@dataclass
class RoadClassificationResult:
    is_road: bool
    label: str  # "road" | "non_road" | "uncertain"
    confidence: float
    message: str
    features: dict


class RoadClassifier:
    """Road surface vs non-road binary scene classifier."""

    def __init__(self, model_path: Optional[Path] = None):
        self.model_path = model_path or settings.ROAD_CLASSIFIER_PATH
        self.threshold = settings.ROAD_CONFIDENCE_THRESHOLD
        self._model = None
        self._load_model_if_available()

    def _load_model_if_available(self):
        if self.model_path and self.model_path.exists():
            try:
                import torch
                # Load torchscript or state dict if available
                self._model = torch.load(str(self.model_path), map_location="cpu")
                logger.info("Loaded road classification checkpoint from %s", self.model_path)
            except Exception as e:
                logger.warning("Could not load road classification model: %s", e)

    def classify(self, image: Image.Image) -> RoadClassificationResult:
        """Classify whether the given PIL image represents a road scene."""
        try:
            # 1. Feature extraction
            img_rgb = image.convert("RGB")
            arr = np.array(img_rgb, dtype=np.float32)

            # Analyze color distribution (asphalt / concrete surfaces are predominantly neutral gray/dark tones)
            r = arr[:, :, 0]
            g = arr[:, :, 1]
            b = arr[:, :, 2]

            # Saturation check: roads have low color saturation compared to lush landscapes, cartoon graphics, or faces
            max_c = np.maximum(np.maximum(r, g), b)
            min_c = np.minimum(np.minimum(r, g), b)
            delta = max_c - min_c
            saturation = np.where(max_c > 0, delta / (max_c + 1e-5), 0)
            mean_saturation = float(np.mean(saturation))

            # Texture & gradient analysis: roads have distinctive granular texture and horizontal/diagonal perspective gradients
            gray = np.array(image.convert("L"), dtype=np.float32)
            grad_y, grad_x = np.gradient(gray)
            gradient_magnitude = np.sqrt(grad_x ** 2 + grad_y ** 2)
            texture_energy = float(np.std(gradient_magnitude))

            # Asphalt / road color distance from neutral gray
            color_variance = float(np.mean(np.var(arr, axis=2)))

            # 2. Probability computation
            # Natural asphalt typically has low saturation (< 0.35) and moderate-to-high texture energy (5 to 45)
            # Indoor / solid graphic / pure white/black non-road images exhibit extreme values
            road_score = 0.50

            # Low saturation increases road confidence
            if mean_saturation < 0.20:
                road_score += 0.30
            elif mean_saturation < 0.35:
                road_score += 0.15
            elif mean_saturation > 0.65:
                # Highly saturated scenes (e.g. green grass, bright cartoons, indoor rooms)
                road_score -= 0.35

            # Texture energy in asphalt range
            if 8.0 <= texture_energy <= 40.0:
                road_score += 0.15
            elif texture_energy < 3.0:
                # Almost zero texture (e.g. blank screenshot, plain wall)
                road_score -= 0.30

            # Low color variance between RGB channels (grayscale/pavement tone)
            if color_variance < 150.0:
                road_score += 0.10
            elif color_variance > 500.0:
                road_score -= 0.15

            # Clamp confidence to [0.05, 0.99]
            confidence = max(0.05, min(0.99, road_score))

            if confidence >= self.threshold:
                label = "road"
                is_road = True
                message = "Image verified as a road surface scene."
            elif confidence <= (self.threshold - 0.15):
                label = "non_road"
                is_road = False
                message = "Image does not contain a sufficiently confident road scene."
            else:
                label = "uncertain"
                # Conservative rejection for uncertain images as required
                is_road = False
                message = "Road presence is uncertain; rejected under strict road verification policy."

            return RoadClassificationResult(
                is_road=is_road,
                label=label,
                confidence=round(confidence, 4),
                message=message,
                features={
                    "mean_saturation": round(mean_saturation, 4),
                    "texture_energy": round(texture_energy, 4),
                    "color_variance": round(color_variance, 4),
                },
            )

        except Exception as exc:
            logger.error("Error during road classification: %s", exc)
            # Default to rejection on failure
            return RoadClassificationResult(
                is_road=False,
                label="non_road",
                confidence=0.0,
                message=f"Classification failed: {exc}",
                features={},
            )


road_classifier = RoadClassifier()
