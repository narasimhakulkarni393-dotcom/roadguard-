"""Dependency-free multi-object tracker for video road-defect detections.

Greedy matching by IoU with a centroid-distance fallback. This is a deliberate
heuristic: it is deterministic, explainable, and needs no external tracking
library. It is not ByteTrack/DeepSORT and is documented as such.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Sequence

BBox = tuple[float, float, float, float]


def iou(a: Sequence[float], b: Sequence[float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter_w = max(0.0, min(ax2, bx2) - max(ax1, bx1))
    inter_h = max(0.0, min(ay2, by2) - max(ay1, by1))
    inter = inter_w * inter_h
    if inter <= 0.0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def centroid(bbox: Sequence[float]) -> tuple[float, float]:
    return ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0)


def _centroid_ratio(a: Sequence[float], b: Sequence[float], diag: float) -> float:
    ax, ay = centroid(a)
    bx, by = centroid(b)
    dist = ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5
    return dist / max(1.0, diag)


@dataclass
class TrackedDetection:
    bbox: BBox
    confidence: float
    class_name: str


@dataclass
class Track:
    track_id: int
    class_name: str
    bbox: BBox
    first_frame: int
    last_frame: int
    hits: int = 1
    confidence_sum: float = 0.0
    best_confidence: float = 0.0
    best_bbox: BBox = field(default_factory=lambda: (0.0, 0.0, 0.0, 0.0))
    best_frame: int = 0

    @property
    def mean_confidence(self) -> float:
        return self.confidence_sum / self.hits if self.hits else 0.0

    def observe(self, det: TrackedDetection, frame_index: int) -> None:
        self.bbox = det.bbox
        self.last_frame = frame_index
        self.hits += 1
        self.confidence_sum += det.confidence
        if det.confidence > self.best_confidence:
            self.best_confidence = det.confidence
            self.best_bbox = det.bbox
            self.best_frame = frame_index


class IouCentroidTracker:
    def __init__(
        self,
        iou_threshold: float = 0.30,
        max_centroid_ratio: float = 0.12,
        max_age_frames: int = 4,
        frame_diagonal: float = 1.0,
    ) -> None:
        self.iou_threshold = iou_threshold
        self.max_centroid_ratio = max_centroid_ratio
        self.max_age_frames = max_age_frames
        self.frame_diagonal = frame_diagonal
        self.tracks: dict[int, Track] = {}
        self.finished: list[Track] = []
        self._next_id = 1

    def update(self, detections: Iterable[TrackedDetection], frame_index: int) -> dict[int, TrackedDetection]:
        """Associate one frame of detections. Returns track_id -> detection."""
        detections = sorted(detections, key=lambda d: d.confidence, reverse=True)
        assigned: dict[int, TrackedDetection] = {}
        claimed: set[int] = set()

        for det in detections:
            best_track: Track | None = None
            best_score = -1.0
            for track in self.tracks.values():
                if track.track_id in claimed or track.class_name != det.class_name:
                    continue
                if frame_index - track.last_frame > self.max_age_frames:
                    continue
                overlap = iou(track.bbox, det.bbox)
                if overlap >= self.iou_threshold:
                    score = 1.0 + overlap
                else:
                    ratio = _centroid_ratio(track.bbox, det.bbox, self.frame_diagonal)
                    if ratio > self.max_centroid_ratio:
                        continue
                    score = 1.0 - ratio
                if score > best_score:
                    best_score = score
                    best_track = track

            if best_track is None:
                track = Track(
                    track_id=self._next_id,
                    class_name=det.class_name,
                    bbox=det.bbox,
                    first_frame=frame_index,
                    last_frame=frame_index,
                    best_confidence=det.confidence,
                    best_bbox=det.bbox,
                    best_frame=frame_index,
                )
                track.confidence_sum = det.confidence
                self.tracks[track.track_id] = track
                self._next_id += 1
                assigned[track.track_id] = det
            else:
                best_track.observe(det, frame_index)
                claimed.add(best_track.track_id)
                assigned[best_track.track_id] = det

        expired = [
            tid
            for tid, track in self.tracks.items()
            if frame_index - track.last_frame > self.max_age_frames
        ]
        for tid in expired:
            self.finished.append(self.tracks.pop(tid))

        return assigned

    def confirmed_tracks(self, min_hits: int) -> list[Track]:
        candidates = list(self.tracks.values()) + self.finished
        return sorted(
            (t for t in candidates if t.hits >= min_hits),
            key=lambda t: t.track_id,
        )
