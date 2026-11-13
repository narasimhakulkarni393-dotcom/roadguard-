"""YOLO training stub — not yet implemented (requires labelled dataset)."""
from __future__ import annotations

import logging

logger = logging.getLogger("roadguard.ml.detection.training")


def start_training(config: dict) -> dict:
    """
    Placeholder for detection model training.
    Will use ultralytics YOLO training API when dataset is available.
    """
    raise NotImplementedError(
        "Detection model training requires a labelled dataset in YOLO format. "
        "Configure dataset_path and hyperparameters in config."
    )
