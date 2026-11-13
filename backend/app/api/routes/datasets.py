"""Dataset inspection routes.

Only read-only inspection is implemented. Conversion/prepare workflows are
declared unsupported instead of returning a canned success payload.
"""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from PIL import Image
from pydantic import BaseModel

from app.core.auth import verify_api_key
from app.core.config import settings

logger = logging.getLogger("pitscout.routes.datasets")
router = APIRouter(
    prefix="/api/v1/datasets",
    tags=["datasets"],
    dependencies=[Depends(verify_api_key)],
)

DATASET_ROOT = settings.BASE_DIR.parent / "datasets"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


class DatasetActionRequest(BaseModel):
    dataset_name: str = "rdd2022"
    source_path: str = "datasets/raw/rdd2022"


def _count_files(directory: Path) -> int:
    if not directory.exists():
        return 0
    return sum(1 for p in directory.rglob("*") if p.is_file())


@router.get("/status")
@router.get("")
async def dataset_status():
    raw_dir = DATASET_ROOT / "raw"
    processed_dir = DATASET_ROOT / "processed"

    raw_count = _count_files(raw_dir)
    processed_count = _count_files(processed_dir)

    return {
        "datasets": [
            {
                "id": "rdd2022",
                "name": "Road Damage Dataset 2022 (RDD2022)",
                "source": "https://github.com/sekilab/RoadDamageDetector",
                "licence": "CC BY 4.0",
                "classes": [
                    "D00: Longitudinal Crack",
                    "D10: Transverse Crack",
                    "D20: Alligator Crack",
                    "D40: Pothole",
                ],
                "status": "ready" if processed_count > 0 else "unprepared",
                "raw_files": raw_count,
                "processed_files": processed_count,
            },
            {
                "id": "genimage",
                "name": "GenImage (AI-Generated Image Detection)",
                "source": "https://github.com/GenImage-Dataset/GenImage",
                "licence": "Research Use Only",
                "classes": ["nature", "ai_generated"],
                "status": "unprepared",
                "raw_files": 0,
                "processed_files": 0,
            },
        ],
        "summary": {
            "total_raw_files": raw_count,
            "total_processed_files": processed_count,
            "storage_path": str(DATASET_ROOT),
        },
    }


@router.post("/validate")
async def validate_dataset(req: DatasetActionRequest):
    """Decode every image under the declared source path and report failures."""
    source = (settings.BASE_DIR.parent / req.source_path).resolve()
    root = settings.BASE_DIR.parent.resolve()
    if root not in source.parents and source != root:
        raise HTTPException(status_code=400, detail="source_path must stay inside the project directory.")
    if not source.exists():
        return {
            "dataset_name": req.dataset_name,
            "valid": False,
            "checked_images": 0,
            "corrupted_images": 0,
            "message": f"Source path does not exist: {req.source_path}",
        }

    checked = 0
    corrupted: list[str] = []
    image_paths = [p for p in source.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES]
    for path in image_paths:
        checked += 1
        try:
            with Image.open(path) as img:
                img.verify()
        except Exception as exc:
            corrupted.append(f"{path.relative_to(source)}: {exc}")

    return {
        "dataset_name": req.dataset_name,
        "valid": checked > 0 and not corrupted,
        "checked_images": checked,
        "corrupted_images": len(corrupted),
        "corruption_details": corrupted[:20],
        "message": (
            f"Checked {checked} images; {len(corrupted)} failed to decode."
            if checked
            else "No images found at the declared source path."
        ),
    }


@router.post("/prepare")
async def prepare_dataset(req: DatasetActionRequest):
    raise HTTPException(
        status_code=501,
        detail=(
            "Dataset preparation (annotation conversion and train/val splits) is not implemented. "
            "Provide a YOLO-format dataset and a data.yaml instead."
        ),
    )
