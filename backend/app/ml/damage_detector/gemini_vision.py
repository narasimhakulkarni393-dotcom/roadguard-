"""Gemini vision damage detection provider.

Sends each image to the Gemini API with a strict JSON response schema and maps
only recognised road-damage labels into the PitScout taxonomy. This is an LLM
vision model, not a trained object detector: boxes and confidences are the
model's self-reported estimates, are not calibrated, and have not been evaluated
against a labelled road-damage set. API failures surface as ``model_ready:
false`` rather than an empty success.
"""
from __future__ import annotations

import base64
import io
import json
import logging
import time
from typing import Any, Dict, List, Optional

from PIL import Image

from app.core.config import settings
from app.ml.base import BaseModelInterface
from app.ml.damage_detector.model import REQUIRED_TAXONOMY
from app.ml.damage_detector.taxonomy import CLASS_IDS, canonical_class

logger = logging.getLogger("roadguard.ml.gemini_detection")

GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

PROMPT = (
    "Detect visible road-surface damage in this image. Return only defects from this list: "
    "pothole, manhole_cover, sewage_hole, longitudinal_crack, transverse_crack, alligator_crack. "
    "For each defect return a tight bounding box as [ymin, xmin, ymax, xmax] normalized to "
    "0-1000 and a confidence between 0 and 1. Do not label vehicles, people, vegetation, "
    "shadows, paint, or normal road texture. If no road damage is visible, return an empty list."
)

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "detections": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "label": {"type": "STRING", "enum": list(CLASS_IDS.keys())},
                    "confidence": {"type": "NUMBER"},
                    "box_2d": {
                        "type": "ARRAY",
                        "items": {"type": "INTEGER"},
                        "minItems": 4,
                        "maxItems": 4,
                    },
                },
                "required": ["label", "confidence", "box_2d"],
            },
        }
    },
    "required": ["detections"],
}


