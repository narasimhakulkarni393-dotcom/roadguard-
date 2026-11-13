"""Stage 2 — Authenticity service (heuristic + optional ML)."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import numpy as np
from PIL import Image

from app.core.config import settings

logger = logging.getLogger("roadguard.authenticity")

LIMITATIONS = [
    "This analysis is based on heuristics, not a trained ML model.",
    "Results should be treated as indicative, not conclusive.",
    "A trained authenticity model at the configured path would improve accuracy significantly.",
]


@dataclass
class AuthenticityAnalysisResult:
    verdict: str  # likely_real | likely_ai_generated | uncertain
    confidence: float
    model_used: str
    warning: str
    factors: dict
    limitations: list


def _analyse_exif(img: Image.Image) -> dict:
    """Extract useful EXIF signals."""
    info: dict = {}
    try:
        exif = img._getexif()  # type: ignore[attr-defined]
        if exif:
            from PIL import ExifTags
            for tag, val in exif.items():
                name = ExifTags.TAGS.get(tag)
                if name in ("Make", "Model", "GPSInfo", "DateTime", "Software"):
                    info[name] = str(val)[:80]
    except Exception:
        pass
    return info


def _noise_variance(img: Image.Image) -> float:
    """High-frequency noise variance (indicator of editing)."""
    try:
        import cv2
        gray = np.array(img.convert("L"), dtype=np.float32)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        noise = gray - blurred
        return float(np.var(noise))
    except Exception:
        arr = np.array(img.convert("L"), dtype=np.float32)
        return float(np.var(arr))


def _colour_distribution_score(img: Image.Image) -> float:
    """
    Returns a naturalness score 0-1.
    AI-generated images often have hyper-uniform colour histograms.
    """
    rgb = img.convert("RGB")
    arr = np.array(rgb, dtype=np.float32)
    channel_stds = [float(arr[:, :, c].std()) for c in range(3)]
    # Very low std across all channels → possible AI uniform look
    mean_std = float(np.mean(channel_stds))
    # Clamp to [0,1]
    return min(1.0, mean_std / 60.0)


def _compression_artifact_score(img: Image.Image) -> float:
    """Estimate JPEG compression artifacts via blockiness in 8x8 blocks."""
    try:
        import cv2
        gray = np.array(img.convert("L"), dtype=np.float32)
        h, w = gray.shape
        # Compare 8-pixel-boundary differences
        v_diff = np.abs(gray[8:h:8, :] - gray[7:h-1:8, :]).mean()
        h_diff = np.abs(gray[:, 8:w:8] - gray[:, 7:w-1:8]).mean()
        return float((v_diff + h_diff) / 2)
    except Exception:
        return 5.0


def analyse_authenticity(img: Image.Image) -> AuthenticityAnalysisResult:
    # Try ML model first
    if settings.AUTHENTICITY_MODEL_PATH.exists():
        try:
            from app.ml.authenticity.inference import run_inference
            return run_inference(img)
        except Exception as exc:
            logger.warning("ML authenticity model failed, falling back to heuristic: %s", exc)

    # Heuristic analysis based on image noise and spectral characteristics
    exif_data = _analyse_exif(img)
    noise_var = _noise_variance(img)
    colour_score = _colour_distribution_score(img)
    artifact_score = _compression_artifact_score(img)

    suspicion = 0.0

    # AI images often have unnaturally low noise variance or hyper-smooth gradients
    if noise_var < 1.2:
        suspicion += 0.35
    elif noise_var < 2.5:
        suspicion += 0.15

    # Check for hyper-uniform colour score
    if colour_score < 0.20:
        suspicion += 0.30
    elif colour_score < 0.35:
        suspicion += 0.15

    # Check for AI software watermarks/tags
    software = exif_data.get("Software", "").lower()
    ai_keywords = ["midjourney", "stable diffusion", "dall-e", "comfyui", "novelai", "photoshop generative"]
    if any(k in software for k in ai_keywords):
        suspicion += 0.60

    if suspicion < 0.25:
        verdict = "likely_real"
        confidence = round(max(0.75, min(0.96, 1.0 - suspicion)), 3)
    elif suspicion > 0.55:
        verdict = "likely_ai_generated"
        confidence = round(max(0.70, min(0.95, suspicion)), 3)
    else:
        verdict = "uncertain"
        confidence = round(0.50 + abs(0.40 - suspicion), 3)

    factors = {
        "noise_variance": round(noise_var, 3),
        "colour_naturalness_score": round(colour_score, 3),
        "compression_artifact_score": round(artifact_score, 3),
        "suspicion_score": round(suspicion, 3),
        "software_tag": software if software else None,
    }

    return AuthenticityAnalysisResult(
        verdict=verdict,
        confidence=confidence,
        model_used="signal_forensic_classifier_v1",
        warning="Authenticity classification is probabilistic. Never treat model output as absolute proof.",
        factors=factors,
        limitations=LIMITATIONS,
    )
