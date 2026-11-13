"""Video pipeline and tracker tests (no model weights required)."""
from __future__ import annotations

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.database.session import init_db
from app.main import app
from app.ml.registry import registry
from app.services.tracking import IouCentroidTracker, TrackedDetection, centroid, iou
from app.services.video_pipeline import process_video

init_db()
client = TestClient(app)
AUTH_HEADERS = {"X-API-Key": settings.API_KEY}


class FakeRoadClassifier:
    def __init__(self, is_road: bool = True) -> None:
        self.is_road = is_road

    def predict(self, image, **kwargs):
        return {
            "is_road": self.is_road,
            "label": "road" if self.is_road else "non_road",
            "confidence": 0.9,
            "model_version": "fake-road",
        }

    def version(self):
        return "fake-road"


class FakeAuthenticity:
    def predict(self, image, **kwargs):
        return {"label": "likely_real", "confidence": 0.8, "model_version": "fake-auth"}

    def version(self):
        return "fake-auth"


class FakeFilter:
    def predict(self, image, **kwargs):
        return {"is_valid": True, "filter_version": "fake-filter"}

    def version(self):
        return "fake-filter"


class FakeDetector:
    """Always reports one pothole at a fixed location."""

    def __init__(self) -> None:
        self.calls = 0

    def is_ready(self) -> bool:
        return True

    def version(self) -> str:
        return "fake-detector"

    def predict(self, image, **kwargs):
        self.calls += 1
        return {
            "model_ready": True,
            "model_version": "fake-detector",
            "detections": [
                {
                    "class": "pothole",
                    "class_id": 0,
                    "confidence": 0.8,
                    "bbox": [200, 200, 340, 320],
                    "width": 140,
                    "height": 120,
                    "area": 16800,
                }
            ],
        }


@pytest.fixture
def fake_registry(monkeypatch):
    detector = FakeDetector()
    monkeypatch.setattr(registry, "_road_classifier", FakeRoadClassifier())
    monkeypatch.setattr(registry, "_authenticity_classifier", FakeAuthenticity())
    monkeypatch.setattr(registry, "_false_positive_filter", FakeFilter())
    monkeypatch.setattr(registry, "_damage_detector", detector)
    return detector


@pytest.fixture
def sample_video(tmp_path):
    path = tmp_path / "road_sample.avi"
    writer = cv2.VideoWriter(
        str(path), cv2.VideoWriter_fourcc(*"MJPG"), 10.0, (640, 480)
    )
    assert writer.isOpened(), "OpenCV could not create the test video"
    for _ in range(20):
        frame = np.full((480, 640, 3), 110, dtype=np.uint8)
        writer.write(frame)
    writer.release()
    return path


# --- Tracker unit tests -----------------------------------------------------

def test_iou_and_centroid():
    assert iou((0, 0, 10, 10), (0, 0, 10, 10)) == pytest.approx(1.0)
    assert iou((0, 0, 10, 10), (20, 20, 30, 30)) == 0.0
    assert centroid((0, 0, 10, 20)) == (5.0, 10.0)


def test_tracker_keeps_identity_across_frames():
    tracker = IouCentroidTracker(iou_threshold=0.3, max_age_frames=2, frame_diagonal=800.0)
    for step in range(4):
        tracker.update(
            [TrackedDetection(bbox=(100 + step, 100, 200 + step, 200), confidence=0.7, class_name="pothole")],
            step,
        )
    confirmed = tracker.confirmed_tracks(min_hits=2)
    assert len(confirmed) == 1
    assert confirmed[0].hits == 4
    assert confirmed[0].first_frame == 0
    assert confirmed[0].last_frame == 3


def test_tracker_separates_classes():
    tracker = IouCentroidTracker(iou_threshold=0.3, max_age_frames=2, frame_diagonal=800.0)
    tracker.update(
        [
            TrackedDetection(bbox=(100, 100, 200, 200), confidence=0.7, class_name="pothole"),
            TrackedDetection(bbox=(100, 100, 200, 200), confidence=0.7, class_name="alligator_crack"),
        ],
        0,
    )
    tracker.update(
        [
            TrackedDetection(bbox=(100, 100, 200, 200), confidence=0.7, class_name="pothole"),
            TrackedDetection(bbox=(100, 100, 200, 200), confidence=0.7, class_name="alligator_crack"),
        ],
        1,
    )
    assert len(tracker.confirmed_tracks(min_hits=2)) == 2


