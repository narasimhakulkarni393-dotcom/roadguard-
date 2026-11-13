"""Pothole report submission and retrieval endpoints."""
from __future__ import annotations

import datetime
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import verify_api_key
from app.core.config import settings
from app.database.session import get_db
from app.models.database import EvidenceFile, PotholeReport
from app.services.pothole_report_service import (
    PotholeReportError,
    create_report,
    relocate_report,
)

logger = logging.getLogger("pitscout.routes.pothole_reports")
router = APIRouter(
    prefix="/api/v1/pothole-reports",
    tags=["pothole-reports"],
    dependencies=[Depends(verify_api_key)],
)

MAX_BYTES = settings.MAX_FILE_SIZE_MB * 1024 * 1024


class RelocateRequest(BaseModel):
    latitude: float
    longitude: float
    accuracy_m: Optional[float] = None


def serialize_report(report: PotholeReport) -> dict:
    return {
        "report_id": report.id,
        "pothole_id": report.pothole_id,
        "status": report.status,
        "match": {
            "decision": report.match_decision,
            "score": round(report.match_score, 4) if report.match_score is not None else None,
            "reason": report.match_reason,
            "signals": report.match_signals,
        },
        "location": {
            "latitude": report.latitude,
            "longitude": report.longitude,
            "accuracy_m": report.accuracy_m,
            "status": report.location_status,
            "note": report.location_note,
        },
        "detection": {
            "class": report.detection_class,
            "confidence": report.detection_confidence,
            "severity": report.severity_level,
        },
        "captured_at": report.captured_at.isoformat() if report.captured_at else None,
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "source_type": report.source_type,
        "source_ref": report.source_ref,
        "description": report.description,
        "evidence": [
            {
                "evidence_id": e.id,
                "kind": e.kind,
                "sha256": e.sha256,
                "width": e.width,
                "height": e.height,
                "url": f"/api/v1/pothole-reports/{report.id}/evidence/{e.id}",
            }
            for e in report.evidence
        ],
    }


def _parse_captured_at(raw: Optional[str]) -> Optional[datetime.datetime]:
    if not raw:
        return None
    try:
        return datetime.datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        raise HTTPException(status_code=422, detail="captured_at must be an ISO-8601 timestamp.")


@router.post("", status_code=201)
async def submit_pothole_report(
    response: Response,
    file: UploadFile = File(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    accuracy_m: Optional[float] = Form(None),
    captured_at: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    reporter_id: Optional[str] = Form(None),
    client_report_id: Optional[str] = Form(None),
    idempotency_header: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
):
    idempotency_key = (idempotency_header or client_report_id or "").strip() or None
    if idempotency_key and len(idempotency_key) > 128:
        raise HTTPException(status_code=422, detail="Idempotency key must be 128 characters or fewer.")
    if description and len(description) > 2000:
        raise HTTPException(status_code=422, detail="description must be 2000 characters or fewer.")

    filename = file.filename or "report.jpg"
    suffix = Path(filename).suffix.lower()
    if suffix not in settings.ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(settings.ALLOWED_EXTENSIONS))
        raise HTTPException(status_code=422, detail=f"File type '{suffix}' not allowed. Allowed: {allowed}")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds maximum size of {settings.MAX_FILE_SIZE_MB} MB.")
    if not file_bytes:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")

    try:
        report, replay = create_report(
            db,
            file_bytes=file_bytes,
            original_filename=filename,
            latitude=latitude,
            longitude=longitude,
            accuracy_m=accuracy_m,
            captured_at=_parse_captured_at(captured_at),
            description=description,
            reporter_id=reporter_id,
            idempotency_key=idempotency_key,
            source_type="image",
        )
    except PotholeReportError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    if replay:
        response.status_code = 200
    payload = serialize_report(report)
    payload["idempotent_replay"] = replay
    return payload


@router.get("")
async def list_reports(
    status: Optional[str] = Query(None),
    pothole_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(PotholeReport)
    if status:
        query = query.filter(PotholeReport.status == status)
    if pothole_id:
        query = query.filter(PotholeReport.pothole_id == pothole_id)
    total = query.count()
    reports = (
        query.order_by(PotholeReport.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [serialize_report(r) for r in reports],
    }


@router.get("/{report_id}")
async def get_report(report_id: str, db: Session = Depends(get_db)):
    report = db.query(PotholeReport).filter(PotholeReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    return serialize_report(report)


@router.get("/{report_id}/evidence/{evidence_id}")
async def get_report_evidence(report_id: str, evidence_id: str, db: Session = Depends(get_db)):
    evidence = (
        db.query(EvidenceFile)
        .filter(EvidenceFile.id == evidence_id, EvidenceFile.report_id == report_id)
        .first()
    )
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found for this report.")
    path = Path(evidence.storage_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Evidence file missing from storage.")
    suffix = path.suffix.lower()
    media_types = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    return FileResponse(str(path), media_type=media_types.get(suffix, "application/octet-stream"))


@router.patch("/{report_id}/location")
async def update_report_location(report_id: str, payload: RelocateRequest, db: Session = Depends(get_db)):
    report = db.query(PotholeReport).filter(PotholeReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    if report.pothole_id is not None:
        raise HTTPException(
            status_code=409,
            detail="Report is already attached to a canonical pothole; location changes must go through review.",
        )
    try:
        updated = relocate_report(db, report, payload.latitude, payload.longitude, payload.accuracy_m)
    except PotholeReportError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return serialize_report(updated)
