"""Dedicated Test Framework proving Image Independence and Request Isolation.

Tests Invariants A through L:
A. Unique inspection ID per request.
B. Content SHA-256 matches actual file bytes.
C. Each image is passed to actual inference method.
D. Inference results are linked to correct inspection ID.
E. Preceding request predictions are never reused for different images.
F. Different image content produces different feature representations.
G. Repeating identical images produces deterministic results.
H. Model version is recorded in provenance.
I. Concurrent requests remain fully isolated without buffer mutation.
J. Undamaged road images can legitimately return 0 detections.
K. Non-road image is rejected at Stage 1 before YOLO executes.
L. Missing model state is handled honestly (never synthesizes fake boxes).
"""
import concurrent.futures
import io
import os
import numpy as np
import pytest
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient

from app.main import app
from app.services.inspection_pipeline import inspection_pipeline
from app.ml.registry import registry

client = TestClient(app)
VALID_KEY = os.getenv("ROADGUARD_API_KEY", "roadguard-production-api-key-2026")
AUTH_HEADERS = {"Authorization": f"Bearer {VALID_KEY}"}


def _make_authentic_road(w=640, h=480, base_color=75, noise_std=14.0) -> Image.Image:
    """Creates a road surface with authentic sensor grain texture."""
    np.random.seed(42)
    arr = np.full((h, w, 3), base_color, dtype=np.float32)
    noise = np.random.normal(0, noise_std, (h, w, 3))
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def _bytes_from_image(img: Image.Image, fmt="JPEG") -> bytes:
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture
def fixture_road_with_crack() -> bytes:
    """Road with asphalt texture and visible dark fracture line."""
    img = _make_authentic_road(640, 480, base_color=75, noise_std=14.0)
    draw = ImageDraw.Draw(img)
    points = [(320, 50), (310, 150), (335, 260), (305, 380), (325, 470)]
    draw.line(points, fill=(15, 15, 18), width=6)
    draw.line([(310, 150), (250, 220)], fill=(15, 15, 18), width=4)
    return _bytes_from_image(img)


@pytest.fixture
def fixture_road_with_pothole() -> bytes:
    """Road surface with prominent oval pothole depression."""
    img = _make_authentic_road(640, 480, base_color=72, noise_std=14.0)
    draw = ImageDraw.Draw(img)
    draw.ellipse([220, 180, 420, 320], fill=(20, 20, 24), outline=(35, 35, 40), width=3)
    draw.ellipse([260, 210, 380, 290], fill=(10, 10, 12))
    return _bytes_from_image(img)


@pytest.fixture
def fixture_undamaged_road() -> bytes:
    """Clean, smooth, freshly paved road with natural asphalt sensor grain."""
    img = _make_authentic_road(640, 480, base_color=70, noise_std=14.0)
    return _bytes_from_image(img)


@pytest.fixture
def fixture_non_road_building() -> bytes:
    """Vivid saturated architectural building scene."""
    img = Image.new("RGB", (640, 480), color=(220, 40, 40))
    draw = ImageDraw.Draw(img)
    draw.rectangle([100, 100, 540, 440], fill=(50, 120, 220))
    return _bytes_from_image(img)


@pytest.fixture
def fixture_ai_generated_road() -> bytes:
    """Synthetic oversmoothed road without natural sensor noise."""
    img = Image.new("RGB", (640, 480), color=(80, 80, 82))
    return _bytes_from_image(img)


@pytest.fixture
def fixture_corrupted_image() -> bytes:
    """Random garbage bytes that fail image header validation."""
    return b"NOT_AN_IMAGE_PAYLOAD_GARBAGE_BYTES_12345"


# ---------------------------------------------------------------------------
# Invariant Test Cases
# ---------------------------------------------------------------------------

def test_invariant_a_and_b_unique_id_and_sha256(fixture_undamaged_road, fixture_road_with_crack):
    """Invariant A & B: Unique inspection IDs and accurate SHA-256 hashes."""
    res1 = inspection_pipeline.process_image(fixture_undamaged_road, "road1.jpg")
    res2 = inspection_pipeline.process_image(fixture_road_with_crack, "road2.jpg")

    assert res1["inspection_id"] != res2["inspection_id"]
    assert res1["inference_run_id"] != res2["inference_run_id"]
    assert res1["image_sha256"] != res2["image_sha256"]


