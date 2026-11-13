"""Video road-defect detection with frame sampling and IoU/centroid tracking."""
from __future__ import annotations

import logging
import math
import time
from pathlib import Path
from typing import Any, Callable, Optional

from PIL import Image, ImageDraw

from app.core.config import settings
from app.ml.cause_estimator.service import estimate_causes_for_defect
from app.ml.registry import registry
from app.ml.severity_assessor.service import assess_defect_severity
from app.services.tracking import IouCentroidTracker, TrackedDetection

logger = logging.getLogger("pitscout.video_pipeline")

ProgressCallback = Callable[[str, int, int, int], None]

LIMITATIONS = [
    "Bounding boxes are image-pixel geometry; no metric size without camera calibration.",
    "Only a sampled subset of frames is inspected (VIDEO_SAMPLE_FPS). Defects visible only between samples are missed.",
    "Identity tracking is IoU/centroid greedy matching, not a learned re-identification model.",
    "Confidence values are detector outputs and are not calibrated probabilities.",
]


class VideoProcessingError(Exception):
    def __init__(self, message: str, status: str = "failed") -> None:
        super().__init__(message)
        self.status = status


def _keyframe_path(video_id: str, track_id: int) -> Path:
    return settings.KEYFRAMES_DIR / f"{video_id}_{track_id}.jpg"


def _clear_keyframes(video_id: str) -> None:
    for path in settings.KEYFRAMES_DIR.glob(f"{video_id}_*.jpg"):
        try:
            path.unlink()
        except OSError:
            logger.warning("Could not delete keyframe %s", path)


def _save_keyframe(video_id: str, track_id: int, image: Image.Image, bbox: tuple[float, float, float, float]) -> Path:
    settings.KEYFRAMES_DIR.mkdir(parents=True, exist_ok=True)
    img_w, img_h = image.size
    margin_x = (bbox[2] - bbox[0]) * 0.25
    margin_y = (bbox[3] - bbox[1]) * 0.25
    left = max(0, int(bbox[0] - margin_x))
    top = max(0, int(bbox[1] - margin_y))
    right = min(img_w, int(bbox[2] + margin_x))
    bottom = min(img_h, int(bbox[3] + margin_y))
    crop = image.crop((left, top, max(left + 1, right), max(top + 1, bottom))).copy()

    draw = ImageDraw.Draw(crop)
    draw.rectangle(
        (bbox[0] - left, bbox[1] - top, bbox[2] - left, bbox[3] - top),
        outline=(255, 64, 64),
        width=max(2, int(min(crop.size) * 0.01)),
    )
    destination = _keyframe_path(video_id, track_id)
    crop.save(destination, format="JPEG", quality=88)
    return destination


