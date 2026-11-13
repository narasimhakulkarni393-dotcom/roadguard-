"""Stage 3 — Detection service (YOLO wrapper)."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

import numpy as np
from PIL import Image

from app.core.config import settings

logger = logging.getLogger("roadguard.detection")

CLASS_MAP = {
    0: ("D00", "Longitudinal Crack"),
    1: ("D10", "Transverse Crack"),
    2: ("D20", "Alligator Crack"),
    3: ("D40", "Pothole"),
}


@dataclass
class RawDetection:
    class_id: int
    class_code: str
    class_name: str
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float


@dataclass
class DetectionServiceResult:
    model_ready: bool
    detections: List[RawDetection] = field(default_factory=list)
    model_message: str = ""
    image_width: int = 0
    image_height: int = 0


_model_cache = None
_model_load_attempted = False


def _load_model():
    global _model_cache, _model_load_attempted
    if _model_load_attempted:
        return _model_cache
    _model_load_attempted = True

    try:
        from ultralytics import YOLO  # type: ignore
    except ImportError:
        logger.warning("ultralytics package not installed — detection unavailable.")
        return None

    model_path = settings.DETECTION_MODEL_PATH
    if not model_path.exists():
        logger.warning("Detection model not found at %s", model_path)
        return None

    try:
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = YOLO(str(model_path))
        model.to(device)
        logger.info("YOLO detection model loaded from %s on %s", model_path, device)
        _model_cache = model
        return model
    except Exception as exc:
        logger.error("Failed to load YOLO model: %s", exc)
        return None


def run_detection(pil_image: Image.Image) -> DetectionServiceResult:
    model = _load_model()
    img_w, img_h = pil_image.size

    if model is None:
        return DetectionServiceResult(
            model_ready=False,
            model_message=(
                "Detection model is not available. "
                "Place a trained YOLO model at the configured DETECTION_MODEL_PATH to enable detections."
            ),
            image_width=img_w,
            image_height=img_h,
        )

    try:
        results = model.predict(
            source=np.array(pil_image.convert("RGB")),
            conf=settings.DETECTION_CONFIDENCE_THRESHOLD,
            iou=settings.DETECTION_IOU_THRESHOLD,
            verbose=False,
        )
    except Exception as exc:
        logger.error("YOLO inference error: %s", exc)
        return DetectionServiceResult(
            model_ready=True,
            model_message=f"Inference error: {exc}",
            image_width=img_w,
            image_height=img_h,
        )

    detections: List[RawDetection] = []
    names = getattr(model, "names", {})
    for result in results:
        boxes = result.boxes
        if boxes is None:
            continue
        for box in boxes:
            cls_id = int(box.cls.item())
            conf = float(box.conf.item())
            xyxy = box.xyxy[0].tolist()
            if isinstance(names, dict) and cls_id in names:
                name = str(names[cls_id])
                if "pothole" in name.lower():
                    code = "D40"
                elif "crack" in name.lower():
                    code = "D00"
                elif "manhole" in name.lower():
                    code = "M01"
                else:
                    code = f"D{cls_id:02d}"
            else:
                code, name = CLASS_MAP.get(cls_id, ("UNK", "Unknown"))
            detections.append(
                RawDetection(
                    class_id=cls_id,
                    class_code=code,
                    class_name=name,
                    confidence=round(conf, 4),
                    x1=round(xyxy[0], 2),
                    y1=round(xyxy[1], 2),
                    x2=round(xyxy[2], 2),
                    y2=round(xyxy[3], 2),
                )
            )

    return DetectionServiceResult(
        model_ready=True,
        detections=detections,
        model_message=f"{len(detections)} detection(s) found.",
        image_width=img_w,
        image_height=img_h,
    )
