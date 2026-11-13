"""Dataset status route tests — manifest-driven reporting."""
import json

import pytest
from fastapi.testclient import TestClient

from app.api.routes import datasets as datasets_route
from app.core.config import settings
from app.main import app

client = TestClient(app)
AUTH_HEADERS = {"X-API-Key": settings.API_KEY}


@pytest.fixture()
def dataset_root(tmp_path, monkeypatch):
    monkeypatch.setattr(datasets_route, "DATASET_ROOT", tmp_path)
    return tmp_path


def _by_id(payload):
    return {item["id"]: item for item in payload["datasets"]}


def test_processed_files_do_not_mark_rdd2022_ready(dataset_root):
    stray = dataset_root / "processed" / "kaggle_road_damage" / "images" / "train"
    stray.mkdir(parents=True)
    (stray / "sample.jpg").write_bytes(b"not-an-image")

    res = client.get("/api/v1/datasets/status", headers=AUTH_HEADERS)
    assert res.status_code == 200
    items = _by_id(res.json())
    assert items["rdd2022"]["status"] == "unprepared"
    assert items["rdd2022"]["processed_files"] == 0
    assert "kaggle_road_damage" not in items


def test_manifest_reports_prepared_kaggle_dataset(dataset_root):
    manifest = {
        "dataset": "lorenzoarcioni/road-damage-dataset-potholes-cracks-and-manholes",
        "citation": "https://doi.org/10.5281/zenodo.17834373",
        "license": "Not declared in the dataset README",
        "prepared_at": "2026-11-14T00:00:00+00:00",
        "resolved_version": "4",
        "splits": {
            "train": {"images": 1607, "instances": {"pothole": 1030, "crack": 2031, "manhole": 763}},
            "val": {"images": 201, "instances": {"pothole": 116, "crack": 243, "manhole": 88}},
            "test": {"images": 201, "instances": {"pothole": 115, "crack": 243, "manhole": 104}},
        },
    }
    out = dataset_root / "processed" / "kaggle_road_damage"
    out.mkdir(parents=True)
    (out / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    res = client.get("/api/v1/datasets/status", headers=AUTH_HEADERS)
    assert res.status_code == 200
    payload = res.json()
    items = _by_id(payload)
    kaggle = items["kaggle_road_damage"]
    assert kaggle["status"] == "ready"
    assert kaggle["processed_files"] == 2009
    assert kaggle["split_counts"] == {"train": 1607, "val": 201, "test": 201}
    assert kaggle["classes"] == ["pothole", "crack", "manhole"]
    assert kaggle["resolved_version"] == "4"
    assert payload["datasets"][0]["id"] == "kaggle_road_damage"
    assert payload["summary"]["total_processed_files"] == 2009


def test_corrupt_manifest_is_ignored(dataset_root):
    out = dataset_root / "processed" / "kaggle_road_damage"
    out.mkdir(parents=True)
    (out / "manifest.json").write_text("{not json", encoding="utf-8")

    res = client.get("/api/v1/datasets/status", headers=AUTH_HEADERS)
    assert res.status_code == 200
    assert "kaggle_road_damage" not in _by_id(res.json())
