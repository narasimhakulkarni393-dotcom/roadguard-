"""Pothole report ingestion, evidence storage and duplicate resolution."""
from __future__ import annotations

import hashlib
import io
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from PIL import Image, ImageOps
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.base import now_utc
from app.ml.registry import registry
from app.ml.severity_assessor.service import assess_defect_severity
from app.models.database import (
    EvidenceFile,
    Pothole,
    PotholeLocation,
    PotholeReport,
    PotholeStatusHistory,
)
from app.services.duplicate_matcher import (
    MATCH,
    NO_MATCH,
    MatchCandidate,
    MatchResult,
    evaluate_candidates,
)
from app.services.geo import assess_location, lat_lon_bounds, location_precision
from app.services.image_validation import validate_image
from app.services.visual_descriptor import build_descriptor

logger = logging.getLogger("pitscout.pothole_reports")

SEVERITY_RANK = {"LOW": 1, "MODERATE": 2, "HIGH": 3, "CRITICAL": 4}
STATUS_TRANSITIONS: dict[str, set[str]] = {
    "reported": {"verified", "rejected"},
    "verified": {"scheduled", "rejected"},
    "scheduled": {"in_progress", "verified"},
    "in_progress": {"repaired", "scheduled"},
    "repaired": {"closed", "verified"},
    "closed": {"verified"},
    "rejected": set(),
}


class PotholeReportError(Exception):
    def __init__(self, detail: str, status_code: int = 422) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def _normalize_severity(level: Optional[str]) -> Optional[str]:
    if not level:
        return None
    upper = level.upper()
    return "MODERATE" if upper == "MEDIUM" else upper


def _generate_code() -> str:
    return f"PS-{now_utc():%Y%m%d}-{uuid.uuid4().hex[:6].upper()}"


def _latest_descriptors(db: Session, pothole_ids: list[str]) -> dict[str, dict]:
    if not pothole_ids:
        return {}
    rows = (
        db.query(PotholeReport)
        .filter(PotholeReport.pothole_id.in_(pothole_ids), PotholeReport.visual_descriptor.isnot(None))
        .order_by(PotholeReport.created_at.desc())
        .all()
    )
    latest: dict[str, dict] = {}
    for row in rows:
        latest.setdefault(row.pothole_id, row.visual_descriptor)
    return latest


def _candidates_near(db: Session, latitude: float, longitude: float, radius_m: float, exclude_id: Optional[str] = None) -> list[MatchCandidate]:
    min_lat, max_lat, min_lon, max_lon = lat_lon_bounds(latitude, longitude, radius_m)
    query = db.query(Pothole).filter(
        Pothole.latitude.isnot(None),
        Pothole.longitude.isnot(None),
        Pothole.latitude.between(min_lat, max_lat),
        Pothole.longitude.between(min_lon, max_lon),
    )
    if exclude_id:
        query = query.filter(Pothole.id != exclude_id)
    potholes = query.order_by(Pothole.created_at.asc()).limit(50).all()
    descriptors = _latest_descriptors(db, [p.id for p in potholes])
    return [
        MatchCandidate(
            pothole_id=p.id,
            latitude=p.latitude,
            longitude=p.longitude,
            accuracy_m=p.location_accuracy_m,
            descriptor=descriptors.get(p.id),
            report_count=p.report_count,
        )
        for p in potholes
    ]


def _store_evidence(db: Session, report: PotholeReport, file_bytes: bytes, filename: str, width: int, height: int) -> EvidenceFile:
    settings.EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    suffix = Path(filename).suffix.lower() or ".jpg"
    destination = settings.EVIDENCE_DIR / f"{report.id}{suffix}"
    destination.write_bytes(file_bytes)
    evidence = EvidenceFile(
        id=str(uuid.uuid4()),
        report_id=report.id,
        kind="original_image",
        storage_path=str(destination),
        sha256=hashlib.sha256(file_bytes).hexdigest(),
        width=width,
        height=height,
        size_bytes=len(file_bytes),
        created_at=now_utc(),
    )
    db.add(evidence)
    return evidence


def _create_canonical(db: Session, report: PotholeReport, latitude: float, longitude: float, accuracy_m: Optional[float], severity: Optional[str]) -> Pothole:
    timestamp = now_utc()
    pothole = Pothole(
        id=str(uuid.uuid4()),
        code=_generate_code(),
        latitude=latitude,
        longitude=longitude,
        location_accuracy_m=accuracy_m,
        primary_severity=severity,
        status="reported",
        report_count=1,
        first_reported_at=timestamp,
        last_reported_at=timestamp,
        created_at=timestamp,
        updated_at=timestamp,
    )
    db.add(pothole)
    db.flush()
    report.pothole_id = pothole.id
    report.status = "attached_new"
    db.add(
        PotholeLocation(
            pothole_id=pothole.id,
            report_id=report.id,
            latitude=latitude,
            longitude=longitude,
            accuracy_m=accuracy_m,
            is_primary=True,
            created_at=timestamp,
        )
    )
    db.add(PotholeStatusHistory(pothole_id=pothole.id, from_status=None, to_status="reported", reason="First report attached.", actor="system", created_at=timestamp))
    return pothole


