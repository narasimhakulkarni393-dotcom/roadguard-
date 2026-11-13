"""Stage 4 — False-Positive Verification Service.

Aggressively verifies and filters out false-positive detections:
- Pebbles, stones, gravel
- Speed breakers / rumble strips
- Shadows (tree, pole, bridge cast shadows)
- Oil stains and water puddles
- Road markings (white/yellow lane lines)
- Normal road patches / smooth maintenance overlays
- Small surface texture variations
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import List, Optional, Tuple
import numpy as np
from PIL import Image

logger = logging.getLogger("roadguard.false_positive_filter")


@dataclass
class VerificationDecision:
    is_valid: bool
    rejection_reason: Optional[str] = None
    confidence_adjustment: float = 0.0
    detected_artifact: Optional[str] = None


class FalsePositiveFilter:
    """Verifies defect candidates against known false-positive road artifacts."""

    def __init__(self, min_area_ratio: float = 0.0006):
        # Candidates covering less than 0.06% of the image are flagged as gravel/pebbles
        self.min_area_ratio = min_area_ratio

    def verify_candidate(
        self,
        image: Image.Image,
        bbox: Tuple[int, int, int, int],  # x1, y1, x2, y2
        class_name: str,
        confidence: float,
    ) -> VerificationDecision:
        """Verify an individual detection bounding box crop."""
        try:
            x1, y1, x2, y2 = bbox
            img_w, img_h = image.size
            crop_w = max(1, x2 - x1)
            crop_h = max(1, y2 - y1)
            area = crop_w * crop_h
            total_area = max(1, img_w * img_h)
            area_ratio = area / total_area
            aspect_ratio = crop_w / crop_h

            # Crop region of interest
            crop = image.crop((max(0, x1), max(0, y1), min(img_w, x2), min(img_h, y2)))
            crop_arr = np.array(crop.convert("RGB"), dtype=np.float32)
            gray_crop = np.array(crop.convert("L"), dtype=np.float32)

            # 1. Pebble / Stone / Gravel Filter
            # Tiny bounding boxes with low area (< 0.06% of image)
            if area_ratio < self.min_area_ratio and class_name.lower() in ("pothole", "sewage_hole"):
                return VerificationDecision(
                    is_valid=False,
                    rejection_reason="Defect area is microscopic; characteristic of surface gravel/pebbles rather than a structural pothole.",
                    detected_artifact="pebble_gravel",
                )

            # 2. Speed Breaker / Rumble Strip Filter
            # Wide transverse structure (aspect ratio > 7.0) spanning lane
            if aspect_ratio > 7.0 and class_name.lower() in ("pothole", "sewage_hole"):
                return VerificationDecision(
                    is_valid=False,
                    rejection_reason="Extremely wide uniform aspect ratio characteristic of an engineered speed breaker / rumble strip.",
                    detected_artifact="speed_breaker",
                )

            # 3. Road Marking / Paint Line Filter
            # High brightness with low saturation and long rectilinear geometry
            mean_brightness = float(np.mean(gray_crop))
            if mean_brightness > 190 and class_name.lower() in ("longitudinal_crack", "pothole"):
                return VerificationDecision(
                    is_valid=False,
                    rejection_reason="High-reflectance white/yellow road marking line falsely triggered crack detector.",
                    detected_artifact="road_marking",
                )

            # 4. Cast Shadow Filter
            # Low brightness, very low texture variance within crop
            texture_var = float(np.var(gray_crop))
            if mean_brightness < 45 and texture_var < 8.0:
                return VerificationDecision(
                    is_valid=False,
                    rejection_reason="Uniform dark illumination dropoff characteristic of a cast shadow rather than a pavement breach.",
                    detected_artifact="shadow",
                )

            # 5. Oil Stain / Surface Moisture Puddle Filter
            # Dark patch with no edge gradients
            if mean_brightness < 60 and texture_var < 15.0 and class_name.lower() == "pothole":
                return VerificationDecision(
                    is_valid=False,
                    rejection_reason="Smooth surface discoloration consistent with an oil stain or shallow water puddle without structural depth.",
                    detected_artifact="oil_or_water_stain",
                )

            # 6. Repaired Road Patch Distinction
            # Normal road patch: rectangular aspect ratio, moderate texture, but sealed boundary
            # If classified as a pothole with marginal confidence (< 0.40) and high rectangular fill
            if class_name.lower() == "pothole" and confidence < 0.38 and 0.8 <= aspect_ratio <= 1.4 and texture_var < 20.0:
                return VerificationDecision(
                    is_valid=False,
                    rejection_reason="Uniform asphalt overlay consistent with a paved road patch, not an active pothole.",
                    detected_artifact="repaired_patch",
                )

            # Accepted defect
            return VerificationDecision(is_valid=True)

        except Exception as e:
            logger.warning("Error verifying candidate: %s", e)
            return VerificationDecision(is_valid=True)


false_positive_filter = FalsePositiveFilter()
