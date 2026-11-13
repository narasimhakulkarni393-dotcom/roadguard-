"""Background execution of video analysis jobs."""
from __future__ import annotations

import json
import logging
from pathlib import Path

from app.database.base import now_utc
from app.database.session import SessionLocal
from app.models.database import VideoJob
from app.services.video_pipeline import VideoProcessingError, process_video

logger = logging.getLogger("pitscout.video_jobs")


def run_video_job(video_id: str, stored_path: Path, original_filename: str) -> None:
    db = SessionLocal()
    try:
        job = db.query(VideoJob).filter(VideoJob.id == video_id).first()
        if job is None:
            logger.error("Video job %s disappeared before execution", video_id)
            return

        job.status = "processing"
        job.pipeline_stage = "loading_video"
        job.started_at = now_utc()
        job.progress = 1
        db.commit()

        def progress(stage: str, pct: int, sampled: int, processed: int) -> None:
            job.pipeline_stage = stage
            job.progress = pct
            job.sampled_frames = sampled
            job.processed_frames = processed
            job.updated_at = now_utc()
            db.commit()

        try:
            result = process_video(video_id, stored_path, original_filename, progress_cb=progress)
        except VideoProcessingError as exc:
            job.status = exc.status
            job.error_message = str(exc)
            job.pipeline_stage = "failed"
            job.completed_at = now_utc()
            db.commit()
            logger.warning("Video job %s finished with status %s: %s", video_id, exc.status, exc)
            return

        video_meta = result.get("video", {})
        job.status = "completed"
        job.pipeline_stage = "completed"
        job.progress = 100
        job.error_message = None
        job.duration_seconds = video_meta.get("duration_seconds")
        job.fps = video_meta.get("fps")
        job.total_frames = video_meta.get("total_frames")
        job.sampled_frames = video_meta.get("sampled_frames")
        job.processed_frames = video_meta.get("processed_frames")
        job.result_json = json.dumps(result)
        job.completed_at = now_utc()
        db.commit()
        logger.info("Video job %s completed with %d tracked defects.", video_id, len(result.get("tracks", [])))

    except Exception as exc:
        logger.exception("Video job %s failed unexpectedly", video_id)
        try:
            job = db.query(VideoJob).filter(VideoJob.id == video_id).first()
            if job is not None:
                job.status = "failed"
                job.error_message = str(exc)
                job.pipeline_stage = "failed"
                job.completed_at = now_utc()
                db.commit()
        except Exception:
            logger.exception("Could not record failure for video job %s", video_id)
    finally:
        db.close()
