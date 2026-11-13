"""GPS validation, visual descriptor, duplicate matching and report service tests."""
from __future__ import annotations

import io
import uuid

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.database.base import Base
from app.database.session import SessionLocal, init_db
from app.main import app
from app.ml.registry import registry
from app.models.database import Pothole, PotholeReport
from app.services.duplicate_matcher import MATCH, NO_MATCH, MatchCandidate, evaluate_candidates
from app.services.geo import assess_location, haversine_m
from app.services.pothole_report_service import create_report, relocate_report
from app.services.visual_descriptor import build_descriptor, cosine_similarity

init_db()
client = TestClient(app)
AUTH_HEADERS = {"X-API-Key": settings.API_KEY}


class NoDetectionDetector:
    def is_ready(self) -> bool:
        return True

    def version(self) -> str:
        return "fake-detector"

    def predict(self, image, **kwargs):
        return {"model_ready": True, "model_version": "fake-detector", "detections": []}


class PassThroughFilter:
    def predict(self, image, **kwargs):
        return {"is_valid": True}

    def version(self):
        return "fake-filter"


@pytest.fixture(autouse=True)
def stub_detector(monkeypatch):
    monkeypatch.setattr(registry, "_damage_detector", NoDetectionDetector())
    monkeypatch.setattr(registry, "_false_positive_filter", PassThroughFilter())


def asphalt_image(seed: int = 0, size=(320, 240)) -> bytes:
    rng = np.random.default_rng(seed)
    base = np.full((size[1], size[0], 3), 112, dtype=np.float32)
    noise = rng.normal(0, 6, base.shape)
    arr = np.clip(base + noise, 0, 255).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(arr, mode="RGB").save(buf, format="JPEG", quality=92)
    return buf.getvalue()


