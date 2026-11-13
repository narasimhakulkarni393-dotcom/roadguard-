"""Test API Key Authentication."""
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
VALID_KEY = "roadguard-production-api-key-2026"


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
