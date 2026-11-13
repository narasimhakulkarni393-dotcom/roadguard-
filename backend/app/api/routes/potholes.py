"""Canonical pothole records: list, detail and lifecycle."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.routes.pothole_reports import serialize_report
from app.core.auth import verify_api_key
from app.database.session import get_db
from app.models.database import Pothole
from app.services.pothole_report_service import PotholeReportError, transition_status

router = APIRouter(
    prefix="/api/v1/potholes",
    tags=["potholes"],
    dependencies=[Depends(verify_api_key)],
)


class StatusChangeRequest(BaseModel):
    status: str = Field(..., max_length=24)
    reason: Optional[str] = Field(default=None, max_length=1000)
    actor: Optional[str] = Field(default=None, max_length=64)


def serialize_pothole(pothole: Pothole, include_reports: bool = False) -> dict:
    payload = {
        "pothole_id": pothole.id,
        "code": pothole.code,
        "status": pothole.status,
        "severity": pothole.primary_severity,
        "latitude": pothole.latitude,
        "longitude": pothole.longitude,
        "location_accuracy_m": pothole.location_accuracy_m,
        "report_count": pothole.report_count,
        "first_reported_at": pothole.first_reported_at.isoformat() if pothole.first_reported_at else None,
        "last_reported_at": pothole.last_reported_at.isoformat() if pothole.last_reported_at else None,
        "created_at": pothole.created_at.isoformat() if pothole.created_at else None,
        "status_history": [
            {
                "from": h.from_status,
                "to": h.to_status,
                "reason": h.reason,
                "actor": h.actor,
                "at": h.created_at.isoformat() if h.created_at else None,
            }
            for h in pothole.status_history
        ],
    }
    if include_reports:
        payload["reports"] = [serialize_report(r) for r in pothole.reports]
        payload["locations"] = [
            {
                "latitude": loc.latitude,
                "longitude": loc.longitude,
                "accuracy_m": loc.accuracy_m,
                "is_primary": loc.is_primary,
                "report_id": loc.report_id,
                "at": loc.created_at.isoformat() if loc.created_at else None,
            }
            for loc in pothole.locations
        ]
    return payload


@router.get("")
async def list_potholes(
    status: Optional[str] = Query(None),
    min_lat: Optional[float] = Query(None),
    max_lat: Optional[float] = Query(None),
    min_lon: Optional[float] = Query(None),
    max_lon: Optional[float] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(Pothole)
    if status:
        query = query.filter(Pothole.status == status)
    if min_lat is not None and max_lat is not None:
        query = query.filter(Pothole.latitude.between(min_lat, max_lat))
    if min_lon is not None and max_lon is not None:
        query = query.filter(Pothole.longitude.between(min_lon, max_lon))
    total = query.count()
    potholes = (
        query.order_by(Pothole.last_reported_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [serialize_pothole(p) for p in potholes],
    }


@router.get("/{pothole_id}")
async def get_pothole(pothole_id: str, db: Session = Depends(get_db)):
    pothole = db.query(Pothole).filter(Pothole.id == pothole_id).first()
    if not pothole:
        raise HTTPException(status_code=404, detail="Pothole not found.")
    return serialize_pothole(pothole, include_reports=True)


@router.post("/{pothole_id}/status")
async def change_pothole_status(pothole_id: str, payload: StatusChangeRequest, db: Session = Depends(get_db)):
    pothole = db.query(Pothole).filter(Pothole.id == pothole_id).first()
    if not pothole:
        raise HTTPException(status_code=404, detail="Pothole not found.")
    try:
        updated = transition_status(db, pothole, payload.status, payload.reason, payload.actor)
    except PotholeReportError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return serialize_pothole(updated, include_reports=True)