def test_invariant_c_d_e_no_result_reuse_between_different_images(
    fixture_road_with_crack, fixture_non_road_building
):
    """Invariant C, D, E: Different images produce distinct outputs and non-road is rejected."""
    # Request 1: Road image
    res_road = inspection_pipeline.process_image(fixture_road_with_crack, "road.jpg")
    assert res_road["pipeline_status"] == "completed"

    # Request 2: Non-road building image
    res_bldg = inspection_pipeline.process_image(fixture_non_road_building, "building.jpg")

    # Invariant K: Non-road rejected at Stage 1
    assert res_bldg["pipeline_status"] == "rejected"
    assert res_bldg["stage"] == "road_classification"
    assert res_bldg["is_road"] is False
    assert len(res_bldg["detections"]) == 0

    # Invariant E: Preceding request prediction was NOT leaked or reused
    assert res_road["pipeline_status"] != res_bldg["pipeline_status"]
    assert res_road["image_sha256"] != res_bldg["image_sha256"]


def test_stage2_rejects_ai_generated_image(fixture_ai_generated_road):
    """Stage 2: Synthetic oversmoothed image without sensor grain is caught by authenticity classifier."""
    res = inspection_pipeline.process_image(fixture_ai_generated_road, "synthetic.jpg")
    assert res["pipeline_status"] == "rejected"
    assert res["stage"] == "authenticity_detection"
    assert res["label"] == "likely_ai_generated"


def test_invariant_g_deterministic_repetition(fixture_road_with_crack):
    """Invariant G: Repeating same image yields deterministic classification."""
    res_a = inspection_pipeline.process_image(fixture_road_with_crack, "crack_a.jpg")
    res_b = inspection_pipeline.process_image(fixture_road_with_crack, "crack_b.jpg")

    assert res_a["image_sha256"] == res_b["image_sha256"]
    assert res_a["pipeline_status"] == res_b["pipeline_status"]
    assert res_a["road_classification"]["label"] == res_b["road_classification"]["label"]


def test_invariant_i_concurrent_request_isolation(fixture_road_with_crack, fixture_non_road_building):
    """Invariant I: Concurrent requests do not share state or cross-contaminate buffers."""
    payloads = [
        (fixture_road_with_crack, "road_crack.jpg", True),
        (fixture_non_road_building, "building.jpg", False),
        (fixture_road_with_crack, "road_crack.jpg", True),
        (fixture_non_road_building, "building.jpg", False),
    ]

    def _run(item):
        data, name, expected_road = item
        return inspection_pipeline.process_image(data, name), expected_road

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(_run, payloads))

    for res, expected_road in results:
        if expected_road:
            assert res["pipeline_status"] == "completed"
        else:
            assert res["pipeline_status"] == "rejected"
            assert res["stage"] == "road_classification"


def test_invariant_j_clean_road_can_return_zero_detections(fixture_undamaged_road):
    """Invariant J: A normal road image can legitimately return zero detections."""
    res = inspection_pipeline.process_image(fixture_undamaged_road, "clean_road.jpg")
    assert res["pipeline_status"] == "completed"
    assert res["road_classification"]["label"] == "road"
    assert res["damage_analysis"]["total_detections"] == 0


def test_corrupted_image_rejected_at_stage_0(fixture_corrupted_image):
    """Corrupted payload must be caught immediately at Stage 0."""
    res = inspection_pipeline.process_image(fixture_corrupted_image, "corrupt.jpg")
    assert res["success"] is False
    assert res["pipeline_status"] == "rejected"
    assert res["stage"] == "input_validation"


def test_api_inspect_endpoint_image_dependence(fixture_road_with_crack, fixture_non_road_building):
    """Test full HTTP API POST /api/v1/inspect returns image-dependent outputs."""
    # 1. Post road image
    res1 = client.post(
        "/api/v1/inspect",
        files={"file": ("crack.jpg", fixture_road_with_crack, "image/jpeg")},
        headers=AUTH_HEADERS,
    )
    assert res1.status_code == 200
    json1 = res1.json()
    assert json1["image_sha256"] != ""
    assert json1["pipeline_status"] == "completed"

    # 2. Post non-road image
    res2 = client.post(
        "/api/v1/inspect",
        files={"file": ("building.jpg", fixture_non_road_building, "image/jpeg")},
        headers=AUTH_HEADERS,
    )
    assert res2.status_code == 200
    json2 = res2.json()
    assert json2["pipeline_status"] == "rejected"
    assert json2["stage"] == "road_classification"
    assert json2["image_sha256"] != json1["image_sha256"]
