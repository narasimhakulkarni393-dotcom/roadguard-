"""Authenticity Classifier Model Interface.

Stage 2: Determines whether the image is authentic photograph or AI-generated synthetic content.
Classes: likely_real, likely_ai_generated, uncertain.
"""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from typing import Any, Dict, Optional
import numpy as np
from PIL import Image

from app.core.config import settings
from app.ml.base import BaseModelInterface

logger = logging.getLogger("roadguard.ml.authenticity_classifier")


class AuthenticityClassifierModel(BaseModelInterface):
    """Forensic and feature-based image authenticity classifier."""

    def __init__(self, model_path: Optional[Path] = None):
        self.model_path = model_path or settings.AUTHENTICITY_MODEL_PATH
        self._is_ready = False
        self._model = None
        self._version = "1.0.0-forensic-frequency"
        self._device = "cpu"
        self._checksum = ""
        self.load()

    def load(self) -> None:
        try:
            if self.model_path and self.model_path.exists():
                import torch
                self._device = "cuda" if torch.cuda.is_available() else "cpu"
                self._model = torch.load(str(self.model_path), map_location=self._device)
                self._checksum = hashlib.sha256(self.model_path.read_bytes()).hexdigest()[:12]
                self._version = f"1.0.0-weights-{self._checksum}"
                self._is_ready = True
                logger.info("Loaded authenticity classifier weights from %s", self.model_path)
            else:
                self._is_ready = True
                self._version = "1.0.0-fft-laplacian"
                logger.info("Initialized forensic authenticity classifier (weights path not present)")
        except Exception as e:
            logger.error("Failed to load authenticity classifier: %s", e)
            self._is_ready = False

    def predict(self, image: Image.Image, **kwargs: Any) -> Dict[str, Any]:
        """Classify image authenticity probabilistically."""
        if not self._is_ready:
            return {
                "label": "uncertain",
                "verdict": "uncertain",
                "confidence": 0.50,
                "model_name": "authenticity_classifier",
                "model_version": self._version,
                "warning": "Authenticity model unavailable",
            }

        # Independent copy
        img_gray = image.convert("L")
        arr = np.array(img_gray, dtype=np.float32)

        # 1. Fourier frequency domain analysis: synthetic generators often exhibit characteristic high-frequency grid artifacts
        h, w = arr.shape
        fft = np.fft.fft2(arr)
        fft_shift = np.fft.fftshift(fft)
        magnitude_spectrum = np.log(np.abs(fft_shift) + 1.0)
        mean_spectral_energy = float(np.mean(magnitude_spectrum))

        # 2. Laplacian high-pass noise variance: real sensor CMOS noise vs AI diffusion smoothed textures
        gy, gx = np.gradient(arr)
        laplacian = np.gradient(gy)[0] + np.gradient(gx)[1]
        laplacian_var = float(np.var(laplacian))

        # Calculate likelihood of authentic camera sensor noise
        score = 0.50
        if 80.0 < laplacian_var < 3500.0:
            score += 0.35  # Natural sensor grain and asphalt texture
        elif laplacian_var <= 40.0:
            score -= 0.35  # Oversmoothed diffusion painting
        elif laplacian_var > 6000.0:
            score -= 0.20  # Synthetic high-frequency checkerboard pattern

        if 4.5 < mean_spectral_energy < 12.0:
            score += 0.15

        confidence = float(np.clip(score, 0.10, 0.98))

        if confidence >= settings.AUTHENTICITY_UNCERTAIN_HIGH:
            verdict = "likely_real"
        elif confidence <= settings.AUTHENTICITY_UNCERTAIN_LOW:
            verdict = "likely_ai_generated"
        else:
            verdict = "uncertain"

        return {
            "label": verdict,
            "verdict": verdict,
            "confidence": round(confidence, 4),
            "model_name": "authenticity_classifier",
            "model_version": self._version,
            "warning": "Authenticity classification is probabilistic. Never treat model output as absolute proof.",
            "metrics": {
                "laplacian_variance": round(laplacian_var, 2),
                "spectral_energy": round(mean_spectral_energy, 2),
            },
        }

    def health(self) -> Dict[str, Any]:
        return {
            "name": "authenticity_classifier",
            "ready": self._is_ready,
            "device": self._device,
            "version": self._version,
        }

    def metadata(self) -> Dict[str, Any]:
        return {
            "model_name": "authenticity_classifier",
            "architecture": "FFT / Laplacian Forensic Analyzer",
            "classes": ["likely_real", "likely_ai_generated", "uncertain"],
            "version": self._version,
            "checksum": self._checksum,
            "has_custom_weights": bool(self._model is not None),
        }

    def version(self) -> str:
        return self._version

    def is_ready(self) -> bool:
        return self._is_ready
