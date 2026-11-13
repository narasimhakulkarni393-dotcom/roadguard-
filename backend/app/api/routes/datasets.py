"""Dataset inspection routes.

Only read-only inspection is implemented. Preparation runs offline through
training/prepare_kaggle_dataset.py; the HTTP endpoint says so instead of
pretending a job started.
"""
from __future__ import annotations

import json
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
    rdd_raw = DATASET_ROOT / "raw" / "rdd2022"
    rdd_processed = DATASET_ROOT / "processed" / "rdd2022"
    rdd_raw_count = _count_files(rdd_raw)
    rdd_processed_count = _count_files(rdd_processed)

    datasets = [
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
            "status": "ready" if rdd_processed_count > 0 else "unprepared",
            "raw_files": rdd_raw_count,
            "processed_files": rdd_processed_count,
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
    ]

    kaggle_dir = DATASET_ROOT / "processed" / "kaggle_road_damage"
    manifest_path = kaggle_dir / "manifest.json"
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Could not read dataset manifest %s: %s", manifest_path, exc)
            manifest = None
        if manifest:
            splits = manifest.get("splits", {})
            processed = sum(int(split.get("images", 0)) for split in splits.values())
            class_names: list[str] = []
            for split in splits.values():
                for name in split.get("instances", {}):
                    if name not in class_names:
                        class_names.append(name)
            datasets.insert(
                0,
                {
                    "id": "kaggle_road_damage",
                    "name": "Kaggle Road Damage — Potholes, Cracks and Manholes",
                    "source": f"https://www.kaggle.com/datasets/{manifest.get('dataset', '')}",
                    "licence": manifest.get("license", "Not declared"),
                    "citation": manifest.get("citation"),
                    "classes": class_names,
                    "status": "ready" if processed > 0 else "unprepared",
                    "raw_files": 0,
                    "processed_files": processed,
                    "split_counts": {name: int(split.get("images", 0)) for name, split in splits.items()},
                    "prepared_at": manifest.get("prepared_at"),
                    "resolved_version": manifest.get("resolved_version"),
                },
            )

    return {
        "datasets": datasets,
        "summary": {
            "total_raw_files": sum(item["raw_files"] for item in datasets),
            "total_processed_files": sum(item["processed_files"] for item in datasets),
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
            "Dataset preparation is not exposed over HTTP. Run it offline with "
            "`python -m training.prepare_kaggle_dataset` (Kaggle road-damage corpus) or "
            "`python -m ml.datasets.convert_voc_to_yolo` (RDD2022), then reload this page."
        ),
    )
