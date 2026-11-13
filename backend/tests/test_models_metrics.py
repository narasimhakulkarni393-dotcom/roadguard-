"""Model inventory route — metrics are only reported when an evaluation file exists."""
import json

import pytest
from fastapi.testclient import TestClient

from app.api.routes import models as models_route
from app.core.config import settings
from app.main import app

client = TestClient(app)
AUTH_HEADERS = {"X-API-Key": settings.API_KEY}


def _detector(payload):
    return payload["models"][0]


def test_without_evaluation_file_metrics_are_null(tmp_path, monkeypatch):
    monkeypatch.setattr(models_route, "METRICS_PATH", tmp_path / "missing.json")
    res = client.get("/api/v1/models", headers=AUTH_HEADERS)
    assert res.status_code == 200
    entry = _detector(res.json())
    assert entry["metrics"] is None
    assert "No held-out evaluation" in entry["metrics_note"]


def test_evaluation_file_is_reported(tmp_path, monkeypatch):
    metrics_file = tmp_path / "metrics.json"
    metrics_file.write_text(
        json.dumps(
            {
                "model_sha256_prefix": "abc123def456",
                "split": "test",
                "split_images": 201,
                "imgsz": 480,
                "evaluated_at": "2026-11-14T02:00:00+00:00",
                "overall": {"mAP50": 0.51, "mAP50_95": 0.24, "precision": 0.62, "recall": 0.49},
                "per_class": {"pothole": {"ap50": 0.6}},
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(models_route, "METRICS_PATH", metrics_file)
    res = client.get("/api/v1/models", headers=AUTH_HEADERS)
    assert res.status_code == 200
    entry = _detector(res.json())
    assert entry["metrics"]["mAP50"] == 0.51
    assert entry["metrics"]["split"] == "test"
    assert entry["metrics"]["split_images"] == 201
    assert entry["metrics"]["per_class"]["pothole"]["ap50"] == 0.6


def test_corrupt_evaluation_file_is_not_reported(tmp_path, monkeypatch):
    metrics_file = tmp_path / "metrics.json"
    metrics_file.write_text("{broken", encoding="utf-8")
    monkeypatch.setattr(models_route, "METRICS_PATH", metrics_file)
    res = client.get("/api/v1/models", headers=AUTH_HEADERS)
    assert res.status_code == 200
    assert _detector(res.json())["metrics"] is None
