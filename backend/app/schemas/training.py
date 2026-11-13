from __future__ import annotations
from typing import Optional, Dict, Any
from pydantic import BaseModel
import datetime


class TrainingJobCreate(BaseModel):
    job_type: str  # detection | authenticity
    config: Optional[Dict[str, Any]] = None


class TrainingJobResponse(BaseModel):
    id: str
    job_type: str
    status: str
    config: Optional[Dict[str, Any]] = None
    started_at: Optional[datetime.datetime] = None
    completed_at: Optional[datetime.datetime] = None
    metrics: Optional[Dict[str, Any]] = None
    logs: Optional[str] = None
    model_path: Optional[str] = None

    class Config:
        from_attributes = True
