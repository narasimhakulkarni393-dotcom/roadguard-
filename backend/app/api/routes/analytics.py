"""Analytics routes for RoadGuard AI."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.database import Analysis, Detection, Inspection, TrainingJob

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@router.get("/overview")
@router.get("/summary")
async def analytics_overview(db: Session = Depends(get_db)):
    total_inspections = db.query(func.count(Inspection.id)).scalar() or 0
    completed = db.query(func.count(Analysis.id)).filter(Analysis.status == "completed").scalar() or 0
    total_detections = db.query(func.count(Detection.id)).scalar() or 0

    potholes = db.query(func.count(Detection.id)).filter(
        Detection.class_name.ilike("%pothole%")
    ).scalar() or 0

    cracks = db.query(func.count(Detection.id)).filter(
        Detection.class_name.ilike("%crack%")
    ).scalar() or 0

    high_priority = db.query(func.count(Detection.id)).filter(
        Detection.severity_level.in_(["HIGH", "CRITICAL"])
    ).scalar() or 0

    # Class distribution
    class_dist = (
        db.query(Detection.class_name, func.count(Detection.id))
        .group_by(Detection.class_name)
        .all()
    )

    # Severity distribution
    sev_dist = (
        db.query(Detection.severity_level, func.count(Detection.id))
        .group_by(Detection.severity_level)
        .all()
    )

    # Recent inspections
    recent_inspections = (
        db.query(Inspection)
        .order_by(Inspection.created_at.desc())
        .limit(5)
        .all()
    )

    return {
        "total_inspections": total_inspections,
        "completed_analyses": completed,
        "total_detections": total_detections,
        "potholes_detected": potholes,
        "cracks_detected": cracks,
        "high_priority_defects": high_priority,
        "damage_distribution": [
            {"name": row[0], "count": row[1]} for row in class_dist
        ],
        "severity_distribution": [
            {"level": row[0] or "LOW", "count": row[1]} for row in sev_dist
        ],
        "recent_inspections": [
            {
                "id": i.id,
                "filename": i.original_filename,
                "status": i.status,
                "created_at": i.created_at.isoformat() if i.created_at else None,
            }
            for i in recent_inspections
        ],
    }
