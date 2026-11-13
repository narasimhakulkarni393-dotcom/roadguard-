import os
from pathlib import Path

# Load .env file if present
_env_file = Path(__file__).resolve().parent.parent.parent / ".env"
if _env_file.exists():
    with open(_env_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings:
    APP_NAME: str = "RoadGuard AI"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "False").lower() in ("true", "1")
    BASE_DIR: Path = BASE_DIR

    # Authentication
    API_KEY: str = os.getenv("ROADGUARD_API_KEY", "roadguard-production-api-key-2026")

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR}/roadguard.db")

    # Storage
    STORAGE_DIR: Path = BASE_DIR / "storage"
    UPLOADS_DIR: Path = BASE_DIR / "storage" / "uploads"
    ANNOTATED_DIR: Path = BASE_DIR / "storage" / "annotated"
    REPORTS_DIR: Path = BASE_DIR / "storage" / "reports"

    # Models
    MODELS_DIR: Path = BASE_DIR.parent / "models"
    DETECTION_MODEL_PATH: Path = BASE_DIR.parent / "models" / "detection" / "best.pt"
    AUTHENTICITY_MODEL_PATH: Path = BASE_DIR.parent / "models" / "authenticity" / "best.pt"
    ROAD_CLASSIFIER_PATH: Path = BASE_DIR.parent / "models" / "road_classifier" / "best.pt"

    # Upload & Image Validation limits
    MAX_FILE_SIZE_MB: int = 50
    MIN_IMAGE_DIMENSION: int = 64
    MAX_IMAGE_DIMENSION: int = 8192
    MAX_IMAGE_PIXELS: int = 178956970  # Decompression bomb guard
    ALLOWED_EXTENSIONS: set = {".jpg", ".jpeg", ".png", ".webp"}

    # CORS
    CORS_ORIGINS: list = ["*"]

    # Thresholds
    ROAD_CONFIDENCE_THRESHOLD: float = 0.50
    AUTHENTICITY_UNCERTAIN_LOW: float = 0.40
    AUTHENTICITY_UNCERTAIN_HIGH: float = 0.65
    DETECTION_CONFIDENCE_THRESHOLD: float = 0.25
    DETECTION_IOU_THRESHOLD: float = 0.45

    # Class-specific detection thresholds to minimize false positives
    CLASS_CONFIDENCE_THRESHOLDS: dict = {
        "pothole": 0.35,
        "manhole_cover": 0.35,
        "sewage_hole": 0.35,
        "longitudinal_crack": 0.30,
        "transverse_crack": 0.30,
        "alligator_crack": 0.30,
    }

    # Severity thresholds
    SEVERITY_HIGH_AREA_RATIO: float = 0.05
    SEVERITY_CRITICAL_AREA_RATIO: float = 0.15


settings = Settings()
