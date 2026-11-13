from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel
import datetime


class DetectionSchema(BaseModel):
    id: str
    analysis_id: str
    class_name: str
    class_id: int
    confidence: float
    bbox_x1: float
    bbox_y1: float
    bbox_x2: float
    bbox_y2: float
    width_px: Optional[float] = None
    height_px: Optional[float] = None
    area_px: Optional[float] = None
    severity_level: Optional[str] = None
    severity_score: Optional[float] = None

    class Config:
        from_attributes = True