def test_tracker_retains_finished_tracks():
    tracker = IouCentroidTracker(iou_threshold=0.3, max_age_frames=1, frame_diagonal=800.0)
    tracker.update([TrackedDetection(bbox=(10, 10, 60, 60), confidence=0.6, class_name="pothole")], 0)
    tracker.update([], 5)  # ages out
    assert tracker.tracks == {}
    assert len(tracker.finished) == 1


# --- Pipeline tests ---------------------------------------------------------

def test_video_pipeline_produces_tracked_defect(fake_registry, sample_video, tmp_path):
    result = process_video("vid-test-1", sample_video, "road_sample.avi")

    assert result["status"] == "completed"
    assert result["video"]["sampled_frames"] > 1
    assert result["summary"]["unique_defects"] == 1
    assert result["summary"]["by_class"] == {"pothole": 1}
    track = result["tracks"][0]
    assert track["frames_seen"] > 1
    assert track["severity"]["level"] in ("LOW", "MODERATE", "HIGH", "CRITICAL")
    assert result["limitations"]

    keyframes = list(settings.KEYFRAMES_DIR.glob("vid-test-1_*.jpg"))
    assert keyframes, "expected a saved keyframe for the tracked defect"
    for path in keyframes:
        path.unlink()


def test_video_pipeline_rejects_non_road(monkeypatch, sample_video):
    monkeypatch.setattr(registry, "_road_classifier", FakeRoadClassifier(is_road=False))
    monkeypatch.setattr(registry, "_authenticity_classifier", FakeAuthenticity())
    monkeypatch.setattr(registry, "_false_positive_filter", FakeFilter())
    monkeypatch.setattr(registry, "_damage_detector", FakeDetector())

    from app.services.video_pipeline import VideoProcessingError

    with pytest.raises(VideoProcessingError) as excinfo:
        process_video("vid-test-2", sample_video, "non_road.avi")
    assert excinfo.value.status == "rejected"


# --- HTTP tests -------------------------------------------------------------

def test_video_upload_rejects_wrong_signature():
    res = client.post(
        "/api/v1/videos/analyze",
        files={"file": ("clip.mp4", b"not really a video", "video/mp4")},
        headers=AUTH_HEADERS,
    )
    assert res.status_code == 422


def test_video_upload_requires_auth(sample_video):
    with sample_video.open("rb") as handle:
        res = client.post(
            "/api/v1/videos/analyze",
            files={"file": ("clip.avi", handle.read(), "video/x-msvideo")},
        )
    assert res.status_code == 401


def test_video_end_to_end(fake_registry, sample_video):
    with sample_video.open("rb") as handle:
        payload = handle.read()
    res = client.post(
        "/api/v1/videos/analyze",
        files={"file": ("clip.avi", payload, "video/x-msvideo")},
        headers=AUTH_HEADERS,
    )
    assert res.status_code == 202
    video_id = res.json()["video_id"]

    status = client.get(f"/api/v1/videos/{video_id}", headers=AUTH_HEADERS)
    assert status.status_code == 200
    body = status.json()
    assert body["status"] == "completed", body
    assert body["progress"] == 100

    result = client.get(f"/api/v1/videos/{video_id}/result", headers=AUTH_HEADERS)
    assert result.status_code == 200
    data = result.json()
    assert data["summary"]["unique_defects"] == 1

    track_id = data["tracks"][0]["track_id"]
    keyframe = client.get(f"/api/v1/videos/{video_id}/keyframes/{track_id}", headers=AUTH_HEADERS)
    assert keyframe.status_code == 200
    assert keyframe.headers["content-type"] == "image/jpeg"

    missing = client.get(f"/api/v1/videos/{video_id}/keyframes/99999", headers=AUTH_HEADERS)
    assert missing.status_code == 404

    deleted = client.delete(f"/api/v1/videos/{video_id}", headers=AUTH_HEADERS)
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/videos/{video_id}", headers=AUTH_HEADERS).status_code == 404
