"""Inspect API endpoints for single and batch image road inspection."""
from __future__ import annotations

import uuid
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.core.auth import verify_api_key
from app.core.config import settings
from app.services.inspection_pipeline import inspection_pipeline
from app.database.session import get_db, SessionLocal
from app.models.database import Inspection, Analysis
import json

router = APIRouter(prefix="/api/v1", tags=["inspection"])

MAX_BYTES = settings.MAX_FILE_SIZE_MB * 1024 * 1024


@router.post("/inspect", status_code=200)
async def inspect_road_image(
    file: UploadFile = File(...),
    api_key: str = Depends(verify_api_key),
):
    """Execute the strict sequential 8-stage road inspection pipeline on an uploaded image.
    
    Requires Authorization: Bearer <API_KEY>
    """
    # 1. Check file size & suffix
    suffix = (file.filename or "").split(".")[-1].lower()
    if f".{suffix}" not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported format. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {settings.MAX_FILE_SIZE_MB} MB",
        )
    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file payload is empty",
        )

    # 2. Run pipeline with request isolation
    inspection_id = str(uuid.uuid4())
    result = inspection_pipeline.process_image(
        file_bytes,
        file.filename or "upload.jpg",
        inspection_id=inspection_id,
    )

    # 3. Save inspection record to database
    db = SessionLocal()
    try:
        insp = Inspection(
            id=inspection_id,
            status="completed" if result.get("success") else "rejected",
            original_filename=file.filename,
            file_size=len(file_bytes),
            created_at=datetime.datetime.utcnow(),
            updated_at=datetime.datetime.utcnow(),
        )
        an = Analysis(
            id=str(uuid.uuid4()),
            inspection_id=inspection_id,
            status="completed" if result.get("success") else "rejected",
            pipeline_stage=result.get("stage", "completed"),
            result_json=json.dumps(result),
            started_at=datetime.datetime.utcnow(),
            completed_at=datetime.datetime.utcnow(),
        )
        db.add(insp)
        db.add(an)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()

    result["inspection_id"] = inspection_id
    return result


@router.post("/inspect/batch", status_code=200)
async def inspect_road_batch(
    files: List[UploadFile] = File(...),
    api_key: str = Depends(verify_api_key),
):
    """Execute road inspection pipeline across multiple uploaded images in batch."""
    if len(files) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Batch limit exceeded. Maximum 10 images per batch request.",
        )

    batch_results = []
    for file in files:
        file_bytes = await file.read()
        res = inspection_pipeline.process_image(file_bytes, file.filename or "upload.jpg")
        batch_results.append({
            "filename": file.filename,
            "result": res,
        })

    return {
        "success": True,
        "batch_size": len(files),
        "results": batch_results,
    }


@router.get("/inspection/{inspection_id}")
async def get_inspection_result(
    inspection_id: str,
    api_key: str = Depends(verify_api_key),
):
    """Retrieve historical inspection results by inspection_id."""
    db = SessionLocal()
    try:
        insp = db.query(Inspection).filter(Inspection.id == inspection_id).first()
        if not insp:
            raise HTTPException(status_code=404, detail="Inspection not found.")
        an = db.query(Analysis).filter(Analysis.inspection_id == inspection_id).first()
        result_data = json.loads(an.result_json) if an and an.result_json else {}
        return {
            "id": insp.id,
            "inspection_id": insp.id,
            "filename": insp.original_filename,
            "status": insp.status,
            "created_at": insp.created_at.isoformat() if insp.created_at else None,
            "analysis": result_data,
        }
    finally:
        db.close()
