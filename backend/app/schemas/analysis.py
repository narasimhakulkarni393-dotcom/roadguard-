from __future__ import annotations
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field
import datetime


# ---------------------------------------------------------------------------
# Common primitives
# ---------------------------------------------------------------------------

class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


# ---------------------------------------------------------------------------
# Stage 1 – Image info
# ---------------------------------------------------------------------------

class ImageInfo(BaseModel):
    filename: str
    file_size_bytes: int
    width: int
    height: int
    format: str
    mode: str
    md5_hash: str
    blur_score: float
    is_blurry: bool
    brightness: float
    exposure_quality: str  # underexposed | normal | overexposed
    exif_orientation_corrected: bool


# ---------------------------------------------------------------------------
# Stage 2 – Authenticity
# ---------------------------------------------------------------------------

class AuthenticityResult(BaseModel):
    verdict: str  # natural | ai_generated | manipulated | uncertain
    confidence: float  # 0.0 – 1.0
    model_used: str  # heuristic | ml_model
    factors: Dict[str, Any]
    limitations: List[str]


# ---------------------------------------------------------------------------
# Stage 3 – Quality
# ---------------------------------------------------------------------------

class QualityResult(BaseModel):
    is_acceptable: bool
    issues: List[str]
    score: float  # 0 – 100


# ---------------------------------------------------------------------------
# Stage 4 – Detection item (single detection)
# ---------------------------------------------------------------------------

class MeasurementResult(BaseModel):
    width_pixels: float
    height_pixels: float
    area_pixels: float
    shape_ratio: float
    relative_area: float
    measurement_method: str
    real_world_width_m: Optional[float] = None
    real_world_height_m: Optional[float] = None
    limitation: str


class SeverityFactor(BaseModel):
    name: str
    value: float
    max_value: float
    contribution: float
    description: str


class SeverityResult(BaseModel):
    level: str  # LOW | MODERATE | HIGH | CRITICAL
    score: float  # 0 – 100
    factors: List[SeverityFactor]


class CauseItem(BaseModel):
    cause: str
    likelihood: str  # likely | possible | speculative
    supporting_observations: List[str]
    recommended_inspection: str


class DetectionItem(BaseModel):
    detection_id: str
    class_id: int
    class_name: str
    display_name: str
    confidence: float
    bbox: BoundingBox
    measurements: MeasurementResult
    severity: SeverityResult
    possible_causes: List[CauseItem]
    recommended_actions: List[str]


# ---------------------------------------------------------------------------
# Stage 5 – Summary
# ---------------------------------------------------------------------------

class AnalysisSummary(BaseModel):
    total_detections: int
    damage_classes_found: List[str]
    overall_severity: str
    overall_severity_score: float
    road_condition: str  # good | fair | poor | critical
    immediate_action_required: bool
    priority_issues: List[str]


# ---------------------------------------------------------------------------
# Full analysis response
# ---------------------------------------------------------------------------

class AnalysisResponse(BaseModel):
    analysis_id: str
    inspection_id: str
    status: str
    pipeline_stage: Optional[str] = None
    created_at: datetime.datetime
    completed_at: Optional[datetime.datetime] = None
    image_info: Optional[ImageInfo] = None
    authenticity: Optional[AuthenticityResult] = None
    quality: Optional[QualityResult] = None
    model_ready: bool = False
    detections: List[DetectionItem] = Field(default_factory=list)
    annotated_image_url: Optional[str] = None
    summary: Optional[AnalysisSummary] = None


class AnalysisStatusResponse(BaseModel):
    analysis_id: str
    status: str
    pipeline_stage: Optional[str] = None
    result_url: str
    created_at: datetime.datetime
