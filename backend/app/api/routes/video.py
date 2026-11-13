"""Video analysis endpoints: upload, progress, results, keyframes."""
from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.auth import verify_api_key
from app.core.config import settings
from app.database.base import now_utc
from app.database.session import get_db
from app.models.database import VideoJob
from app.services.video_validation import validate_video_upload
from app.workers.video_job_manager import run_video_job

logger = logging.getLogger("pitscout.routes.video")
router = APIRouter(
    prefix="/api/v1/videos",
    tags=["video"],
    dependencies=[Depends(verify_api_key)],
)

CHUNK_SIZE = 1024 * 1024


@router.post("/analyze", status_code=202)
async def analyze_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in settings.ALLOWED_VIDEO_EXTENSIONS:
        allowed = ", ".join(sorted(settings.ALLOWED_VIDEO_EXTENSIONS))
        raise HTTPException(status_code=422, detail=f"File type '{suffix}' not allowed. Allowed: {allowed}")

    video_id = str(uuid.uuid4())
    settings.VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    destination = settings.VIDEO_DIR / f"{video_id}{suffix}"
    max_bytes = settings.MAX_VIDEO_SIZE_MB * 1024 * 1024
    header = b""
    total = 0

    try:
        async with aiofiles.open(destination, "wb") as out:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                if not header:
                    header = chunk[:16]
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Video exceeds maximum size of {settings.MAX_VIDEO_SIZE_MB} MB.",
                    )
                await out.write(chunk)
    except HTTPException:
        destination.unlink(missing_ok=True)
        raise
    except Exception:
        destination.unlink(missing_ok=True)
        logger.exception("Failed to store uploaded video")
        raise HTTPException(status_code=500, detail="Failed to store uploaded video.")

    problem = validate_video_upload(header, total, file.filename or "")
    if problem:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=problem)

    job = VideoJob(
        id=video_id,
        status="pending",
        pipeline_stage="queued",
        progress=0,
        original_filename=file.filename,
        stored_path=str(destination),
        file_size=total,
        created_at=now_utc(),
        updated_at=now_utc(),
    )
    db.add(job)
    db.commit()

    background_tasks.add_task(run_video_job, video_id, destination, file.filename or "upload.mp4")

    return {
        "video_id": video_id,
        "status": "pending",
        "progress": 0,
        "file_size": total,
        "status_url": f"/api/v1/videos/{video_id}",
        "result_url": f"/api/v1/videos/{video_id}/result",
        "message": "Video received. Analysis started in background.",
    }


@router.get("")
async def list_videos(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    total = db.query(VideoJob).count()
    jobs = (
        db.query(VideoJob)
        .order_by(VideoJob.created_at.desc())
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
                "video_id": j.id,
                "status": j.status,
                "progress": j.progress,
                "original_filename": j.original_filename,
                "duration_seconds": j.duration_seconds,
                "sampled_frames": j.sampled_frames,
                "created_at": j.created_at.isoformat() if j.created_at else None,
            }
            for j in jobs
        ],
    }


@router.get("/{video_id}")
async def get_video_status(video_id: str, db: Session = Depends(get_db)):
    job = db.query(VideoJob).filter(VideoJob.id == video_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Video job not found.")
    return {
        "video_id": job.id,
        "status": job.status,
        "pipeline_stage": job.pipeline_stage,
        "progress": job.progress,
        "original_filename": job.original_filename,
        "file_size": job.file_size,
        "duration_seconds": job.duration_seconds,
        "fps": job.fps,
        "total_frames": job.total_frames,
        "sampled_frames": job.sampled_frames,
        "processed_frames": job.processed_frames,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "result_url": f"/api/v1/videos/{video_id}/result",
    }


@router.get("/{video_id}/result")
async def get_video_result(video_id: str, db: Session = Depends(get_db)):
    job = db.query(VideoJob).filter(VideoJob.id == video_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Video job not found.")
    if job.status in ("pending", "processing"):
        return {
            "video_id": video_id,
            "status": job.status,
            "pipeline_stage": job.pipeline_stage,
            "progress": job.progress,
            "message": "Analysis still in progress. Poll this endpoint.",
        }
    if job.status != "completed":
        raise HTTPException(
            status_code=422,
            detail={
                "video_id": video_id,
                "status": job.status,
                "error": job.error_message or "Video analysis did not complete.",
            },
        )
    if not job.result_json:
        raise HTTPException(status_code=500, detail="Result payload missing.")
    return json.loads(job.result_json)


@router.get("/{video_id}/keyframes/{track_id}")
async def get_keyframe(video_id: str, track_id: int, db: Session = Depends(get_db)):
    job = db.query(VideoJob).filter(VideoJob.id == video_id).first()
    if not job or not job.result_json:
        raise HTTPException(status_code=404, detail="Video result not available.")
    known_ids = {t["track_id"] for t in json.loads(job.result_json).get("tracks", [])}
    if track_id not in known_ids:
        raise HTTPException(status_code=404, detail="Track not found in this video.")
    path = settings.KEYFRAMES_DIR / f"{video_id}_{track_id}.jpg"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Keyframe file missing from storage.")
    return FileResponse(str(path), media_type="image/jpeg")


@router.delete("/{video_id}", status_code=204)
async def delete_video(video_id: str, db: Session = Depends(get_db)):
    job = db.query(VideoJob).filter(VideoJob.id == video_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Video job not found.")
    stored = Path(job.stored_path) if job.stored_path else None
    db.delete(job)
    db.commit()

    if stored is not None:
        try:
            stored.unlink(missing_ok=True)
        except OSError as exc:
            logger.warning("Could not remove stored video %s: %s", stored, exc)
    for keyframe in settings.KEYFRAMES_DIR.glob(f"{video_id}_*.jpg"):
        try:
            keyframe.unlink()
        except OSError as exc:
            logger.warning("Could not remove keyframe %s: %s", keyframe, exc)
    return None
