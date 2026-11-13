"""Authenticity ML inference wrapper."""
from __future__ import annotations

import logging
from PIL import Image
from app.services.authenticity_service import AuthenticityAnalysisResult

logger = logging.getLogger("roadguard.ml.authenticity")


def run_inference(img: Image.Image) -> AuthenticityAnalysisResult:
    """
    Run ML-based authenticity inference.
    Falls back gracefully — called only when model file exists.
    """
    raise NotImplementedError("ML authenticity model not yet trained. Using heuristic fallback.")
