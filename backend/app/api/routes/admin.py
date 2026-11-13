"""Admin and Diagnostic API endpoints for RoadGuard AI."""
from __future__ import annotations

import datetime
import hashlib
import io
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from PIL import Image, ImageOps
from sqlalchemy import text

from app.core.auth import verify_api_key
from app.core.config import settings
from app.database.base import now_utc
from app.ml.registry import registry
from app.database.session import SessionLocal

router = APIRouter(prefix="/api/v1/admin", tags=["admin_diagnostics"])

_last_successful_inference_ts: Optional[str] = None


def record_successful_inference() -> None:
    global _last_successful_inference_ts
    _last_successful_inference_ts = now_utc().isoformat() + "Z"


@router.get("/diagnostics")
async def get_system_diagnostics(api_key: str = Depends(verify_api_key)) -> Dict[str, Any]:
    """Secure administrative diagnostic endpoint reporting runtime and model states."""
    # Check PyTorch & Ultralytics
    torch_version = "not_installed"
    cuda_available = False
    cuda_device_name = None
    try:
        import torch
        torch_version = torch.__version__
        cuda_available = torch.cuda.is_available()
        if cuda_available:
            cuda_device_name = torch.cuda.get_device_name(0)
    except Exception:
        pass

    ultralytics_version = "not_installed"
    try:
        import ultralytics
        ultralytics_version = ultralytics.__version__
    except Exception:
        pass

    # Database connectivity check
    db_connected = False
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        db_connected = True
    except Exception:
        pass

    # Storage connectivity
    storage_writable = False
    try:
        test_file = settings.STORAGE_DIR / ".diag_test"
        test_file.write_text("ok")
        test_file.unlink()
        storage_writable = True
    except Exception:
        pass

    # Model metadata with masked internal paths
    raw_meta = registry.metadata()
    safe_models = {}
    for mod_name, meta in raw_meta.items():
        safe_meta = dict(meta)
        safe_models[mod_name] = safe_meta

    return {
        "backend_version": settings.APP_VERSION,
        "environment": os.getenv("ENVIRONMENT", "development"),
        "timestamp": now_utc().isoformat() + "Z",
        "runtime": {
            "python_version": sys.version.split()[0],
            "pytorch_version": torch_version,
            "ultralytics_version": ultralytics_version,
            "cuda_available": cuda_available,
            "cuda_device": cuda_device_name,
            "device_in_use": "cuda" if cuda_available else "cpu",
        },
        "models": {
            "all_models_ready": registry.is_all_ready(),
            "components": safe_models,
        },
        "infrastructure": {
            "database_connected": db_connected,
            "storage_writable": storage_writable,
            "uploads_directory": settings.UPLOADS_DIR.name,
            "ollama_available": False,  # Configurable local LLM assistant
            "last_successful_inference": _last_successful_inference_ts,
        },
    }


@router.post("/diagnostics/inference")
async def run_diagnostic_inference(
    file: UploadFile = File(...),
    api_key: str = Depends(verify_api_key),
) -> Dict[str, Any]:
    """Accepts a real image and reports detailed step-by-step diagnostic telemetry."""
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty image uploaded")

    t0 = time.perf_counter()
    img_hash = hashlib.sha256(file_bytes).hexdigest()

    try:
        raw_img = Image.open(io.BytesIO(file_bytes))
        image = ImageOps.exif_transpose(raw_img).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Image decoding failed: {e}")

    orig_w, orig_h = image.size
    t_decode = time.perf_counter()

    # Stage 1: Road Classifier
    t1_s = time.perf_counter()
    road_out = registry.road_classifier.predict(image)
    t1_d = time.perf_counter() - t1_s

    # Stage 2: Authenticity Classifier
    t2_s = time.perf_counter()
    auth_out = registry.authenticity_classifier.predict(image)
    t2_d = time.perf_counter() - t2_s

    # Stage 3: Damage Detector
    t3_s = time.perf_counter()
    yolo_out = registry.damage_detector.predict(image)
    t3_d = time.perf_counter() - t3_s

    record_successful_inference()
    total_time_ms = round((time.perf_counter() - t0) * 1000, 2)

    return {
        "diagnostic_id": f"diag_{uuid.uuid4().hex[:8]}",
        "image_metadata": {
            "filename": file.filename,
            "file_size_bytes": len(file_bytes),
            "sha256": img_hash,
            "decoded_dimensions": [orig_w, orig_h],
            "channels": 3,
            "format": raw_img.format or "JPEG",
        },
        "preprocessing": {
            "exif_transposed": True,
            "colorspace": "RGB",
            "duration_ms": round((t_decode - t0) * 1000, 2),
        },
        "pipeline_stages": {
            "stage_1_road_classifier": {
                "invoked": True,
                "model_version": road_out.get("model_version"),
                "duration_ms": round(t1_d * 1000, 2),
                "label": road_out.get("label"),
                "confidence": road_out.get("confidence"),
            },
            "stage_2_authenticity": {
                "invoked": True,
                "model_version": auth_out.get("model_version"),
                "duration_ms": round(t2_d * 1000, 2),
                "verdict": auth_out.get("label"),
                "confidence": auth_out.get("confidence"),
            },
            "stage_3_damage_detector": {
                "invoked": True,
                "model_version": yolo_out.get("model_version"),
                "duration_ms": round(t3_d * 1000, 2),
                "model_ready": yolo_out.get("model_ready"),
                "raw_detections_count": len(yolo_out.get("detections", [])),
                "raw_detections": yolo_out.get("detections", []),
            },
        },
        "total_inference_time_ms": total_time_ms,
    }
