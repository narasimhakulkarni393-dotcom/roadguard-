"""Shared mapping between provider labels and the PitScout damage taxonomy."""
from __future__ import annotations

from typing import Optional

from app.ml.damage_detector.model import _refine_crack_subclass

CLASS_IDS = {
    "pothole": 0,
    "manhole_cover": 1,
    "sewage_hole": 2,
    "longitudinal_crack": 3,
    "transverse_crack": 4,
    "alligator_crack": 5,
}


def canonical_class(raw_label: str, width: int, height: int) -> Optional[str]:
    """Map a provider label into the taxonomy, or None if it is not road damage.

    Unknown labels are never coerced into a defect class.
    """
    label = (raw_label or "").strip().lower().replace("-", "_").replace(" ", "_")
    if label in CLASS_IDS:
        return label
    if "pothole" in label:
        return "pothole"
    if "manhole" in label:
        return "manhole_cover"
    if "sewage" in label:
        return "sewage_hole"
    if "crack" in label:
        return _refine_crack_subclass(width, height)
    return None
