"""Engineered visual descriptor for duplicate-report matching.

This is not a learned embedding. It is a deterministic, explainable signature
(Lab colour histograms + gradient-orientation histogram + aspect ratio) that is
good enough to gate geographic candidates and is documented as a heuristic.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Optional

import numpy as np
from PIL import Image

LAB_BINS = 16
GRADIENT_BINS = 36
WORKING_SIZE = 128


@dataclass
class VisualDescriptor:
    vector: list[float]
    aspect_ratio: float
    mean_brightness: float
    color_means: list[float]

    def to_dict(self) -> dict[str, Any]:
        return {
            "vector": self.vector,
            "aspect_ratio": self.aspect_ratio,
            "mean_brightness": self.mean_brightness,
            "color_means": self.color_means,
            "descriptor_version": "lab-grad-1.0",
        }


def _normalized_hist(values: np.ndarray, bins: int, value_range: tuple[float, float]) -> np.ndarray:
    hist, _ = np.histogram(values, bins=bins, range=value_range)
    hist = hist.astype(np.float32)
    total = float(hist.sum())
    if total <= 0:
        return np.full(bins, 1.0 / bins, dtype=np.float32)
    return hist / total


def _l2_normalize(vec: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vec))
    if norm <= 0:
        return vec
    return vec / norm


def build_descriptor(image: Image.Image, crop_box: Optional[tuple[float, float, float, float]] = None) -> VisualDescriptor:
    """Build a descriptor for the whole image or a crop of interest."""
    rgb = image.convert("RGB")
    if crop_box is not None:
        x1, y1, x2, y2 = crop_box
        left, top = max(0, int(x1)), max(0, int(y1))
        right, bottom = min(rgb.size[0], int(math.ceil(x2))), min(rgb.size[1], int(math.ceil(y2)))
        if right - left >= 4 and bottom - top >= 4:
            rgb = rgb.crop((left, top, right, bottom))

    aspect_ratio = round(rgb.size[0] / max(1, rgb.size[1]), 4)
    working = rgb.resize((WORKING_SIZE, WORKING_SIZE), Image.BILINEAR)

    lab = np.array(working.convert("LAB"), dtype=np.float32)
    hist_parts = [
        _normalized_hist(lab[:, :, 0].ravel(), LAB_BINS, (0.0, 255.0)),
        _normalized_hist(lab[:, :, 1].ravel(), LAB_BINS, (0.0, 255.0)),
        _normalized_hist(lab[:, :, 2].ravel(), LAB_BINS, (0.0, 255.0)),
    ]

    gray = np.array(working.convert("L"), dtype=np.float32)
    grad_y, grad_x = np.gradient(gray)
    magnitude = np.sqrt(grad_x ** 2 + grad_y ** 2)
    orientation = (np.arctan2(grad_y, grad_x) + math.pi) / (2 * math.pi)
    hist, _ = np.histogram(orientation.ravel(), bins=GRADIENT_BINS, range=(0.0, 1.0), weights=magnitude.ravel())
    total = float(hist.sum())
    weighted = hist.astype(np.float32) / total if total > 0 else np.full(GRADIENT_BINS, 1.0 / GRADIENT_BINS, dtype=np.float32)

    vector = _l2_normalize(np.concatenate(hist_parts + [weighted]))
    rgb_arr = np.array(rgb.resize((64, 64), Image.BILINEAR), dtype=np.float32)

    return VisualDescriptor(
        vector=[round(float(v), 6) for v in vector],
        aspect_ratio=aspect_ratio,
        mean_brightness=round(float(gray.mean()), 2),
        color_means=[round(float(c), 2) for c in rgb_arr.reshape(-1, 3).mean(axis=0)],
    )


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    if denom <= 0:
        return 0.0
    return float(np.clip(np.dot(va, vb) / denom, 0.0, 1.0))


def shape_similarity(aspect_a: float, aspect_b: float) -> float:
    if aspect_a <= 0 or aspect_b <= 0:
        return 0.0
    log_delta = abs(math.log(aspect_a / aspect_b))
    return float(max(0.0, 1.0 - log_delta / math.log(4.0)))