def process_video(
    video_id: str,
    video_path: Path,
    original_filename: str,
    progress_cb: Optional[ProgressCallback] = None,
) -> dict[str, Any]:
    """Run detection + tracking over a sampled frame sequence.

    Blocking CPU work; callers must run it off the event loop.
    """
    try:
        import cv2  # type: ignore
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise VideoProcessingError(
            "Video analysis requires OpenCV (opencv-python-headless).", status="needs_runtime"
        ) from exc

    if not registry.damage_detector.is_ready():
        raise VideoProcessingError(
            "Damage detection model is unavailable; video analysis cannot run.", status="needs_model"
        )

    _clear_keyframes(video_id)
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise VideoProcessingError("OpenCV could not decode the uploaded video container.")

    started = time.perf_counter()
    try:
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
        fps_assumed = fps <= 0.0
        if fps_assumed:
            fps = 25.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        duration = total_frames / fps if total_frames > 0 else None

        step = max(1, int(round(fps / max(0.1, settings.VIDEO_SAMPLE_FPS))))
        if total_frames > 0:
            estimated = math.ceil(total_frames / step)
            if estimated > settings.VIDEO_MAX_SAMPLED_FRAMES:
                step = max(step, math.ceil(total_frames / settings.VIDEO_MAX_SAMPLED_FRAMES))

        frame_diagonal = math.hypot(width, height) if width and height else 1.0
        tracker = IouCentroidTracker(
            iou_threshold=settings.TRACK_IOU_THRESHOLD,
            max_centroid_ratio=settings.TRACK_MAX_CENTROID_RATIO,
            max_age_frames=settings.TRACK_MAX_AGE_FRAMES,
            frame_diagonal=frame_diagonal,
        )

        road_result: Optional[dict[str, Any]] = None
        authenticity_result: Optional[dict[str, Any]] = None
        model_version = registry.damage_detector.version()
        sampled = 0
        processed = 0
        raw_candidates = 0
        filtered_candidates = 0
        frame_index = 0
        last_progress = -1

        while True:
            ok, frame = cap.read()
            if not ok or frame is None:
                break

            if frame_index % step == 0:
                pil_image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

                if road_result is None:
                    road_result = registry.road_classifier.predict(pil_image)
                    if not road_result.get("is_road", False):
                        raise VideoProcessingError(
                            "First sampled frame is not a road scene "
                            f"(label={road_result.get('label')}, confidence={road_result.get('confidence')}).",
                            status="rejected",
                        )
                    authenticity_result = registry.authenticity_classifier.predict(pil_image)
                    if authenticity_result.get("label") == "likely_ai_generated":
                        raise VideoProcessingError(
                            "Video frame classified as likely AI-generated; rejected under policy.",
                            status="rejected",
                        )

                detection = registry.damage_detector.predict(pil_image)
                sampled += 1
                raw_candidates += len(detection.get("detections", []))

                tracked: list[TrackedDetection] = []
                for candidate in detection.get("detections", []):
                    verdict = registry.false_positive_filter.predict(
                        pil_image,
                        bbox=candidate["bbox"],
                        class_name=candidate["class"],
                        confidence=candidate["confidence"],
                    )
                    if not verdict.get("is_valid", False):
                        filtered_candidates += 1
                        continue
                    tracked.append(
                        TrackedDetection(
                            bbox=tuple(float(v) for v in candidate["bbox"]),
                            confidence=float(candidate["confidence"]),
                            class_name=candidate["class"],
                        )
                    )

                tracker.update(tracked, sampled - 1)
                processed += 1

                # Save a keyframe whenever a track reaches a new best confidence.
                for track in tracker.tracks.values():
                    if track.best_frame == sampled - 1:
                        _save_keyframe(video_id, track.track_id, pil_image, track.best_bbox)

                if progress_cb is not None and total_frames > 0:
                    pct = min(95, int(frame_index / total_frames * 100))
                    if pct >= last_progress + 2:
                        last_progress = pct
                        progress_cb("detection_and_tracking", pct, sampled, processed)

                if sampled >= settings.VIDEO_MAX_SAMPLED_FRAMES:
                    break

            frame_index += 1
    finally:
        cap.release()

    if sampled == 0:
        raise VideoProcessingError("No decodable frames were found in the uploaded video.")

    confirmed = tracker.confirmed_tracks(settings.TRACK_MIN_HITS)
    severity_labels = {"low": "LOW", "medium": "MODERATE", "high": "HIGH", "critical": "CRITICAL"}
    tracks_payload: list[dict[str, Any]] = []
    for track in confirmed[:200]:
        severity = assess_defect_severity(
            class_name=track.class_name,
            bbox=list(track.best_bbox),
            img_w=width,
            img_h=height,
            confidence=track.best_confidence,
            total_detections=len(confirmed),
        )
        causes = estimate_causes_for_defect(class_name=track.class_name, severity=severity.level)
        keyframe = _keyframe_path(video_id, track.track_id)
        tracks_payload.append(
            {
                "track_id": track.track_id,
                "class": track.class_name,
                "best_confidence": round(track.best_confidence, 4),
                "mean_confidence": round(track.mean_confidence, 4),
                "frames_seen": track.hits,
                "first_frame_index": track.first_frame,
                "last_frame_index": track.last_frame,
                "first_timestamp_s": round(track.first_frame * step / fps, 2),
                "last_timestamp_s": round(track.last_frame * step / fps, 2),
                "best_bbox": [round(v, 2) for v in track.best_bbox],
                "severity": {
                    "level": severity_labels.get(severity.level.lower(), severity.level.upper()),
                    "score": severity.score,
                    "priority": severity.priority,
                    "factors": list(severity.factors),
                    "uncertainty_note": severity.uncertainty_note,
                },
                "probable_causes": [
                    {"cause": c.cause, "confidence": c.confidence, "evidence": c.evidence}
                    for c in causes.causes
                ],
                "primary_cause": causes.primary_cause,
                "keyframe_url": f"/api/v1/videos/{video_id}/keyframes/{track.track_id}"
                if keyframe.exists()
                else None,
            }
        )

    by_class: dict[str, int] = {}
    for item in tracks_payload:
        by_class[item["class"]] = by_class.get(item["class"], 0) + 1

    severity_rank = {"CRITICAL": 4, "HIGH": 3, "MODERATE": 2, "LOW": 1}
    highest = "LOW"
    for item in tracks_payload:
        if severity_rank.get(item["severity"]["level"], 0) > severity_rank.get(highest, 0):
            highest = item["severity"]["level"]

    if progress_cb is not None:
        progress_cb("completed", 100, sampled, processed)

    return {
        "video_id": video_id,
        "original_filename": original_filename,
        "status": "completed",
        "video": {
            "width": width,
            "height": height,
            "fps": round(fps, 3),
            "fps_assumed": fps_assumed,
            "total_frames": total_frames,
            "duration_seconds": round(duration, 2) if duration else None,
            "sample_fps_requested": settings.VIDEO_SAMPLE_FPS,
            "frame_stride": step,
            "sampled_frames": sampled,
            "processed_frames": processed,
        },
        "pipeline": {
            "road_classification": {
                "label": road_result.get("label") if road_result else None,
                "confidence": road_result.get("confidence") if road_result else None,
            },
            "authenticity": {
                "label": authenticity_result.get("label") if authenticity_result else None,
                "confidence": authenticity_result.get("confidence") if authenticity_result else None,
            },
            "model_provenance": {
                "damage_detector": model_version,
                "road_classifier": registry.road_classifier.version(),
                "authenticity_classifier": registry.authenticity_classifier.version(),
                "false_positive_filter": registry.false_positive_filter.version(),
            },
        },
        "summary": {
            "unique_defects": len(tracks_payload),
            "raw_candidates": raw_candidates,
            "filtered_candidates": filtered_candidates,
            "by_class": by_class,
            "highest_severity": highest if tracks_payload else None,
        },
        "tracks": tracks_payload,
        "tracking": {
            "algorithm": "greedy IoU + centroid fallback",
            "iou_threshold": settings.TRACK_IOU_THRESHOLD,
            "max_centroid_ratio": settings.TRACK_MAX_CENTROID_RATIO,
            "max_age_samples": settings.TRACK_MAX_AGE_FRAMES,
            "min_hits": settings.TRACK_MIN_HITS,
        },
        "execution_metadata": {"duration_ms": round((time.perf_counter() - started) * 1000, 2)},
        "limitations": LIMITATIONS,
    }
