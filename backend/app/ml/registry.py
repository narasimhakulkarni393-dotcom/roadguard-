"""Central ML Model Registry for RoadGuard AI.

Manages lifecycles, health checks, readiness, and metadata across all AI components:
- Road Classifier (Stage 1)
- Authenticity Classifier (Stage 2)
- Damage Detector (Stage 3)
- False Positive Filter (Stage 4)
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from app.core.config import settings
from app.ml.base import BaseModelInterface
from app.ml.road_classifier.model import RoadClassifierModel
from app.ml.authenticity_classifier.model import AuthenticityClassifierModel
from app.ml.damage_detector.model import DamageDetectorModel
from app.ml.false_positive_filter.model import FalsePositiveFilterModel

logger = logging.getLogger("roadguard.ml.registry")


class ModelRegistry:
    """Singleton registry holding loaded model references per worker."""

    def __init__(self):
        self._road_classifier: RoadClassifierModel | None = None
        self._authenticity_classifier: AuthenticityClassifierModel | None = None
        self._damage_detector: BaseModelInterface | None = None
        self._false_positive_filter: FalsePositiveFilterModel | None = None

    @property
    def road_classifier(self) -> RoadClassifierModel:
        if self._road_classifier is None:
            self._road_classifier = RoadClassifierModel()
        return self._road_classifier

    @property
    def authenticity_classifier(self) -> AuthenticityClassifierModel:
        if self._authenticity_classifier is None:
            self._authenticity_classifier = AuthenticityClassifierModel()
        return self._authenticity_classifier

    @property
    def damage_detector(self) -> BaseModelInterface:
        if self._damage_detector is None:
            if settings.DETECTION_PROVIDER == "hf-inference":
                from app.ml.damage_detector.hf_inference import HuggingFaceDamageDetector

                self._damage_detector = HuggingFaceDamageDetector()
            elif settings.DETECTION_PROVIDER == "gemini":
                from app.ml.damage_detector.gemini_vision import GeminiDamageDetector

                self._damage_detector = GeminiDamageDetector()
            else:
                self._damage_detector = DamageDetectorModel()
        return self._damage_detector

    @property
    def false_positive_filter(self) -> FalsePositiveFilterModel:
        if self._false_positive_filter is None:
            self._false_positive_filter = FalsePositiveFilterModel()
        return self._false_positive_filter

    def health(self) -> Dict[str, Any]:
        """Aggregate health check for all ML components."""
        return {
            "road_classifier": self.road_classifier.health(),
            "authenticity_classifier": self.authenticity_classifier.health(),
            "damage_detector": self.damage_detector.health(),
            "false_positive_filter": self.false_positive_filter.health(),
        }

    def metadata(self) -> Dict[str, Any]:
        """Aggregate metadata for all registered models."""
        return {
            "road_classifier": self.road_classifier.metadata(),
            "authenticity_classifier": self.authenticity_classifier.metadata(),
            "damage_detector": self.damage_detector.metadata(),
            "false_positive_filter": self.false_positive_filter.metadata(),
        }

    def is_all_ready(self) -> bool:
        """True if all models are loaded and ready."""
        return (
            self.road_classifier.is_ready()
            and self.authenticity_classifier.is_ready()
            and self.damage_detector.is_ready()
            and self.false_positive_filter.is_ready()
        )


# Global singleton instance
registry = ModelRegistry()
