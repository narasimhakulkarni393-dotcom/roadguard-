"""Training job routes.

Training orchestration is intentionally not implemented in this build: there is
no labelled dataset committed to the repository and no GPU scheduler. The
endpoints answer 501 instead of pretending a job started.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import verify_api_key
from app.database.session import get_db
from app.models.database import TrainingJob

router = APIRouter(
    prefix="/api/v1/training",
    tags=["training"],
    dependencies=[Depends(verify_api_key)],
)

_NOT_IMPLEMENTED = (
    "Model training is not implemented in this deployment. "
    "It requires a curated, split dataset plus a training runtime; neither is bundled."
)


class DetectionTrainRequest(BaseModel):
    dataset_name: str = "rdd2022"
    model_type: str = "yolov8n"
    epochs: int = Field(default=30, ge=1, le=300)
    imgsz: int = Field(default=640, ge=320, le=1280)
    batch: int = Field(default=8, ge=1, le=64)
    lr: float = Field(default=0.01, gt=0)
    device: str = "cpu"


class AuthenticityTrainRequest(BaseModel):
    dataset_name: str = "genimage"
    model_type: str = "mobilenet_v3_small"
    epochs: int = Field(default=20, ge=1, le=100)
    batch: int = Field(default=16, ge=1, le=64)
    lr: float = Field(default=0.001, gt=0)


@router.post("/detection/start", status_code=501)
async def start_detection_training(payload: DetectionTrainRequest):
    raise HTTPException(status_code=501, detail=_NOT_IMPLEMENTED)


@router.post("/authenticity/start", status_code=501)
async def start_authenticity_training(payload: AuthenticityTrainRequest):
    raise HTTPException(status_code=501, detail=_NOT_IMPLEMENTED)


@router.get("/jobs")
@router.get("")
async def list_jobs(db: Session = Depends(get_db)):
    jobs = db.query(TrainingJob).order_by(TrainingJob.started_at.desc()).all()
    return [
        {
            "id": j.id,
            "job_type": j.job_type,
            "status": j.status,
            "config": j.config,
            "started_at": j.started_at.isoformat() if j.started_at else None,
            "completed_at": j.completed_at.isoformat() if j.completed_at else None,
        }
        for j in jobs
    ]


@router.get("/{job_id}")
async def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found.")
    return {
        "id": job.id,
        "job_type": job.job_type,
        "status": job.status,
        "config": job.config,
        "metrics": job.metrics,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


@router.get("/{job_id}/logs")
async def get_job_logs(job_id: str, db: Session = Depends(get_db)):
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found.")
    return {
        "job_id": job.id,
        "status": job.status,
        "logs": job.logs or "No logs recorded yet.",
    }