def painted_image(size=(320, 240)) -> bytes:
    arr = np.zeros((size[1], size[0], 3), dtype=np.uint8)
    arr[:, : size[0] // 2] = (20, 40, 220)
    arr[:, size[0] // 2 :] = (230, 180, 20)
    buf = io.BytesIO()
    Image.fromarray(arr, mode="RGB").save(buf, format="JPEG", quality=92)
    return buf.getvalue()


@pytest.fixture
def temp_db(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'reports.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def cleanup_potholes():
    created_reports: list[str] = []
    created_potholes: list[str] = []
    yield created_reports, created_potholes
    db = SessionLocal()
    try:
        if created_reports:
            db.query(PotholeReport).filter(PotholeReport.id.in_(created_reports)).delete(synchronize_session=False)
        if created_potholes:
            db.query(Pothole).filter(Pothole.id.in_(created_potholes)).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()
    for report_id in created_reports:
        for path in settings.EVIDENCE_DIR.glob(f"{report_id}.*"):
            path.unlink(missing_ok=True)


# --- Geo --------------------------------------------------------------------

def test_haversine_matches_known_distance():
    # 0.001 degrees of latitude is ~111.2 m
    distance = haversine_m(12.9, 77.5, 12.901, 77.5)
    assert 110.0 < distance < 112.5


def test_missing_gps_stays_pending():
    result = assess_location(None, None, None, 100.0)
    assert result.status == "pending"
    assert result.latitude is None and result.longitude is None


def test_invalid_gps_rejected():
    assert assess_location(91.0, 10.0, None, 100.0).status == "invalid"
    assert assess_location(0.0, 0.0, None, 100.0).status == "invalid"
    assert assess_location(None, 77.5, None, 100.0).status == "invalid"


def test_low_accuracy_gps_needs_verification():
    result = assess_location(12.9, 77.5, 250.0, 100.0)
    assert result.status == "pending"
    assert "exceeds" in (result.reason or "")


# --- Descriptor / matcher ---------------------------------------------------

def test_identical_images_have_high_similarity():
    image = Image.open(io.BytesIO(asphalt_image(1)))
    a = build_descriptor(image).to_dict()
    b = build_descriptor(image).to_dict()
    assert cosine_similarity(a["vector"], b["vector"]) > 0.99


def test_different_images_have_lower_similarity():
    a = build_descriptor(Image.open(io.BytesIO(asphalt_image(1)))).to_dict()
    b = build_descriptor(Image.open(io.BytesIO(painted_image()))).to_dict()
    assert cosine_similarity(a["vector"], b["vector"]) < 0.9


def test_proximity_alone_cannot_match():
    gray = build_descriptor(Image.open(io.BytesIO(asphalt_image(1)))).to_dict()
    different = build_descriptor(Image.open(io.BytesIO(painted_image()))).to_dict()
    candidate = MatchCandidate("p1", 12.9, 77.5, 5.0, different, report_count=2)
    result = evaluate_candidates(12.9, 77.5, 5.0, gray, [candidate])
    assert result.decision != MATCH
    assert result.signals is not None
    assert result.signals.distance_m == pytest.approx(0.0, abs=0.01)


def test_matching_signals_agree_produces_match():
    descriptor = build_descriptor(Image.open(io.BytesIO(asphalt_image(2)))).to_dict()
    candidate = MatchCandidate("p1", 12.9, 77.5, 5.0, descriptor, report_count=1)
    result = evaluate_candidates(12.9001, 77.5001, 5.0, descriptor, [candidate])
    assert result.decision == MATCH
    assert result.best_pothole_id == "p1"


def test_no_candidates_returns_no_match():
    descriptor = build_descriptor(Image.open(io.BytesIO(asphalt_image(3)))).to_dict()
    result = evaluate_candidates(12.9, 77.5, 5.0, descriptor, [])
    assert result.decision == NO_MATCH
    assert result.best_pothole_id is None


def test_far_candidate_outside_radius_is_ignored():
    descriptor = build_descriptor(Image.open(io.BytesIO(asphalt_image(4)))).to_dict()
    candidate = MatchCandidate("p1", 13.9, 77.5, 5.0, descriptor, report_count=1)  # ~111 km away
    result = evaluate_candidates(12.9, 77.5, 5.0, descriptor, [candidate])
    assert result.decision == NO_MATCH
    assert result.candidates_considered == 0


# --- Report service ---------------------------------------------------------

def test_service_creates_canonical_record(temp_db):
    report, replay = create_report(
        temp_db,
        file_bytes=asphalt_image(10),
        original_filename="first.jpg",
        latitude=12.91,
        longitude=77.51,
        accuracy_m=8.0,
        captured_at=None,
        description="first observation",
        reporter_id="tester",
        idempotency_key=str(uuid.uuid4()),
    )
    assert replay is False
    assert report.pothole_id is not None
    assert report.match_decision == NO_MATCH
    pothole = temp_db.query(Pothole).filter(Pothole.id == report.pothole_id).first()
    assert pothole is not None and pothole.report_count == 1
    for path in settings.EVIDENCE_DIR.glob(f"{report.id}.*"):
        path.unlink(missing_ok=True)


def test_service_attaches_duplicate(temp_db):
    key = str(uuid.uuid4())
    first, _ = create_report(
        temp_db,
        file_bytes=asphalt_image(11),
        original_filename="first.jpg",
        latitude=12.92,
        longitude=77.52,
        accuracy_m=5.0,
        captured_at=None,
        description=None,
        reporter_id=None,
        idempotency_key=key,
    )
    second, replay = create_report(
        temp_db,
        file_bytes=asphalt_image(11),
        original_filename="second.jpg",
        latitude=12.92005,
        longitude=77.52005,
        accuracy_m=5.0,
        captured_at=None,
        description=None,
        reporter_id=None,
        idempotency_key=str(uuid.uuid4()),
    )
    assert replay is False
    assert second.match_decision == MATCH
    assert second.pothole_id == first.pothole_id
    pothole = temp_db.query(Pothole).filter(Pothole.id == first.pothole_id).first()
    assert pothole.report_count == 2
    for report_id in (first.id, second.id):
        for path in settings.EVIDENCE_DIR.glob(f"{report_id}.*"):
            path.unlink(missing_ok=True)


def test_service_does_not_merge_different_images(temp_db):
    first, _ = create_report(
        temp_db,
        file_bytes=asphalt_image(12),
        original_filename="a.jpg",
        latitude=12.93,
        longitude=77.53,
        accuracy_m=5.0,
        captured_at=None,
        description=None,
        reporter_id=None,
        idempotency_key=str(uuid.uuid4()),
    )
    second, _ = create_report(
        temp_db,
        file_bytes=painted_image(),
        original_filename="b.jpg",
        latitude=12.93,
        longitude=77.53,
        accuracy_m=5.0,
        captured_at=None,
        description=None,
        reporter_id=None,
        idempotency_key=str(uuid.uuid4()),
    )
    assert second.match_decision != MATCH
    assert second.pothole_id != first.pothole_id
    for report_id in (first.id, second.id):
        for path in settings.EVIDENCE_DIR.glob(f"{report_id}.*"):
            path.unlink(missing_ok=True)


def test_service_is_idempotent(temp_db):
    key = str(uuid.uuid4())
    first, replay1 = create_report(
        temp_db,
        file_bytes=asphalt_image(13),
        original_filename="a.jpg",
        latitude=12.94,
        longitude=77.54,
        accuracy_m=5.0,
        captured_at=None,
        description=None,
        reporter_id=None,
        idempotency_key=key,
    )
    second, replay2 = create_report(
        temp_db,
        file_bytes=asphalt_image(13),
        original_filename="a.jpg",
        latitude=12.94,
        longitude=77.54,
        accuracy_m=5.0,
        captured_at=None,
        description=None,
        reporter_id=None,
        idempotency_key=key,
    )
    assert replay1 is False and replay2 is True
    assert first.id == second.id
    for path in settings.EVIDENCE_DIR.glob(f"{first.id}.*"):
        path.unlink(missing_ok=True)


def test_relocate_pending_report(temp_db):
    report, _ = create_report(
        temp_db,
        file_bytes=asphalt_image(14),
        original_filename="nopgs.jpg",
        latitude=None,
        longitude=None,
        accuracy_m=None,
        captured_at=None,
        description="photo taken without GPS",
        reporter_id=None,
        idempotency_key=str(uuid.uuid4()),
    )
    assert report.status == "pending_location_verification"
    assert report.pothole_id is None

    updated = relocate_report(temp_db, report, 12.95, 77.55, 6.0)
    assert updated.location_status == "verified"
    assert updated.pothole_id is not None
    for path in settings.EVIDENCE_DIR.glob(f"{report.id}.*"):
        path.unlink(missing_ok=True)


# --- HTTP -------------------------------------------------------------------

def test_report_endpoint_requires_auth():
    res = client.post(
        "/api/v1/pothole-reports",
        files={"file": ("a.jpg", asphalt_image(20), "image/jpeg")},
    )
    assert res.status_code == 401


def test_report_without_gps_is_pending(cleanup_potholes):
    reports, potholes = cleanup_potholes
    res = client.post(
        "/api/v1/pothole-reports",
        files={"file": ("a.jpg", asphalt_image(21), "image/jpeg")},
        data={"description": "no gps available"},
        headers=AUTH_HEADERS,
    )
    assert res.status_code == 201, res.text
    body = res.json()
    reports.append(body["report_id"])
    assert body["status"] == "pending_location_verification"
    assert body["pothole_id"] is None
    assert body["location"]["latitude"] is None
    assert body["match"]["decision"] == "SKIPPED"

    evidence_url = body["evidence"][0]["url"]
    evidence = client.get(evidence_url, headers=AUTH_HEADERS)
    assert evidence.status_code == 200
    assert evidence.headers["content-type"] == "image/jpeg"


def test_report_idempotency_over_http(cleanup_potholes):
    reports, _ = cleanup_potholes
    key = f"test-{uuid.uuid4()}"
    payload = {"description": "idempotent"}

    first = client.post(
        "/api/v1/pothole-reports",
        files={"file": ("idem.jpg", asphalt_image(22), "image/jpeg")},
        data=payload,
        headers={**AUTH_HEADERS, "Idempotency-Key": key},
    )
    assert first.status_code == 201
    reports.append(first.json()["report_id"])

    second = client.post(
        "/api/v1/pothole-reports",
        files={"file": ("idem.jpg", asphalt_image(22), "image/jpeg")},
        data=payload,
        headers={**AUTH_HEADERS, "Idempotency-Key": key},
    )
    assert second.status_code == 200
    assert second.json()["idempotent_replay"] is True
    assert second.json()["report_id"] == first.json()["report_id"]


def test_duplicate_reports_share_pothole_over_http(cleanup_potholes):
    reports, potholes = cleanup_potholes
    lat, lon = 13.01, 77.61

    def submit(image_bytes: bytes, name: str):
        res = client.post(
            "/api/v1/pothole-reports",
            files={"file": (name, image_bytes, "image/jpeg")},
            data={"latitude": str(lat), "longitude": str(lon), "accuracy_m": "5"},
            headers=AUTH_HEADERS,
        )
        assert res.status_code == 201, res.text
        reports.append(res.json()["report_id"])
        return res.json()

    first = submit(asphalt_image(23), "one.jpg")
    second = submit(asphalt_image(23), "two.jpg")

    assert first["match"]["decision"] == NO_MATCH
    assert second["match"]["decision"] == MATCH
    assert second["pothole_id"] == first["pothole_id"]
    potholes.append(first["pothole_id"])

    detail = client.get(f"/api/v1/potholes/{first['pothole_id']}", headers=AUTH_HEADERS)
    assert detail.status_code == 200
    assert detail.json()["report_count"] == 2
    assert len(detail.json()["reports"]) == 2

    listed = client.get("/api/v1/potholes", headers=AUTH_HEADERS)
    assert listed.status_code == 200
    assert any(item["pothole_id"] == first["pothole_id"] for item in listed.json()["items"])


def test_status_transition_rules(cleanup_potholes):
    reports, potholes = cleanup_potholes
    res = client.post(
        "/api/v1/pothole-reports",
        files={"file": ("s.jpg", asphalt_image(24), "image/jpeg")},
        data={"latitude": "13.02", "longitude": "77.62"},
        headers=AUTH_HEADERS,
    )
    assert res.status_code == 201
    body = res.json()
    reports.append(body["report_id"])
    pothole_id = body["pothole_id"]
    potholes.append(pothole_id)

    invalid = client.post(
        f"/api/v1/potholes/{pothole_id}/status",
        json={"status": "closed"},
        headers=AUTH_HEADERS,
    )
    assert invalid.status_code == 409

    valid = client.post(
        f"/api/v1/potholes/{pothole_id}/status",
        json={"status": "verified", "reason": "field confirmation", "actor": "inspector"},
        headers=AUTH_HEADERS,
    )
    assert valid.status_code == 200
    assert valid.json()["status"] == "verified"
    assert valid.json()["status_history"][-1]["to"] == "verified"
