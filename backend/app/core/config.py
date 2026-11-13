"""Application configuration loaded from environment variables and an optional .env file.

Secrets are never defaulted. The API fails closed when the machine-to-machine key is unset.
"""
from __future__ import annotations

import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent.parent


def _load_env_file() -> None:
    """Minimal .env loader. Real environment variables keep precedence."""
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


_load_env_file()


def _env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("true", "1", "yes", "on")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if raw is None:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


class Settings:
    APP_NAME: str = "PitScout"
    APP_VERSION: str = "1.1.0"
    DEBUG: bool = _env_bool("DEBUG", False)
    BASE_DIR: Path = BASE_DIR

    # Authentication — no default. Empty means the API is misconfigured.
    API_KEY: str = os.getenv("ROADGUARD_API_KEY", "").strip()

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR}/roadguard.db")

    # Storage
    STORAGE_DIR: Path = BASE_DIR / "storage"
    UPLOADS_DIR: Path = BASE_DIR / "storage" / "uploads"
    ANNOTATED_DIR: Path = BASE_DIR / "storage" / "annotated"
    REPORTS_DIR: Path = BASE_DIR / "storage" / "reports"
    VIDEO_DIR: Path = BASE_DIR / "storage" / "videos"
    KEYFRAMES_DIR: Path = BASE_DIR / "storage" / "keyframes"
    EVIDENCE_DIR: Path = BASE_DIR / "storage" / "evidence"

    # Models
    MODELS_DIR: Path = BASE_DIR.parent / "models"
    DETECTION_MODEL_PATH: Path = BASE_DIR.parent / "models" / "detection" / "best.pt"
    AUTHENTICITY_MODEL_PATH: Path = BASE_DIR.parent / "models" / "authenticity" / "best.pt"
    ROAD_CLASSIFIER_PATH: Path = BASE_DIR.parent / "models" / "road_classifier" / "best.pt"

    # Detection provider: "yolo" (local weights) or "hf-inference" (remote API).
    DETECTION_PROVIDER: str = os.getenv("DETECTION_PROVIDER", "yolo").strip().lower()
    HF_TOKEN: str = os.getenv("HF_TOKEN", "").strip()
    HF_DETECTION_MODEL_ID: str = os.getenv("HF_DETECTION_MODEL_ID", "facebook/detr-resnet-50").strip()

    @property
    def DETECTION_READY(self) -> bool:
        if self.DETECTION_PROVIDER == "hf-inference":
            return bool(self.HF_TOKEN and self.HF_DETECTION_MODEL_ID)
        return self.DETECTION_MODEL_PATH.exists()

    # Upload limits
    MAX_FILE_SIZE_MB: int = _env_int("MAX_FILE_SIZE_MB", 50)
    MAX_VIDEO_SIZE_MB: int = _env_int("MAX_VIDEO_SIZE_MB", 200)
    MIN_IMAGE_DIMENSION: int = _env_int("MIN_IMAGE_DIMENSION", 64)
    MAX_IMAGE_DIMENSION: int = _env_int("MAX_IMAGE_DIMENSION", 8192)
    MAX_IMAGE_PIXELS: int = _env_int("MAX_IMAGE_PIXELS", 178956970)
    ALLOWED_EXTENSIONS: set[str] = {".jpg", ".jpeg", ".png", ".webp"}
    ALLOWED_VIDEO_EXTENSIONS: set[str] = {".mp4", ".mov", ".avi", ".webm", ".mkv", ".m4v"}

    # CORS — explicit allow-list only
    ALLOWED_ORIGINS: list[str] = _env_list(
        "ALLOWED_ORIGINS",
        ["http://localhost:3000", "http://127.0.0.1:3000"],
    )

    # Rate limiting (in-process; replace with Redis for multi-instance deployments)
    RATE_LIMIT_ENABLED: bool = _env_bool("RATE_LIMIT_ENABLED", True)
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = _env_int("RATE_LIMIT_REQUESTS_PER_MINUTE", 60)

    # Image thresholds
    ROAD_CONFIDENCE_THRESHOLD: float = _env_float("ROAD_CONFIDENCE_THRESHOLD", 0.50)
    AUTHENTICITY_UNCERTAIN_LOW: float = _env_float("AUTHENTICITY_UNCERTAIN_LOW", 0.40)
    AUTHENTICITY_UNCERTAIN_HIGH: float = _env_float("AUTHENTICITY_UNCERTAIN_HIGH", 0.65)
    DETECTION_CONFIDENCE_THRESHOLD: float = _env_float("DETECTION_CONFIDENCE_THRESHOLD", 0.15)
    DETECTION_IOU_THRESHOLD: float = _env_float("DETECTION_IOU_THRESHOLD", 0.45)

    CLASS_CONFIDENCE_THRESHOLDS: dict = {
        "pothole": 0.15,
        "manhole_cover": 0.15,
        "sewage_hole": 0.15,
        "longitudinal_crack": 0.14,
        "transverse_crack": 0.14,
        "alligator_crack": 0.14,
    }

    SEVERITY_HIGH_AREA_RATIO: float = _env_float("SEVERITY_HIGH_AREA_RATIO", 0.05)
    SEVERITY_CRITICAL_AREA_RATIO: float = _env_float("SEVERITY_CRITICAL_AREA_RATIO", 0.15)

    # Video processing
    VIDEO_SAMPLE_FPS: float = _env_float("VIDEO_SAMPLE_FPS", 2.0)
    VIDEO_MAX_SAMPLED_FRAMES: int = _env_int("VIDEO_MAX_SAMPLED_FRAMES", 300)
    TRACK_IOU_THRESHOLD: float = _env_float("TRACK_IOU_THRESHOLD", 0.30)
    TRACK_MAX_CENTROID_RATIO: float = _env_float("TRACK_MAX_CENTROID_RATIO", 0.12)
    TRACK_MAX_AGE_FRAMES: int = _env_int("TRACK_MAX_AGE_FRAMES", 4)
    TRACK_MIN_HITS: int = _env_int("TRACK_MIN_HITS", 2)

    # Geolocation
    LOCATION_MAX_ACCURACY_M: float = _env_float("LOCATION_MAX_ACCURACY_M", 100.0)

    # Duplicate matching (meters and 0..1 scores)
    MATCH_BASE_RADIUS_M: float = _env_float("MATCH_BASE_RADIUS_M", 50.0)
    MATCH_MIN_RADIUS_M: float = _env_float("MATCH_MIN_RADIUS_M", 15.0)
    MATCH_MAX_RADIUS_M: float = _env_float("MATCH_MAX_RADIUS_M", 250.0)
    MATCH_THRESHOLD: float = _env_float("MATCH_THRESHOLD", 0.72)
    MATCH_REVIEW_THRESHOLD: float = _env_float("MATCH_REVIEW_THRESHOLD", 0.55)
    MATCH_MIN_VISUAL_SIMILARITY: float = _env_float("MATCH_MIN_VISUAL_SIMILARITY", 0.55)
    MATCH_WEIGHT_DISTANCE: float = _env_float("MATCH_WEIGHT_DISTANCE", 0.45)
    MATCH_WEIGHT_VISUAL: float = _env_float("MATCH_WEIGHT_VISUAL", 0.40)
    MATCH_WEIGHT_SHAPE: float = _env_float("MATCH_WEIGHT_SHAPE", 0.15)


settings = Settings()