def _attach_to_canonical(db: Session, report: PotholeReport, pothole: Pothole, latitude: float, longitude: float, accuracy_m: Optional[float], severity: Optional[str]) -> None:
    timestamp = now_utc()
    report.pothole_id = pothole.id
    report.status = "attached_existing"
    pothole.report_count = (pothole.report_count or 0) + 1
    pothole.last_reported_at = timestamp
    if severity and SEVERITY_RANK.get(severity, 0) > SEVERITY_RANK.get(pothole.primary_severity or "", 0):
        pothole.primary_severity = severity
    db.add(
        PotholeLocation(
            pothole_id=pothole.id,
            report_id=report.id,
            latitude=latitude,
            longitude=longitude,
            accuracy_m=accuracy_m,
            is_primary=False,
            created_at=timestamp,
        )
    )


def _revalidate_new_canonical(db: Session, report: PotholeReport, new_pothole: Pothole, descriptor: dict) -> None:
    """Re-check after inserting a new pothole in case another worker inserted a
    near-identical canonical record between the candidate query and the write."""
    if report.latitude is None or report.longitude is None:
        return
    others = _candidates_near(db, report.latitude, report.longitude, settings.MATCH_BASE_RADIUS_M * 2, exclude_id=new_pothole.id)
    others = [c for c in others if c.report_count > 0]
    if not others:
        return
    result = evaluate_candidates(report.latitude, report.longitude, report.accuracy_m, descriptor, others)
    if result.decision != MATCH or not result.best_pothole_id:
        return

    older = db.query(Pothole).filter(Pothole.id == result.best_pothole_id).first()
    if older is None or older.created_at > new_pothole.created_at:
        return

    logger.info(
        "Revalidation moved report %s from new pothole %s to existing %s",
        report.id,
        new_pothole.id,
        older.id,
    )
    report.pothole_id = older.id
    report.status = "attached_existing"
    older.report_count = (older.report_count or 0) + 1
    older.last_reported_at = now_utc()
    db.add(
        PotholeLocation(
            pothole_id=older.id,
            report_id=report.id,
            latitude=report.latitude,
            longitude=report.longitude,
            accuracy_m=report.accuracy_m,
            is_primary=False,
            created_at=now_utc(),
        )
    )
    db.delete(new_pothole)
    db.flush()


