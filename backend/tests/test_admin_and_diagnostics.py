"""Test Admin Diagnostics and Readiness endpoints."""
import os
import io
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings

client = TestClient(app)
VALID_KEY = settings.API_KEY
AUTH_HEADERS = {"Authorization": f"Bearer {VALID_KEY}"}


def test_ready_endpoint():
    res = client.get("/ready")
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert "models_ready" in data
    assert "components" in data


def test_admin_diagnostics_requires_auth():
    res = client.get("/api/v1/admin/diagnostics")
    assert res.status_code == 401


def test_admin_diagnostics_authorized():
    res = client.get("/api/v1/admin/diagnostics", headers=AUTH_HEADERS)
    assert res.status_code == 200
    data = res.json()
    assert "backend_version" in data
    assert "runtime" in data
    assert "models" in data
    assert "infrastructure" in data
    assert data["runtime"]["python_version"] != ""
    assert data["models"]["all_models_ready"] is True


def test_admin_diagnostic_inference():
    img = Image.new("RGB", (320, 240), color=(70, 70, 72))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")

    res = client.post(
        "/api/v1/admin/diagnostics/inference",
        files={"file": ("test.jpg", buf.getvalue(), "image/jpeg")},
        headers=AUTH_HEADERS,
    )
    assert res.status_code == 200
    data = res.json()
    assert "diagnostic_id" in data
    assert "image_metadata" in data
    assert data["image_metadata"]["sha256"] != ""
    assert "pipeline_stages" in data
    assert "stage_1_road_classifier" in data["pipeline_stages"]
    assert "stage_2_authenticity" in data["pipeline_stages"]
    assert "stage_3_damage_detector" in data["pipeline_stages"]
    assert "total_inference_time_ms" in data


def test_delete_inspection():
    # 1. Create a quick inspection
    img = Image.new("RGB", (320, 240), color=(70, 70, 72))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    res = client.post(
        "/api/v1/inspect",
        files={"file": ("del_test.jpg", buf.getvalue(), "image/jpeg")},
        headers=AUTH_HEADERS,
    )
    assert res.status_code == 200
    insp_id = res.json()["inspection_id"]

    # 2. Get inspection by singular path
    res_get = client.get(f"/api/v1/inspection/{insp_id}", headers=AUTH_HEADERS)
    assert res_get.status_code == 200
    assert res_get.json()["id"] == insp_id

    # 3. Delete inspection
    res_del = client.delete(f"/api/v1/inspection/{insp_id}", headers=AUTH_HEADERS)
    assert res_del.status_code == 204

    # 4. Verify 404 after deletion
    res_verify = client.get(f"/api/v1/inspection/{insp_id}", headers=AUTH_HEADERS)
    assert res_verify.status_code == 404
