"""Test strict sequential pipeline order execution and early rejection stops."""
import io
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from app.services.inspection_pipeline import inspection_pipeline
from app.core.config import settings

client = TestClient(app)
VALID_KEY = settings.API_KEY
AUTH_HEADERS = {"Authorization": f"Bearer {VALID_KEY}"}


def test_stage1_rejects_non_road_scene():
    """Non-road images must stop execution immediately at Stage 1."""
    # Saturated green image without road texture
    img = Image.new("RGB", (400, 400), color=(0, 220, 50))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    file_bytes = buf.getvalue()

    result = inspection_pipeline.process_image(file_bytes, "grass.jpg")
    assert result["success"] is False
    assert result["pipeline_status"] == "rejected"
    assert result["stage"] == "road_classification"
    assert result["is_road"] is False
    assert result["detections"] == []


def test_stage2_rejects_ai_generated_image(monkeypatch):
    """AI-generated images must stop execution immediately at Stage 2."""
    from app.services.authenticity_service import AuthenticityAnalysisResult

    def mock_ai_auth(img, **kwargs):
        return {
            "label": "likely_ai_generated",
            "verdict": "likely_ai_generated",
            "confidence": 0.95,
            "model_version": "mock_test",
            "warning": "Probabilistic detection",
        }

    monkeypatch.setattr(inspection_pipeline.registry.authenticity_classifier, "predict", mock_ai_auth)

    # Road-like neutral gray image
    img = Image.new("RGB", (640, 480), color=(110, 110, 110))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    file_bytes = buf.getvalue()

    result = inspection_pipeline.process_image(file_bytes, "ai_road.jpg")
    assert result["success"] is False
    assert result["pipeline_status"] == "rejected"
    assert result["stage"] == "authenticity_detection"
    assert result["label"] == "likely_ai_generated"
    assert result["detections"] == []


def test_full_pipeline_on_road_sample():
    """Authentic road image runs through all stages to Stage 7."""
    from pathlib import Path
    sample = Path("datasets/processed/kaggle_road_damage/images/train/20250219_165333.jpg")
    if not sample.exists():
        sample = Path("../datasets/processed/kaggle_road_damage/images/train/20250219_165333.jpg")
    if not sample.exists():
        pytest.skip("Test image not found")

    with open(sample, "rb") as f:
        file_bytes = f.read()

    result = inspection_pipeline.process_image(file_bytes, "road_sample.jpg")
    assert result["success"] is True
    assert result["pipeline_status"] == "completed"
    assert result["image_validation"]["valid"] is True
    assert result["road_classification"]["label"] == "road"
    assert result["authenticity"]["label"] in ("likely_real", "uncertain")
    assert "damage_analysis" in result
    assert "detections" in result["damage_analysis"]
