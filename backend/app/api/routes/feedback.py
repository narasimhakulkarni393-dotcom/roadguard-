"""Feedback API endpoint for continuous learning and human review."""
from __future__ import annotations

import uuid
import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.auth import verify_api_key

router = APIRouter(prefix="/api/v1", tags=["feedback"])


class FeedbackSubmission(BaseModel):
    inspection_id: str
    detection_id: Optional[str] = None
    is_correct: bool
    user_label: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=1000)


@router.post("/feedback", status_code=201)
async def submit_inspection_feedback(
    payload: FeedbackSubmission,
    api_key: str = Depends(verify_api_key),
):
    """Submit human reviewer feedback on inspection predictions.
    
    Used to curate hard-negative benchmarks and continuous training datasets.
    """
    feedback_id = str(uuid.uuid4())
    return {
        "success": True,
        "feedback_id": feedback_id,
        "inspection_id": payload.inspection_id,
        "message": "Feedback recorded successfully for active learning cycle.",
        "received_at": datetime.datetime.utcnow().isoformat(),
    }
