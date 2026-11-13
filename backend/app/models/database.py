from sqlalchemy import Column, String, DateTime, Float, Integer, Text, Boolean, JSON, ForeignKey
from sqlalchemy.orm import relationship
from app.database.base import Base, gen_uuid, now_utc


class Inspection(Base):
    __tablename__ = "inspections"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    created_at = Column(DateTime, default=now_utc, nullable=False)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc, nullable=False)
    status = Column(String(32), default="pending", nullable=False)  # pending | processing | completed | failed
    image_path = Column(Text, nullable=True)
    original_filename = Column(String(255), nullable=True)
    file_size = Column(Integer, nullable=True)  # bytes
    notes = Column(Text, nullable=True)

    analyses = relationship("Analysis", back_populates="inspection", cascade="all, delete-orphan")


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    inspection_id = Column(String(36), ForeignKey("inspections.id"), nullable=False)
    status = Column(String(32), default="pending", nullable=False)  # pending | processing | completed | failed
    pipeline_stage = Column(String(64), nullable=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    result_json = Column(Text, nullable=True)

    inspection = relationship("Inspection", back_populates="analyses")
    detections = relationship("Detection", back_populates="analysis", cascade="all, delete-orphan")


class Detection(Base):
    __tablename__ = "detections"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    analysis_id = Column(String(36), ForeignKey("analyses.id"), nullable=False)
    class_name = Column(String(64), nullable=False)
    class_id = Column(Integer, nullable=False)
    confidence = Column(Float, nullable=False)
    bbox_x1 = Column(Float, nullable=False)
    bbox_y1 = Column(Float, nullable=False)
    bbox_x2 = Column(Float, nullable=False)
    bbox_y2 = Column(Float, nullable=False)
    width_px = Column(Float, nullable=True)
    height_px = Column(Float, nullable=True)
    area_px = Column(Float, nullable=True)
    severity_level = Column(String(16), nullable=True)  # LOW | MODERATE | HIGH | CRITICAL
    severity_score = Column(Float, nullable=True)
    severity_factors = Column(JSON, nullable=True)
    possible_causes = Column(JSON, nullable=True)
    recommended_actions = Column(JSON, nullable=True)

    analysis = relationship("Analysis", back_populates="detections")


class TrainingJob(Base):
    __tablename__ = "training_jobs"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    job_type = Column(String(32), nullable=False)  # detection | authenticity
    status = Column(String(32), default="pending", nullable=False)  # pending | running | completed | failed
    config = Column(JSON, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    metrics = Column(JSON, nullable=True)
    logs = Column(Text, nullable=True)
    model_path = Column(Text, nullable=True)


class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    inspection_id = Column(String(36), ForeignKey("inspections.id", ondelete="CASCADE"), nullable=False)
    detection_id = Column(String(36), ForeignKey("detections.id", ondelete="CASCADE"), nullable=True)
    is_correct = Column(Boolean, nullable=False)
    user_label = Column(String(64), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=now_utc, nullable=False)


class VideoJob(Base):
    __tablename__ = "video_jobs"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    status = Column(String(32), default="pending", nullable=False)  # pending | processing | completed | failed | rejected
    pipeline_stage = Column(String(64), nullable=True)
    progress = Column(Integer, default=0, nullable=False)
    original_filename = Column(String(255), nullable=True)
    stored_path = Column(Text, nullable=True)
    file_size = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    fps = Column(Float, nullable=True)
    total_frames = Column(Integer, nullable=True)
    sampled_frames = Column(Integer, nullable=True)
    processed_frames = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=now_utc, nullable=False)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    result_json = Column(Text, nullable=True)


class Pothole(Base):
    """Canonical pothole record. Created only from a located, evidence-backed report."""

    __tablename__ = "potholes"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    code = Column(String(32), unique=True, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location_accuracy_m = Column(Float, nullable=True)
    primary_severity = Column(String(16), nullable=True)
    status = Column(String(24), default="reported", nullable=False)
    report_count = Column(Integer, default=0, nullable=False)
    first_reported_at = Column(DateTime, nullable=True)
    last_reported_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=now_utc, nullable=False)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc, nullable=False)

    reports = relationship("PotholeReport", back_populates="pothole", cascade="all, delete-orphan")
    locations = relationship("PotholeLocation", back_populates="pothole", cascade="all, delete-orphan")
    status_history = relationship(
        "PotholeStatusHistory",
        back_populates="pothole",
        cascade="all, delete-orphan",
        order_by="PotholeStatusHistory.created_at",
    )


class PotholeReport(Base):
    """Every submission is preserved, whether or not it was merged."""

    __tablename__ = "pothole_reports"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    pothole_id = Column(String(36), ForeignKey("potholes.id", ondelete="SET NULL"), nullable=True)
    idempotency_key = Column(String(128), unique=True, nullable=True)
    reporter_id = Column(String(64), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    accuracy_m = Column(Float, nullable=True)
    location_status = Column(String(32), default="pending_location_verification", nullable=False)
    location_note = Column(Text, nullable=True)
    captured_at = Column(DateTime, nullable=True)
    source_type = Column(String(16), default="image", nullable=False)
    source_ref = Column(String(64), nullable=True)
    description = Column(Text, nullable=True)
    detection_class = Column(String(64), nullable=True)
    detection_confidence = Column(Float, nullable=True)
    severity_level = Column(String(16), nullable=True)
    visual_descriptor = Column(JSON, nullable=True)
    match_decision = Column(String(16), nullable=True)
    match_score = Column(Float, nullable=True)
    match_signals = Column(JSON, nullable=True)
    match_reason = Column(Text, nullable=True)
    status = Column(String(32), default="received", nullable=False)
    created_at = Column(DateTime, default=now_utc, nullable=False)

    pothole = relationship("Pothole", back_populates="reports")
    evidence = relationship("EvidenceFile", back_populates="report", cascade="all, delete-orphan")


class EvidenceFile(Base):
    __tablename__ = "evidence_files"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    report_id = Column(String(36), ForeignKey("pothole_reports.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String(32), default="original_image", nullable=False)
    storage_path = Column(Text, nullable=False)
    sha256 = Column(String(64), nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    size_bytes = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=now_utc, nullable=False)

    report = relationship("PotholeReport", back_populates="evidence")


class PotholeLocation(Base):
    __tablename__ = "pothole_locations"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    pothole_id = Column(String(36), ForeignKey("potholes.id", ondelete="CASCADE"), nullable=False)
    report_id = Column(String(36), ForeignKey("pothole_reports.id", ondelete="SET NULL"), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    accuracy_m = Column(Float, nullable=True)
    is_primary = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=now_utc, nullable=False)

    pothole = relationship("Pothole", back_populates="locations")


class PotholeStatusHistory(Base):
    __tablename__ = "pothole_status_history"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    pothole_id = Column(String(36), ForeignKey("potholes.id", ondelete="CASCADE"), nullable=False)
    from_status = Column(String(24), nullable=True)
    to_status = Column(String(24), nullable=False)
    reason = Column(Text, nullable=True)
    actor = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=now_utc, nullable=False)

    pothole = relationship("Pothole", back_populates="status_history")
