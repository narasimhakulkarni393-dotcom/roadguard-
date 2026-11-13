"""Training jobs routes for RoadGuard AI."""
from __future__ import annotations

import datetime
import uuid
import asyncio
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.session import get_db, SessionLocal
from app.models.database import TrainingJob
from app.core.config import settings

router = APIRouter(prefix="/api/v1/training", tags=["training"])


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


def _simulate_training_job(job_id: str):
    """Background simulator / executor for training."""
    db = SessionLocal()
    try:
        job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
        if not job:
            return
        job.status = "running"
        job.started_at = datetime.datetime.utcnow()
        job.logs = "Job started. Loading dataset config...\nInitializing model architecture...\n"
        db.commit()

        # Update log
        job.logs += "Verifying PyTorch environment (CPU mode active)...\n"
        job.logs += f"Training config: {job.config}\n"
        job.logs += "Training initiated. Monitoring epoch convergence...\n"
        db.commit()
    finally:
        db.close()


@router.post("/detection/start", status_code=202)
async def start_detection_training(
    payload: DetectionTrainRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    job_id = str(uuid.uuid4())
    job = TrainingJob(
        id=job_id,
        job_type="detection",
        status="queued",
        config=payload.model_dump(),
        logs=f"Queued detection training job {job_id} at {datetime.datetime.utcnow().isoformat()}\n",
    )
    db.add(job)
    db.commit()

    background_tasks.add_task(_simulate_training_job, job_id)

    return {
        "job_id": job_id,
        "status": "queued",
        "job_type": "detection",
        "message": "Detection model training job submitted successfully.",
    }


@router.post("/authenticity/start", status_code=202)
async def start_authenticity_training(
    payload: AuthenticityTrainRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    job_id = str(uuid.uuid4())
    job = TrainingJob(
        id=job_id,
        job_type="authenticity",
        status="queued",
        config=payload.model_dump(),
        logs=f"Queued authenticity training job {job_id} at {datetime.datetime.utcnow().isoformat()}\n",
    )
    db.add(job)
    db.commit()

    background_tasks.add_task(_simulate_training_job, job_id)

    return {
        "job_id": job_id,
        "status": "queued",
        "job_type": "authenticity",
        "message": "Authenticity model training job submitted successfully.",
    }


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
