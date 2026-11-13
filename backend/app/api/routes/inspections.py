"""Inspections management routes."""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import verify_api_key
from app.core.config import settings
from app.database.session import get_db
from app.models.database import Analysis, Inspection

logger = logging.getLogger("pitscout.routes.inspections")
router = APIRouter(tags=["inspections"], dependencies=[Depends(verify_api_key)])


@router.get("/api/v1/inspections")
async def list_inspections(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    total = db.query(Inspection).count()
    items = (
        db.query(Inspection)
        .order_by(Inspection.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": i.id,
                "status": i.status,
                "original_filename": i.original_filename,
                "file_size": i.file_size,
                "created_at": i.created_at.isoformat() if i.created_at else None,
                "updated_at": i.updated_at.isoformat() if i.updated_at else None,
            }
            for i in items
        ],
    }


@router.get("/api/v1/inspections/{inspection_id}")
@router.get("/api/v1/inspection/{inspection_id}")
async def get_inspection(inspection_id: str, db: Session = Depends(get_db)):
    item = db.query(Inspection).filter(Inspection.id == inspection_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inspection not found.")
    return {
        "id": item.id,
        "status": item.status,
        "original_filename": item.original_filename,
        "file_size": item.file_size,
        "notes": item.notes,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "analyses": [{"id": a.id, "status": a.status, "pipeline_stage": a.pipeline_stage} for a in item.analyses],
    }


@router.delete("/api/v1/inspections/{inspection_id}", status_code=204)
@router.delete("/api/v1/inspection/{inspection_id}", status_code=204)
async def delete_inspection(inspection_id: str, db: Session = Depends(get_db)):
    item = db.query(Inspection).filter(Inspection.id == inspection_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inspection not found.")
    stored = Path(item.image_path) if item.image_path else None
    analysis_ids = [a.id for a in item.analyses]
    db.delete(item)
    db.commit()

    candidates = []
    if stored is not None:
        candidates.append(stored)
    candidates.extend(settings.ANNOTATED_DIR / f"{aid}_annotated.jpg" for aid in analysis_ids)
    for path in candidates:
        try:
            if path.is_file():
                path.unlink()
        except OSError as exc:
            logger.warning("Could not remove file %s: %s", path, exc)
    return None
