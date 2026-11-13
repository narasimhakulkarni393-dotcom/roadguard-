"""Feedback API endpoint for continuous learning and human review."""
from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import verify_api_key
from app.database.base import now_utc
from app.database.session import get_db
from app.models.database import Detection, Feedback, Inspection

logger = logging.getLogger("pitscout.routes.feedback")
router = APIRouter(prefix="/api/v1", tags=["feedback"])


class FeedbackSubmission(BaseModel):
    inspection_id: str
    detection_id: Optional[str] = None
    is_correct: bool
    user_label: Optional[str] = Field(default=None, max_length=64)
    notes: Optional[str] = Field(default=None, max_length=1000)


@router.post("/feedback", status_code=201)
async def submit_inspection_feedback(
    payload: FeedbackSubmission,
    db: Session = Depends(get_db),
    api_key: str = Depends(verify_api_key),
):
    """Persist a human reviewer verdict on an inspection prediction."""
    inspection = db.query(Inspection).filter(Inspection.id == payload.inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found.")

    if payload.detection_id:
        detection = db.query(Detection).filter(Detection.id == payload.detection_id).first()
        if not detection:
            raise HTTPException(status_code=404, detail="Detection not found.")
        analysis_ids = {a.id for a in inspection.analyses}
        if detection.analysis_id not in analysis_ids:
            raise HTTPException(status_code=400, detail="Detection does not belong to this inspection.")

    record = Feedback(
        id=str(uuid.uuid4()),
        inspection_id=payload.inspection_id,
        detection_id=payload.detection_id,
        is_correct=payload.is_correct,
        user_label=payload.user_label,
        notes=payload.notes,
        created_at=now_utc(),
    )
    db.add(record)
    db.commit()

    return {
        "success": True,
        "feedback_id": record.id,
        "inspection_id": record.inspection_id,
        "received_at": record.created_at.isoformat() + "Z",
    }