def create_report(
    db: Session,
    *,
    file_bytes: bytes,
    original_filename: str,
    latitude: Optional[float],
    longitude: Optional[float],
    accuracy_m: Optional[float],
    captured_at: Optional[datetime],
    description: Optional[str],
    reporter_id: Optional[str],
    idempotency_key: Optional[str],
    source_type: str = "image",
) -> tuple[PotholeReport, bool]:
    """Create a report. Returns (report, was_idempotent_replay)."""
    if idempotency_key:
        existing = db.query(PotholeReport).filter(PotholeReport.idempotency_key == idempotency_key).first()
        if existing is not None:
            return existing, True

    validation = validate_image(file_bytes, original_filename)
    if not validation.valid:
        raise PotholeReportError(validation.error or "Uploaded image is invalid.")

    image = validation.pil_image
    if image is None:  # pragma: no cover - validate_image guarantees it
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(file_bytes))).convert("RGB")

    detection = registry.damage_detector.predict(image)
    verified: list[dict] = []
    if detection.get("model_ready"):
        for candidate in detection.get("detections", []):
            verdict = registry.false_positive_filter.predict(
                image,
                bbox=candidate["bbox"],
                class_name=candidate["class"],
                confidence=candidate["confidence"],
            )
            if verdict.get("is_valid", False):
                verified.append(candidate)

    primary = max(verified, key=lambda d: d.get("confidence", 0.0)) if verified else None
    severity = None
    if primary is not None:
        assessment = assess_defect_severity(
            class_name=primary["class"],
            bbox=primary["bbox"],
            img_w=validation.width,
            img_h=validation.height,
            confidence=primary["confidence"],
            total_detections=len(verified),
        )
        severity = _normalize_severity(assessment.level)

    crop_box = tuple(primary["bbox"]) if primary else None
    descriptor = build_descriptor(image, crop_box).to_dict()

    location = assess_location(latitude, longitude, accuracy_m, settings.LOCATION_MAX_ACCURACY_M)

    report = PotholeReport(
        id=str(uuid.uuid4()),
        idempotency_key=idempotency_key,
        reporter_id=reporter_id,
        latitude=location.latitude,
        longitude=location.longitude,
        accuracy_m=location.accuracy_m,
        location_status={
            "ok": "verified",
            "pending": "pending_location_verification",
            "invalid": "invalid_location",
        }[location.status],
        location_note=location.reason,
        captured_at=captured_at,
        source_type=source_type,
        source_ref=detection.get("model_version"),
        description=description,
        detection_class=primary["class"] if primary else None,
        detection_confidence=primary["confidence"] if primary else None,
        severity_level=severity,
        visual_descriptor=descriptor,
        status="received",
        created_at=now_utc(),
    )
    db.add(report)
    db.flush()

    _store_evidence(db, report, file_bytes, original_filename, validation.width, validation.height)
    evidence_path = settings.EVIDENCE_DIR / f"{report.id}{(Path(original_filename).suffix.lower() or '.jpg')}"

    if location.status == "ok" and location.latitude is not None and location.longitude is not None:
        lat, lon = location_precision(location.latitude, location.longitude)
        report.latitude, report.longitude = lat, lon
        candidates = _candidates_near(db, lat, lon, settings.MATCH_MAX_RADIUS_M)
        result: MatchResult = evaluate_candidates(lat, lon, location.accuracy_m, descriptor, candidates)
        report.match_decision = result.decision
        report.match_score = result.score
        report.match_signals = result.to_dict()
        report.match_reason = result.reason

        if result.decision == MATCH and result.best_pothole_id:
            target = db.query(Pothole).filter(Pothole.id == result.best_pothole_id).first()
            if target is not None:
                _attach_to_canonical(db, report, target, lat, lon, location.accuracy_m, severity)
        elif result.decision == NO_MATCH:
            new_pothole = _create_canonical(db, report, lat, lon, location.accuracy_m, severity)
            _revalidate_new_canonical(db, report, new_pothole, descriptor)
        else:  # UNCERTAIN
            report.status = "review_required"
            if result.best_pothole_id:
                signals = dict(report.match_signals or {})
                signals["candidate_pothole_id"] = result.best_pothole_id
                report.match_signals = signals
    else:
        report.status = report.location_status
        report.match_decision = "SKIPPED"
        report.match_reason = location.reason or "Location unavailable; duplicate matching skipped."

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        evidence_path.unlink(missing_ok=True)
        if idempotency_key:
            existing = db.query(PotholeReport).filter(PotholeReport.idempotency_key == idempotency_key).first()
            if existing is not None:
                return existing, True
        raise
    except Exception:
        db.rollback()
        evidence_path.unlink(missing_ok=True)
        raise
    db.refresh(report)
    return report, False


def relocate_report(
    db: Session,
    report: PotholeReport,
    latitude: float,
    longitude: float,
    accuracy_m: Optional[float],
) -> PotholeReport:
    """Attach verified coordinates to a previously unlocated report and resolve duplicates."""
    location = assess_location(latitude, longitude, accuracy_m, settings.LOCATION_MAX_ACCURACY_M)
    if location.status != "ok" or location.latitude is None or location.longitude is None:
        raise PotholeReportError(location.reason or "Location could not be verified.")

    lat, lon = location_precision(location.latitude, location.longitude)
    report.latitude, report.longitude = lat, lon
    report.accuracy_m = location.accuracy_m
    report.location_status = "verified"
    report.location_note = None

    severity = report.severity_level
    descriptor = report.visual_descriptor or {}
    candidates = _candidates_near(db, lat, lon, settings.MATCH_MAX_RADIUS_M)
    result = evaluate_candidates(lat, lon, location.accuracy_m, descriptor, candidates)
    report.match_decision = result.decision
    report.match_score = result.score
    report.match_signals = result.to_dict()
    report.match_reason = result.reason

    if report.pothole_id is None:
        if result.decision == MATCH and result.best_pothole_id:
            target = db.query(Pothole).filter(Pothole.id == result.best_pothole_id).first()
            if target is not None:
                _attach_to_canonical(db, report, target, lat, lon, location.accuracy_m, severity)
        elif result.decision == NO_MATCH:
            new_pothole = _create_canonical(db, report, lat, lon, location.accuracy_m, severity)
            _revalidate_new_canonical(db, report, new_pothole, descriptor)
        else:
            report.status = "review_required"

    db.commit()
    db.refresh(report)
    return report


def transition_status(db: Session, pothole: Pothole, to_status: str, reason: Optional[str], actor: Optional[str]) -> Pothole:
    to_status = to_status.strip().lower()
    allowed = STATUS_TRANSITIONS.get(pothole.status, set())
    if to_status not in allowed:
        raise PotholeReportError(
            f"Invalid status transition '{pothole.status}' -> '{to_status}'. Allowed: {sorted(allowed) or 'none'}.",
            status_code=409,
        )
    history = PotholeStatusHistory(
        pothole_id=pothole.id,
        from_status=pothole.status,
        to_status=to_status,
        reason=reason,
        actor=actor,
        created_at=now_utc(),
    )
    pothole.status = to_status
    db.add(history)
    db.commit()
    db.refresh(pothole)
    return pothole
