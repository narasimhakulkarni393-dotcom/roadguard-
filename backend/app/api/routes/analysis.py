"""Analysis routes — the core of the API."""
from __future__ import annotations

import asyncio
import datetime
import json
import logging
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from app.core.auth import verify_api_key
from app.core.config import settings
from app.database.session import get_db
from app.models.database import Analysis, Inspection
from app.schemas.analysis import AnalysisResponse, AnalysisStatusResponse
from app.services.image_validation import validate_image
from app.storage.local_storage import save_upload
from app.workers.job_manager import run_analysis_pipeline

logger = logging.getLogger("pitscout.routes.analysis")
router = APIRouter(
    prefix="/api/v1/analysis",
    tags=["analysis"],
    dependencies=[Depends(verify_api_key)],
)

MAX_BYTES = settings.MAX_FILE_SIZE_MB * 1024 * 1024


@router.post("/image", status_code=202)
@router.post("/upload", status_code=202)
async def upload_image(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # Validate extension
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"File type '{suffix}' not allowed. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}",
        )

    # Read file
    file_bytes = await file.read()
    if len(file_bytes) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum size of {settings.MAX_FILE_SIZE_MB} MB.",
        )
    if len(file_bytes) == 0:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")

    validation = validate_image(file_bytes, file.filename or "upload.jpg")
    if not validation.valid:
        raise HTTPException(status_code=422, detail=validation.error or "Invalid image file.")

    # Save to disk
    image_path = await save_upload(file_bytes, file.filename or "upload.jpg")

    # Create DB records
    inspection_id = str(uuid.uuid4())
    analysis_id = str(uuid.uuid4())
    now = datetime.datetime.utcnow()

    inspection = Inspection(
        id=inspection_id,
        created_at=now,
        updated_at=now,
        status="processing",
        image_path=str(image_path),
        original_filename=file.filename,
        file_size=len(file_bytes),
    )
    analysis = Analysis(
        id=analysis_id,
        inspection_id=inspection_id,
        status="pending",
        pipeline_stage="queued",
    )
    db.add(inspection)
    db.add(analysis)
    db.commit()

    # Launch background pipeline
    background_tasks.add_task(
        run_analysis_pipeline,
        analysis_id=analysis_id,
        inspection_id=inspection_id,
        image_path=image_path,
        original_filename=file.filename or "upload.jpg",
    )

    return {
        "analysis_id": analysis_id,
        "inspection_id": inspection_id,
        "status": "pending",
        "status_url": f"/api/v1/analysis/{analysis_id}",
        "result_url": f"/api/v1/analysis/{analysis_id}/result",
        "message": "Image received. Analysis started in background.",
    }


@router.get("/{analysis_id}", response_model=AnalysisStatusResponse)
async def get_analysis_status(analysis_id: str, db: Session = Depends(get_db)):
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    return AnalysisStatusResponse(
        analysis_id=analysis.id,
        status=analysis.status,
        pipeline_stage=analysis.pipeline_stage,
        result_url=f"/api/v1/analysis/{analysis_id}/result",
        created_at=analysis.started_at or datetime.datetime.utcnow(),
    )


@router.get("/{analysis_id}/result")
async def get_analysis_result(analysis_id: str, db: Session = Depends(get_db)):
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    if analysis.status == "pending" or analysis.status == "processing":
        return JSONResponse(
            status_code=202,
            content={
                "analysis_id": analysis_id,
                "status": analysis.status,
                "pipeline_stage": analysis.pipeline_stage,
                "message": "Analysis still in progress. Poll this endpoint.",
            },
        )
    if analysis.status == "failed":
        return JSONResponse(
            status_code=422,
            content={
                "analysis_id": analysis_id,
                "status": "failed",
                "error": "Analysis failed.",
            },
        )
    if not analysis.result_json:
        raise HTTPException(status_code=500, detail="Result not available.")
    return json.loads(analysis.result_json)


@router.get("/{analysis_id}/annotated-image")
async def get_annotated_image(analysis_id: str, db: Session = Depends(get_db)):
    if not db.query(Analysis).filter(Analysis.id == analysis_id).first():
        raise HTTPException(status_code=404, detail="Analysis not found.")
    path = settings.ANNOTATED_DIR / f"{analysis_id}_annotated.jpg"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Annotated image not available.")
    return FileResponse(str(path), media_type="image/jpeg")


@router.get("/{analysis_id}/original-image")
async def get_original_image(analysis_id: str, db: Session = Depends(get_db)):
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    inspection = db.query(Inspection).filter(Inspection.id == analysis.inspection_id).first()
    if not inspection or not inspection.image_path:
        raise HTTPException(status_code=404, detail="Original image not found.")
    path = Path(inspection.image_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Original image file missing from storage.")
    suffix = path.suffix.lower()
    media_types = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    return FileResponse(str(path), media_type=media_types.get(suffix, "image/jpeg"))
