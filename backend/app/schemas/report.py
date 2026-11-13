from __future__ import annotations
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
import datetime


class ReportSummary(BaseModel):
    analysis_id: str
    inspection_id: str
    created_at: datetime.datetime
    total_detections: int
    overall_severity: str
    road_condition: str
    immediate_action_required: bool


class ReportResponse(BaseModel):
    report_id: str
    analysis_id: str
    created_at: datetime.datetime
    report_path: Optional[str] = None
    summary: Optional[ReportSummary] = None
