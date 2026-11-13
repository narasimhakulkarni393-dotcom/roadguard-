"""Duplicate pothole report identification.

Decision policy:
- MATCH      needs a strong combined score AND a strong visual score.
- UNCERTAIN  is routed to human review, never auto-merged.
- NO_MATCH   creates a new canonical pothole.

Proximity alone can never produce MATCH.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.core.config import settings
from app.services.geo import effective_search_radius_m, haversine_m
from app.services.visual_descriptor import cosine_similarity, shape_similarity

MATCH = "MATCH"
NO_MATCH = "NO_MATCH"
UNCERTAIN = "UNCERTAIN"


@dataclass
class MatchCandidate:
    pothole_id: str
    latitude: float
    longitude: float
    accuracy_m: Optional[float]
    descriptor: Optional[dict]
    report_count: int = 0


@dataclass
class MatchSignals:
    distance_m: float
    radius_m: float
    distance_score: float
    visual_similarity: float
    shape_similarity: float
    combined_score: float

    def to_dict(self) -> dict:
        return {
            "distance_m": round(self.distance_m, 2),
            "radius_m": round(self.radius_m, 2),
            "distance_score": round(self.distance_score, 4),
            "visual_similarity": round(self.visual_similarity, 4),
            "shape_similarity": round(self.shape_similarity, 4),
            "combined_score": round(self.combined_score, 4),
        }


@dataclass
class MatchResult:
    decision: str
    score: float
    best_pothole_id: Optional[str]
    signals: Optional[MatchSignals]
    candidates_considered: int
    reason: str

    def to_dict(self) -> dict:
        return {
            "decision": self.decision,
            "score": round(self.score, 4),
            "best_pothole_id": self.best_pothole_id,
            "candidates_considered": self.candidates_considered,
            "reason": self.reason,
            "signals": self.signals.to_dict() if self.signals else None,
            "policy": {
                "match_threshold": settings.MATCH_THRESHOLD,
                "review_threshold": settings.MATCH_REVIEW_THRESHOLD,
                "min_visual_similarity": settings.MATCH_MIN_VISUAL_SIMILARITY,
                "weights": {
                    "distance": settings.MATCH_WEIGHT_DISTANCE,
                    "visual": settings.MATCH_WEIGHT_VISUAL,
                    "shape": settings.MATCH_WEIGHT_SHAPE,
                },
            },
        }


def evaluate_candidates(
    latitude: float,
    longitude: float,
    accuracy_m: Optional[float],
    descriptor: Optional[dict],
    candidates: list[MatchCandidate],
) -> MatchResult:
    descriptor = descriptor or {}
    candidate_vector = descriptor.get("vector")
    candidate_aspect = float(descriptor.get("aspect_ratio") or 0.0)

    best: Optional[tuple[MatchCandidate, MatchSignals]] = None
    considered = 0

    for candidate in candidates:
        radius = effective_search_radius_m(
            accuracy_m,
            candidate.accuracy_m,
            settings.MATCH_BASE_RADIUS_M,
            settings.MATCH_MIN_RADIUS_M,
            settings.MATCH_MAX_RADIUS_M,
        )
        distance = haversine_m(latitude, longitude, candidate.latitude, candidate.longitude)
        if distance > radius:
            continue
        considered += 1

        cand_descriptor = candidate.descriptor or {}
        visual = cosine_similarity(candidate_vector or [], cand_descriptor.get("vector") or [])
        shape = shape_similarity(candidate_aspect, float(cand_descriptor.get("aspect_ratio") or 0.0))
        distance_score = max(0.0, 1.0 - distance / radius)
        combined = (
            settings.MATCH_WEIGHT_DISTANCE * distance_score
            + settings.MATCH_WEIGHT_VISUAL * visual
            + settings.MATCH_WEIGHT_SHAPE * shape
        )
        signals = MatchSignals(
            distance_m=distance,
            radius_m=radius,
            distance_score=distance_score,
            visual_similarity=visual,
            shape_similarity=shape,
            combined_score=combined,
        )
        if best is None or combined > best[1].combined_score:
            best = (candidate, signals)

    if best is None:
        return MatchResult(NO_MATCH, 0.0, None, None, considered, "No canonical pothole within the search radius.")

    candidate, signals = best
    if not candidate_vector:
        return MatchResult(
            UNCERTAIN,
            signals.combined_score,
            candidate.pothole_id,
            signals,
            considered,
            "No visual descriptor available for the submitted evidence; proximity alone cannot confirm a duplicate.",
        )

    if signals.combined_score >= settings.MATCH_THRESHOLD and signals.visual_similarity >= settings.MATCH_MIN_VISUAL_SIMILARITY:
        return MatchResult(
            MATCH,
            signals.combined_score,
            candidate.pothole_id,
            signals,
            considered,
            "Combined geographic and visual similarity passed both gates.",
        )

    if signals.combined_score >= settings.MATCH_REVIEW_THRESHOLD:
        return MatchResult(
            UNCERTAIN,
            signals.combined_score,
            candidate.pothole_id,
            signals,
            considered,
            "Candidate is plausible but below the auto-match threshold; queued for review.",
        )

    return MatchResult(NO_MATCH, signals.combined_score, None, signals, considered, "Best candidate scored below the review threshold.")
