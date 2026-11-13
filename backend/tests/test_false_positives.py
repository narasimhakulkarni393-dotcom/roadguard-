"""Test Stage 4 False-Positive Verification and hard-negative filtering."""
import pytest
from PIL import Image
from app.services.false_positive_filter import false_positive_filter


def test_filters_out_pebbles_and_gravel():
    """Microscopic bounding boxes (< 0.06% of image) must be filtered as gravel."""
    img = Image.new("RGB", (1280, 720), color=(120, 120, 120))
    # 5x5 bbox = 25 pixels in 921,600 area (~0.002%)
    bbox = (100, 100, 105, 105)
    decision = false_positive_filter.verify_candidate(img, bbox, "pothole", 0.65)
    assert decision.is_valid is False
    assert decision.detected_artifact == "pebble_gravel"


def test_filters_out_speed_breakers():
    """Wide horizontal ridges spanning across lanes must not be classified as defects."""
    img = Image.new("RGB", (1280, 720), color=(120, 120, 120))
    # Aspect ratio: width 600, height 30 = 20.0
    bbox = (100, 300, 700, 330)
    decision = false_positive_filter.verify_candidate(img, bbox, "pothole", 0.70)
    assert decision.is_valid is False
    assert decision.detected_artifact == "speed_breaker"


def test_filters_out_road_markings():
    """High-luminance white lane lines must not be classified as cracks."""
    img = Image.new("RGB", (1280, 720), color=(240, 240, 240))  # Bright white line
    bbox = (200, 100, 220, 500)
    decision = false_positive_filter.verify_candidate(img, bbox, "longitudinal_crack", 0.55)
    assert decision.is_valid is False
    assert decision.detected_artifact == "road_marking"


def test_filters_out_cast_shadows():
    """Uniform dark regions without texture breakdown must be filtered as cast shadows."""
    img = Image.new("RGB", (1280, 720), color=(30, 30, 30))  # Low brightness, flat
    bbox = (100, 100, 300, 300)
    decision = false_positive_filter.verify_candidate(img, bbox, "pothole", 0.45)
    assert decision.is_valid is False
    assert decision.detected_artifact == "shadow"


def test_accepts_valid_damage_region():
    """Pavement damage with realistic dimensions must be accepted."""
    # Create an image with moderate asphalt gray and localized variance
    img = Image.new("RGB", (1280, 720), color=(110, 110, 110))
    bbox = (200, 200, 450, 400)  # 250x200 bbox (~5.4% of image)
    decision = false_positive_filter.verify_candidate(img, bbox, "pothole", 0.85)
    assert decision.is_valid is True
