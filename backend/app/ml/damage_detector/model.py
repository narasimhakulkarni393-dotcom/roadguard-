"""Real YOLO Road Damage Detection Model Interface.

Stage 3: Executes YOLO inference on the input image to identify defects:
- pothole
- manhole_cover
- sewage_hole
- longitudinal_crack
- transverse_crack
- alligator_crack
"""
from __future__ import annotations

import hashlib
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
import numpy as np
from PIL import Image

from app.core.config import settings
from app.ml.base import BaseModelInterface

logger = logging.getLogger("roadguard.ml.damage_detector")

REQUIRED_TAXONOMY = {
    0: "pothole",
    1: "manhole_cover",
    2: "sewage_hole",
    3: "longitudinal_crack",
    4: "transverse_crack",
    5: "alligator_crack",
}


def _refine_crack_subclass(w: int, h: int) -> str:
    """Classify crack subtype based on geometry and aspect ratio."""
    aspect = w / max(1, h)
    if aspect > 1.75:
        return "transverse_crack"
    elif aspect < 0.55:
        return "longitudinal_crack"
    else:
        return "alligator_crack"


def _refine_manhole_or_sewage(image: Image.Image, bbox: List[int], conf: float) -> str:
    """Distinguish covered manhole vs dangerous open sewage hole void."""
    x1, y1, x2, y2 = bbox
    crop = image.crop((x1, y1, x2, y2))
    gray = np.array(crop.convert("L"), dtype=np.float32)
    mean_brightness = float(np.mean(gray)) if gray.size > 0 else 100.0
    # Open sewage hole is dark cavity without metallic reflection
    if mean_brightness < 42.0 and conf > 0.15:
        return "sewage_hole"
    return "manhole_cover"


class DamageDetectorModel(BaseModelInterface):
    """Ultralytics YOLO damage detector."""

    def __init__(self, model_path: Optional[Path] = None):
        self.model_path = model_path or settings.DETECTION_MODEL_PATH
        self._is_ready = False
        self._model = None
        self._version = "yolov8-unavailable"
        self._device = "cpu"
        self._checksum = ""
        self._raw_names = {}
        self.load()

    def load(self) -> None:
        try:
            if not self.model_path.exists():
                logger.warning("YOLO detection weights not found at %s", self.model_path)
                self._is_ready = False
                return

            import torch
            from ultralytics import YOLO

            self._device = "cuda" if torch.cuda.is_available() else "cpu"
            self._model = YOLO(str(self.model_path))
            self._model.to(self._device)
            self._checksum = hashlib.sha256(self.model_path.read_bytes()).hexdigest()[:12]
            self._version = f"yolov8n-roadguard-{self._checksum}"
            self._raw_names = getattr(self._model, "names", {})
            self._is_ready = True
            logger.info("Loaded YOLO detection model from %s on %s (classes: %s)", self.model_path, self._device, self._raw_names)
        except Exception as e:
            logger.error("Failed to load YOLO model: %s", e)
            self._is_ready = False

    def predict(self, image: Image.Image, **kwargs: Any) -> Dict[str, Any]:
        """Execute real YOLO inference on the uploaded image."""
        img_w, img_h = image.size
        t0 = time.perf_counter()

        if not self._is_ready or self._model is None:
            return {
                "model_ready": False,
                "error": "Detection model unavailable. Check weights at DETECTION_MODEL_PATH.",
                "model_name": "yolov8_damage_detector",
                "model_version": self._version,
                "image_width": img_w,
                "image_height": img_h,
                "inference_duration_ms": 0.0,
                "detections": [],
            }

        conf_threshold = kwargs.get("conf", settings.DETECTION_CONFIDENCE_THRESHOLD)
        iou_threshold = kwargs.get("iou", settings.DETECTION_IOU_THRESHOLD)

        # Ensure independent RGB numpy array
        np_img = np.array(image.convert("RGB"))

        try:
            results = self._model.predict(
                source=np_img,
                conf=conf_threshold,
                iou=iou_threshold,
                verbose=False,
            )
        except Exception as e:
            logger.error("YOLO inference failed: %s", e)
            return {
                "model_ready": True,
                "error": f"Inference execution error: {e}",
                "model_name": "yolov8_damage_detector",
                "model_version": self._version,
                "image_width": img_w,
                "image_height": img_h,
                "inference_duration_ms": round((time.perf_counter() - t0) * 1000, 2),
                "detections": [],
            }

        duration_ms = round((time.perf_counter() - t0) * 1000, 2)
        raw_detections = []

        if results and len(results) > 0:
            boxes = results[0].boxes
            if boxes is not None:
                for b in boxes:
                    cls_id = int(b.cls[0].item())
                    conf = float(b.conf[0].item())
                    coords = [round(float(c), 2) for c in b.xyxy[0].tolist()]

                    # Clamp coordinates to image boundaries
                    x1 = max(0, min(int(coords[0]), img_w - 1))
                    y1 = max(0, min(int(coords[1]), img_h - 1))
                    x2 = max(x1 + 1, min(int(coords[2]), img_w))
                    y2 = max(y1 + 1, min(int(coords[3]), img_h))
                    bw = x2 - x1
                    bh = y2 - y1

                    raw_label = str(self._raw_names.get(cls_id, "defect")).lower()

                    # Map into canonical taxonomy
                    if "pothole" in raw_label:
                        canonical_class = "pothole"
                        canonical_id = 0
                    elif "manhole" in raw_label:
                        canonical_class = _refine_manhole_or_sewage(image, [x1, y1, x2, y2], conf)
                        canonical_id = 2 if canonical_class == "sewage_hole" else 1
                    elif "crack" in raw_label:
                        canonical_class = _refine_crack_subclass(bw, bh)
                        if canonical_class == "longitudinal_crack":
                            canonical_id = 3
                        elif canonical_class == "transverse_crack":
                            canonical_id = 4
                        else:
                            canonical_id = 5
                    else:
                        canonical_class = "pothole"
                        canonical_id = 0

                    raw_detections.append({
                        "class": canonical_class,
                        "class_id": canonical_id,
                        "raw_label": raw_label,
                        "raw_class_id": cls_id,
                        "confidence": round(conf, 4),
                        "bbox": [x1, y1, x2, y2],
                        "width": bw,
                        "height": bh,
                        "area": bw * bh,
                        "model_name": "yolov8_damage_detector",
                        "model_version": self._version,
                    })

        return {
            "model_ready": True,
            "model_name": "yolov8_damage_detector",
            "model_version": self._version,
            "image_width": img_w,
            "image_height": img_h,
            "inference_duration_ms": duration_ms,
            "total_detections": len(raw_detections),
            "detections": raw_detections,
        }

    def health(self) -> Dict[str, Any]:
        return {
            "name": "damage_detector",
            "ready": self._is_ready,
            "device": self._device,
            "version": self._version,
            "classes": self._raw_names,
        }

    def metadata(self) -> Dict[str, Any]:
        return {
            "model_name": "yolov8_damage_detector",
            "architecture": "Ultralytics YOLOv8n",
            "classes": REQUIRED_TAXONOMY,
            "raw_classes": self._raw_names,
            "version": self._version,
            "checksum": self._checksum,
            "has_custom_weights": self._is_ready,
        }

    def version(self) -> str:
        return self._version

    def is_ready(self) -> bool:
        return self._is_ready