class GeminiDamageDetector(BaseModelInterface):
    """Remote road-damage detection through the Gemini API."""

    def __init__(self, model_id: Optional[str] = None, api_key: Optional[str] = None):
        self.model_id = (model_id if model_id is not None else settings.GEMINI_MODEL_ID).strip()
        self._api_key = api_key if api_key is not None else settings.GEMINI_API_KEY
        self._http = None
        self._is_ready = False
        self._last_error = ""
        self._version = f"gemini:{self.model_id or 'unconfigured'}"
        self.load()

    def load(self) -> None:
        self._last_error = ""
        self._http = None
        self._is_ready = False
        if not self.model_id:
            self._last_error = "GEMINI_MODEL_ID is not configured."
            return
        if not self._api_key:
            self._last_error = "GEMINI_API_KEY is not configured; Gemini detection is disabled."
            return
        try:
            import httpx

            self._http = httpx.Client(timeout=settings.GEMINI_TIMEOUT_S)
            self._is_ready = True
        except Exception as exc:  # pragma: no cover - depends on httpx import
            self._last_error = f"Could not initialise the HTTP client: {exc}"

    def _unavailable(self, width: int, height: int, error: str, started: float) -> Dict[str, Any]:
        return {
            "model_ready": False,
            "error": error,
            "model_name": "gemini_damage_detector",
            "model_version": self._version,
            "provider": "gemini",
            "image_width": width,
            "image_height": height,
            "inference_duration_ms": round((time.perf_counter() - started) * 1000, 2),
            "detections": [],
        }

    def predict(self, image: Image.Image, **kwargs: Any) -> Dict[str, Any]:
        img_w, img_h = image.size
        started = time.perf_counter()

        if not self._is_ready or self._http is None:
            return self._unavailable(img_w, img_h, self._last_error or "Gemini detection is unavailable.", started)

        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, format="JPEG", quality=92)
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": PROMPT},
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": base64.b64encode(buffer.getvalue()).decode("ascii"),
                            }
                        },
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0,
                "responseMimeType": "application/json",
                "responseSchema": RESPONSE_SCHEMA,
            },
        }

        try:
            response = self._http.post(
                GEMINI_ENDPOINT.format(model=self.model_id),
                headers={"x-goog-api-key": self._api_key, "Content-Type": "application/json"},
                json=payload,
            )
        except Exception as exc:
            logger.error("Gemini request failed for %s: %s", self.model_id, exc)
            return self._unavailable(img_w, img_h, f"Gemini request failed: {exc}", started)

        if response.status_code != 200:
            message = ""
            try:
                message = str((response.json().get("error") or {}).get("message", ""))
            except Exception:
                message = response.text[:200]
            return self._unavailable(
                img_w,
                img_h,
                f"Gemini API returned HTTP {response.status_code}: {message or 'unknown error'}",
                started,
            )

        try:
            data = response.json()
        except Exception:
            return self._unavailable(img_w, img_h, "Gemini returned a non-JSON response.", started)

        candidates = data.get("candidates") or []
        if not candidates:
            feedback = data.get("promptFeedback") or {}
            reason = feedback.get("blockReason") or "no candidates"
            return self._unavailable(img_w, img_h, f"Gemini returned no result ({reason}).", started)

        text_parts = []
        for part in (candidates[0].get("content") or {}).get("parts", []) or []:
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                text_parts.append(part["text"])
        raw_text = "".join(text_parts).strip()
        if not raw_text:
            finish = candidates[0].get("finishReason") or "empty response"
            return self._unavailable(img_w, img_h, f"Gemini returned no detection payload ({finish}).", started)

        try:
            parsed = json.loads(raw_text)
            raw_detections = parsed.get("detections") or []
        except Exception:
            return self._unavailable(img_w, img_h, "Gemini returned malformed JSON for detections.", started)

        threshold = float(kwargs.get("conf", settings.DETECTION_CONFIDENCE_THRESHOLD))
        detections: List[Dict[str, Any]] = []
        ignored: Dict[str, int] = {}

        for item in raw_detections:
            if not isinstance(item, dict):
                continue
            raw_label = str(item.get("label", "unknown"))
            try:
                score = float(item.get("confidence", 0.0))
            except (TypeError, ValueError):
                continue
            if score < threshold:
                continue

            box = item.get("box_2d")
            if not isinstance(box, (list, tuple)) or len(box) != 4:
                ignored[f"{raw_label} (invalid box)"] = ignored.get(f"{raw_label} (invalid box)", 0) + 1
                continue
            try:
                ymin, xmin, ymax, xmax = (float(value) for value in box)
            except (TypeError, ValueError):
                ignored[f"{raw_label} (invalid box)"] = ignored.get(f"{raw_label} (invalid box)", 0) + 1
                continue

            scale = 1.0 if max(abs(ymin), abs(xmin), abs(ymax), abs(xmax)) <= 1.0 else 1000.0
            x1 = max(0, min(int(round(xmin / scale * img_w)), img_w - 1))
            y1 = max(0, min(int(round(ymin / scale * img_h)), img_h - 1))
            x2 = max(x1 + 1, min(int(round(xmax / scale * img_w)), img_w))
            y2 = max(y1 + 1, min(int(round(ymax / scale * img_h)), img_h))
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
                    "confidence": round(max(0.0, min(score, 1.0)), 4),
                    "bbox": [x1, y1, x2, y2],
                    "width": bw,
                    "height": bh,
                    "area": bw * bh,
                    "model_name": "gemini_damage_detector",
                    "model_version": self._version,
                }
            )

        return {
            "model_ready": True,
            "model_name": "gemini_damage_detector",
            "model_version": self._version,
            "provider": "gemini",
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
            "device": "remote:gemini",
            "provider": "gemini",
            "model_id": self.model_id,
            "version": self._version,
            "classes": REQUIRED_TAXONOMY,
            "error": self._last_error or None,
        }

    def metadata(self) -> Dict[str, Any]:
        return {
            "model_name": "gemini_damage_detector",
            "architecture": "Gemini vision with structured JSON output",
            "provider": "gemini",
            "model_id": self.model_id,
            "classes": REQUIRED_TAXONOMY,
            "version": self._version,
            "has_custom_weights": False,
            "metrics_note": "LLM output is not a calibrated detector; no accuracy evaluation was run.",
        }

    def version(self) -> str:
        return self._version

    def is_ready(self) -> bool:
        return self._is_ready
