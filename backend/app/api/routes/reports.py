"""Reports route."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.database import Analysis

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


@router.get("/{analysis_id}")
async def get_report(analysis_id: str, db: Session = Depends(get_db)):
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    if analysis.status != "completed" or not analysis.result_json:
        raise HTTPException(status_code=404, detail="Report not yet available.")
    return json.loads(analysis.result_json)


@router.get("")
async def list_reports(db: Session = Depends(get_db)):
    analyses = (
        db.query(Analysis)
        .filter(Analysis.status == "completed")
        .order_by(Analysis.completed_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "analysis_id": a.id,
            "inspection_id": a.inspection_id,
            "completed_at": a.completed_at.isoformat() if a.completed_at else None,
        }
        for a in analyses
    ]
