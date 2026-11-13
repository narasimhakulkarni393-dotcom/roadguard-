"""Tests for the Gemini vision detection provider. No network calls are made."""
import json

from PIL import Image

from app.core.config import settings
from app.ml.damage_detector.gemini_vision import GeminiDamageDetector
from app.ml.registry import registry


class StubResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


class StubHttp:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def post(self, url, headers=None, json=None):
        self.calls.append({"url": url, "headers": headers, "json": json})
        return self.response


def gemini_response(detections):
    return StubResponse(
        payload={"candidates": [{"content": {"parts": [{"text": json.dumps({"detections": detections})}]}}]}
    )


def make_detector(response):
    detector = GeminiDamageDetector(model_id="gemini-2.5-flash", api_key="test-key")
    detector._http = StubHttp(response)
    detector._is_ready = True
    return detector


def test_missing_key_fails_closed():
    detector = GeminiDamageDetector(model_id="gemini-2.5-flash", api_key="")
    assert detector.is_ready() is False

    result = detector.predict(Image.new("RGB", (400, 300), (80, 80, 80)))
    assert result["model_ready"] is False
    assert "GEMINI_API_KEY" in result["error"]
    assert result["detections"] == []


def test_boxes_are_mapped_and_scaled():
    detector = make_detector(
        gemini_response([{"label": "pothole", "confidence": 0.82, "box_2d": [100, 250, 500, 750]}])
    )

    result = detector.predict(Image.new("RGB", (400, 400), (80, 80, 80)))

    assert result["model_ready"] is True
    assert result["total_detections"] == 1
    detection = result["detections"][0]
    assert detection["class"] == "pothole"
    assert detection["confidence"] == 0.82
    # ymin=100/1000*400=40, xmin=250/1000*400=100, ymax=200, xmax=300
    assert detection["bbox"] == [100, 40, 300, 200]


def test_unknown_labels_are_ignored_not_relabelled():
    detector = make_detector(
        gemini_response([
            {"label": "car", "confidence": 0.9, "box_2d": [0, 0, 100, 100]},
            {"label": "pothole", "confidence": 0.7, "box_2d": [0, 0, 100, 100]},
        ])
    )

    result = detector.predict(Image.new("RGB", (400, 300), (80, 80, 80)))

    assert result["total_detections"] == 1
    assert result["ignored_labels"] == {"car": 1}


def test_low_confidence_and_invalid_boxes_are_dropped():
    detector = make_detector(
        gemini_response([
            {"label": "pothole", "confidence": 0.01, "box_2d": [0, 0, 100, 100]},
            {"label": "pothole", "confidence": 0.9, "box_2d": [1, 2]},
        ])
    )

    result = detector.predict(Image.new("RGB", (400, 300), (80, 80, 80)))

    assert result["total_detections"] == 0
    assert result["ignored_labels"] == {"pothole (invalid box)": 1}


def test_malformed_json_is_reported():
    detector = make_detector(
        StubResponse(payload={"candidates": [{"content": {"parts": [{"text": "not json"}]}}]})
    )

    result = detector.predict(Image.new("RGB", (400, 300), (80, 80, 80)))

    assert result["model_ready"] is False
    assert "malformed JSON" in result["error"]


def test_http_error_is_reported():
    detector = make_detector(
        StubResponse(status_code=429, payload={"error": {"message": "Quota exceeded"}})
    )

    result = detector.predict(Image.new("RGB", (400, 300), (80, 80, 80)))

    assert result["model_ready"] is False
    assert "429" in result["error"]
    assert "Quota exceeded" in result["error"]


def test_safety_block_is_reported():
    detector = make_detector(
        StubResponse(payload={"promptFeedback": {"blockReason": "SAFETY"}, "candidates": []})
    )

    result = detector.predict(Image.new("RGB", (400, 300), (80, 80, 80)))

    assert result["model_ready"] is False
    assert "SAFETY" in result["error"]


def test_request_uses_server_side_key_header():
    detector = make_detector(gemini_response([]))
    detector.predict(Image.new("RGB", (400, 300), (80, 80, 80)))

    call = detector._http.calls[0]
    assert "gemini-2.5-flash" in call["url"]
    assert call["headers"]["x-goog-api-key"] == "test-key"
    assert call["json"]["generationConfig"]["responseMimeType"] == "application/json"


def test_registry_selects_gemini_from_settings(monkeypatch):
    monkeypatch.setattr(settings, "DETECTION_PROVIDER", "gemini")
    monkeypatch.setattr(registry, "_damage_detector", None)

    assert isinstance(registry.damage_detector, GeminiDamageDetector)

    monkeypatch.setattr(registry, "_damage_detector", None)
