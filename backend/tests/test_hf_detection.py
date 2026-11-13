"""Tests for the Hugging Face Inference API detection provider.

No network calls are made: the InferenceClient is replaced with a stub.
"""
from types import SimpleNamespace

from PIL import Image

from app.core.config import settings
from app.ml.damage_detector.hf_inference import HuggingFaceDamageDetector
from app.ml.registry import registry


class StubClient:
    def __init__(self, results):
        self.results = results
        self.calls = []

    def object_detection(self, image, model=None, **kwargs):
        self.calls.append({"image": image, "model": model})
        if isinstance(self.results, Exception):
            raise self.results
        return self.results


def make_item(label, score, xmin, ymin, xmax, ymax):
    return SimpleNamespace(
        box=SimpleNamespace(xmin=xmin, ymin=ymin, xmax=xmax, ymax=ymax),
        label=label,
        score=score,
    )


def make_detector(results):
    detector = HuggingFaceDamageDetector(model_id="facebook/detr-resnet-50", token="test-token")
    detector._client = StubClient(results)
    detector._is_ready = True
    return detector


def test_missing_token_is_not_ready():
    detector = HuggingFaceDamageDetector(model_id="facebook/detr-resnet-50", token="")
    assert detector.is_ready() is False

    result = detector.predict(Image.new("RGB", (320, 200), (90, 90, 90)))
    assert result["model_ready"] is False
    assert "HF_TOKEN" in result["error"]
    assert result["detections"] == []


def test_coco_labels_are_ignored_not_relabelled_as_potholes():
    detector = make_detector([
        make_item("person", 0.97, 10, 10, 60, 120),
        make_item("car", 0.88, 5, 5, 50, 40),
    ])

    result = detector.predict(Image.new("RGB", (320, 200), (90, 90, 90)))

    assert result["model_ready"] is True
    assert result["total_detections"] == 0
    assert result["detections"] == []
    assert result["ignored_labels"] == {"person": 1, "car": 1}


def test_pothole_label_is_mapped_and_clamped():
    detector = make_detector([make_item("pothole", 0.81, -5, 10, 999, 180)])

    result = detector.predict(Image.new("RGB", (320, 200), (90, 90, 90)))

    assert result["total_detections"] == 1
    detection = result["detections"][0]
    assert detection["class"] == "pothole"
    assert detection["class_id"] == 0
    assert detection["confidence"] == 0.81
    assert detection["bbox"] == [0, 10, 320, 180]


def test_crack_label_is_refined_by_geometry():
    wide = make_detector([make_item("crack", 0.6, 0, 0, 200, 40)])
    tall = make_detector([make_item("crack", 0.6, 0, 0, 30, 180)])

    image = Image.new("RGB", (320, 200), (90, 90, 90))
    assert wide.predict(image)["detections"][0]["class"] == "transverse_crack"
    assert tall.predict(image)["detections"][0]["class"] == "longitudinal_crack"


def test_low_confidence_is_dropped():
    detector = make_detector([make_item("pothole", 0.01, 0, 0, 20, 20)])
    image = Image.new("RGB", (320, 200), (90, 90, 90))

    assert detector.predict(image)["total_detections"] == 0


def test_remote_failure_is_reported_not_silently_empty():
    detector = make_detector(RuntimeError("quota exceeded"))

    result = detector.predict(Image.new("RGB", (320, 200), (90, 90, 90)))

    assert result["model_ready"] is False
    assert "quota exceeded" in result["error"]


def test_registry_selects_provider_from_settings(monkeypatch):
    monkeypatch.setattr(settings, "DETECTION_PROVIDER", "hf-inference")
    monkeypatch.setattr(registry, "_damage_detector", None)

    assert isinstance(registry.damage_detector, HuggingFaceDamageDetector)

    monkeypatch.setattr(registry, "_damage_detector", None)
