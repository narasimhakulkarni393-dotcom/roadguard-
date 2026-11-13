"""Hugging Face Inference API damage detector.

Runs object detection remotely through ``huggingface_hub.InferenceClient`` so the
backend does not need local torch/ultralytics weights or a GPU.

The default model (``facebook/detr-resnet-50``) is trained on COCO, which has no
road-damage classes. Labels outside the PitScout taxonomy are counted in
``ignored_labels`` and never relabelled as defects, so a COCO model reports zero
detections instead of inventing potholes. Set ``HF_DETECTION_MODEL_ID`` to a
road-damage object-detection model for meaningful output.
"""
from __future__ import annotations

import io
import logging
import time
from typing import Any, Dict, List, Optional

from PIL import Image

from app.core.config import settings
from app.ml.base import BaseModelInterface
from app.ml.damage_detector.model import REQUIRED_TAXONOMY
from app.ml.damage_detector.taxonomy import CLASS_IDS, canonical_class

logger = logging.getLogger("roadguard.ml.hf_detection")


def _box_value(box: Any, name: str) -> float:
    if isinstance(box, dict):
        return float(box.get(name, 0.0))
    return float(getattr(box, name, 0.0))


def _item_value(item: Any, name: str, default: Any = None) -> Any:
    if isinstance(item, dict):
        return item.get(name, default)
    return getattr(item, name, default)


class HuggingFaceDamageDetector(BaseModelInterface):
    """Remote object detection backed by the Hugging Face Inference API."""

    def __init__(self, model_id: Optional[str] = None, token: Optional[str] = None):
        self.model_id = (model_id if model_id is not None else settings.HF_DETECTION_MODEL_ID).strip()
        self._token = token if token is not None else settings.HF_TOKEN
        self._client = None
        self._is_ready = False
        self._last_error = ""
        self._version = f"hf-inference:{self.model_id or 'unconfigured'}"
        self.load()

    def load(self) -> None:
        self._last_error = ""
        self._client = None
        self._is_ready = False
        if not self.model_id:
            self._last_error = "HF_DETECTION_MODEL_ID is not configured."
            return
        if not self._token:
            self._last_error = "HF_TOKEN is not configured; remote detection is disabled."
            return
        try:
            from huggingface_hub import InferenceClient

            self._client = InferenceClient(provider="hf-inference", api_key=self._token)
            self._is_ready = True
        except Exception as exc:  # pragma: no cover - depends on optional package
            self._last_error = f"Could not initialise Hugging Face InferenceClient: {exc}"
            self._client = None
            self._is_ready = False

    def _unavailable(self, width: int, height: int, error: str, started: float) -> Dict[str, Any]:
        return {
            "model_ready": False,
            "error": error,
            "model_name": "hf_inference_damage_detector",
            "model_version": self._version,
            "provider": "hf-inference",
            "image_width": width,
            "image_height": height,
            "inference_duration_ms": round((time.perf_counter() - started) * 1000, 2),
            "detections": [],
        }

    def predict(self, image: Image.Image, **kwargs: Any) -> Dict[str, Any]:
        img_w, img_h = image.size
        started = time.perf_counter()

        if not self._is_ready or self._client is None:
            return self._unavailable(img_w, img_h, self._last_error or "Remote detection is unavailable.", started)

        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, format="JPEG", quality=92)

        try:
            results = self._client.object_detection(buffer.getvalue(), model=self.model_id)
        except Exception as exc:
            logger.error("Hugging Face inference failed for %s: %s", self.model_id, exc)
            return self._unavailable(
                img_w,
                img_h,
                f"Hugging Face inference failed for {self.model_id}: {exc}",
                started,
            )

        threshold = float(kwargs.get("conf", settings.DETECTION_CONFIDENCE_THRESHOLD))
        detections: List[Dict[str, Any]] = []
        ignored: Dict[str, int] = {}

        for item in results or []:
            box = _item_value(item, "box")
            if box is None:
                continue
            raw_label = str(_item_value(item, "label", "unknown"))
            score = float(_item_value(item, "score", 0.0))
            if score < threshold:
                continue

            x1 = max(0, min(int(round(_box_value(box, "xmin"))), img_w - 1))
            y1 = max(0, min(int(round(_box_value(box, "ymin"))), img_h - 1))
            x2 = max(x1 + 1, min(int(round(_box_value(box, "xmax"))), img_w))
            y2 = max(y1 + 1, min(int(round(_box_value(box, "ymax"))), img_h))
            bw = x2 - x1
            bh = y2 - y1

            mapped = canonical_class(raw_label, bw, bh)
            if mapped is None:
                ignored[raw_label] = ignored.get(raw_label, 0) + 1
                continue

            detections.append(
                {
                    "class": mapped,
                    "class_id": CLASS_IDS[mapped],
                    "raw_label": raw_label,
                    "raw_class_id": None,
                    "confidence": round(score, 4),
                    "bbox": [x1, y1, x2, y2],
                    "width": bw,
                    "height": bh,
                    "area": bw * bh,
                    "model_name": "hf_inference_damage_detector",
                    "model_version": self._version,
                }
            )

        return {
            "model_ready": True,
            "model_name": "hf_inference_damage_detector",
            "model_version": self._version,
            "provider": "hf-inference",
            "image_width": img_w,
            "image_height": img_h,
            "inference_duration_ms": round((time.perf_counter() - started) * 1000, 2),
            "total_detections": len(detections),
            "detections": detections,
            "ignored_labels": ignored,
        }

    def health(self) -> Dict[str, Any]:
        return {
            "name": "damage_detector",
            "ready": self._is_ready,
            "device": "remote:hf-inference",
            "provider": "hf-inference",
            "model_id": self.model_id,
            "version": self._version,
            "classes": REQUIRED_TAXONOMY,
            "error": self._last_error or None,
        }

    def metadata(self) -> Dict[str, Any]:
        return {
            "model_name": "hf_inference_damage_detector",
            "architecture": "Remote object detection via Hugging Face Inference API",
            "provider": "hf-inference",
            "model_id": self.model_id,
            "classes": REQUIRED_TAXONOMY,
            "version": self._version,
            "has_custom_weights": False,
        }

    def version(self) -> str:
        return self._version

    def is_ready(self) -> bool:
        return self._is_ready
