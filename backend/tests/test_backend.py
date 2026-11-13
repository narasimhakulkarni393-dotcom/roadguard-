"""Comprehensive backend tests for RoadGuard AI."""
import io
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.database.session import init_db
from app.services.image_validation import validate_image
from app.services.authenticity_service import analyse_authenticity
from app.services.detection_service import run_detection, RawDetection
from app.services.measurement_service import measure_detection
from app.services.severity_service import calculate_severity
from app.services.cause_service import analyse_causes, get_recommended_actions

init_db()
client = TestClient(app)


def create_test_image(width=640, height=480, color=(100, 100, 100)) -> bytes:
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# 1. Health endpoint
def test_health_endpoint():
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"


# 2. Image validation - valid JPEG
def test_image_validation_valid_jpeg():
    raw_bytes = create_test_image(800, 600)
    result = validate_image(raw_bytes, "road_sample.jpg")
    assert result.valid is True
    assert result.width == 800
    assert result.height == 600
    assert result.format == "JPEG"
    assert result.md5_hash is not None


# 3. Unsupported file rejection
def test_unsupported_file_rejection():
    fake_bytes = b"NOT_AN_IMAGE_FILE_CONTENT"
    res = client.post(
        "/api/v1/analysis/image",
        files={"file": ("malicious.exe", fake_bytes, "application/octet-stream")},
    )
    assert res.status_code == 422


# 4. Authenticity service
def test_authenticity_pipeline():
    img = Image.new("RGB", (300, 300), color=(128, 128, 128))
    result = analyse_authenticity(img)
    assert result.verdict in ("natural", "ai_generated", "manipulated", "uncertain", "likely_real", "likely_ai_generated")
    assert 0.0 <= result.confidence <= 1.0
    assert "limitations" in result.__dict__


# 5. Detection service with no model weights
def test_detection_service_graceful_fallback():
    img = Image.new("RGB", (640, 480), color=(50, 50, 50))
    res = run_detection(img)
    assert res.image_width == 640
    assert res.image_height == 480
    assert isinstance(res.detections, list)


# 6. Measurement calculations
def test_measurement_calculations():
    det = RawDetection(
        class_id=3,
        class_code="D40",
        class_name="Pothole",
        confidence=0.88,
        x1=100.0,
        y1=150.0,
        x2=200.0,
        y2=250.0,
    )
    meas = measure_detection(det, image_width=1000, image_height=1000)
    assert meas.width_pixels == 100.0
    assert meas.height_pixels == 100.0
    assert meas.area_pixels == 10000.0
    assert meas.shape_ratio == 1.0
    assert meas.relative_area == 0.01
    assert meas.measurement_method == "pixel_only"
    assert meas.real_world_width_m is None


# 7. Severity calculations
def test_severity_calculations():
    det = RawDetection(
        class_id=3,
        class_code="D40",
        class_name="Pothole",
        confidence=0.92,
        x1=50.0,
        y1=50.0,
        x2=450.0,
        y2=450.0,
    )
    meas = measure_detection(det, image_width=500, image_height=500)
    sev = calculate_severity(det, meas, total_detections=1)
    assert sev.level in ("LOW", "MODERATE", "HIGH", "CRITICAL")
    assert 0.0 <= sev.score <= 100.0
    assert len(sev.factors) > 0


# 8. Cause engine & recommended actions
def test_cause_engine():
    causes = analyse_causes("Pothole")
    assert len(causes) > 0
    assert any("Water" in c.cause or "traffic" in c.cause.lower() or "moisture" in c.cause.lower() for c in causes)

    actions = get_recommended_actions("Pothole", "HIGH")
    assert len(actions) > 0


# 9. Analytics overview endpoint
def test_analytics_overview():
    res = client.get("/api/v1/analytics/overview")
    assert res.status_code == 200
    data = res.json()
    assert "total_inspections" in data
    assert "damage_distribution" in data


# 10. Models endpoint
def test_models_endpoint():
    res = client.get("/api/v1/models")
    assert res.status_code == 200
    data = res.json()
    assert "models" in data
    assert len(data["models"]) >= 2
