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
