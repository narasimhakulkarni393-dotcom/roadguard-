"""Test API Key Authentication."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

client = TestClient(app)
VALID_KEY = settings.API_KEY


def test_public_health_endpoints():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

    res_v1 = client.get("/api/v1/health")
    assert res_v1.status_code == 200


def test_inspect_missing_auth_returns_401():
    res = client.post("/api/v1/inspect")
    assert res.status_code == 401
    assert "detail" in res.json()


def test_inspect_invalid_auth_returns_401():
    headers = {"Authorization": "Bearer wrong_invalid_key"}
    res = client.post("/api/v1/inspect", headers=headers)
    assert res.status_code == 401


def test_inspect_valid_bearer_auth():
    headers = {"Authorization": f"Bearer {VALID_KEY}"}
    # No file attached will return 422 Unprocessable Entity, not 401 Unauthorized
    res = client.post("/api/v1/inspect", headers=headers)
    assert res.status_code == 422


def test_inspect_valid_x_api_key_header():
    headers = {"X-API-Key": VALID_KEY}
    res = client.post("/api/v1/inspect", headers=headers)
    assert res.status_code == 422


def test_unset_key_fails_closed(monkeypatch):
    """A missing ROADGUARD_API_KEY must never degrade into open access."""
    monkeypatch.setattr(settings, "API_KEY", "")
    res = client.get("/api/v1/inspections", headers={"X-API-Key": "anything"})
    assert res.status_code == 503
    assert "not configured" in res.json()["detail"].lower()


def test_data_endpoints_require_auth():
    for path in ("/api/v1/inspections", "/api/v1/analytics/overview", "/api/v1/models", "/api/v1/reports"):
        assert client.get(path).status_code == 401, path
