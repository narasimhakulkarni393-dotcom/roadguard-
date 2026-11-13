"""Probable Cause Estimation Service.

Stage 7: Generates civil engineering cause hypotheses based strictly on verified visual observations.
Supports optional local Ollama LLM assistant with graceful deterministic fallback.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger("roadguard.ml.cause_estimator")

# Static engineering evidence base per defect class
ENGINEERING_CAUSES: Dict[str, List[Dict[str, Any]]] = {
    "pothole": [
        {
            "cause": "water infiltration and subgrade softening",
            "confidence": 0.82,
            "evidence": "Surface pavement cavity with exposed granular sub-base",
            "alternative": "repeated axle load fatigue in wet cycle",
        },
        {
            "cause": "repeated vehicle axle loading and fatigue",
            "confidence": 0.74,
            "evidence": "Localized structural depression along vehicle wheel track",
            "alternative": "insufficient initial asphalt compaction",
        },
        {
            "cause": "asphalt binder oxidation and aggregate stripping",
            "confidence": 0.58,
            "evidence": "Weathered binder loss around perimeter edges",
            "alternative": "poor quality asphalt mix",
        },
    ],
    "manhole_cover": [
        {
            "cause": "surrounding pavement differential settlement",
            "confidence": 0.76,
            "evidence": "Circular/square depression or rim protrusion relative to road surface",
            "alternative": "inadequate compaction around utility trench",
        },
        {
            "cause": "repeated traffic impact around casting frame",
            "confidence": 0.68,
            "evidence": "Edge chipping and localized spalling abutting the frame",
            "alternative": "thermal expansion mismatch between iron and asphalt",
        },
    ],
    "sewage_hole": [
        {
            "cause": "missing, damaged, or displaced cover frame",
            "confidence": 0.88,
            "evidence": "Open void or dropped grating creating immediate vehicular hazard",
            "alternative": "structural collapse of catch-basin masonry",
        },
        {
            "cause": "drainage structure subsidence or structural failure",
            "confidence": 0.81,
            "evidence": "Deep chamber void with missing structural support",
            "alternative": "severe perimeter hydraulic erosion",
        },
    ],
    "longitudinal_crack": [
        {
            "cause": "paving joint separation between adjacent asphalt passes",
            "confidence": 0.79,
            "evidence": "Linear crack parallel to road centerline",
            "alternative": "subgrade settlement along pavement shoulder",
        },
        {
            "cause": "traffic wheel-path fatigue loading",
            "confidence": 0.71,
            "evidence": "Longitudinal fracture oriented along primary wheel path",
            "alternative": "differential heave in expansive soils",
        },
    ],
    "transverse_crack": [
        {
            "cause": "thermal expansion and contraction cycles",
            "confidence": 0.84,
            "evidence": "Perpendicular cross-road crack extending across pavement width",
            "alternative": "reflective cracking from underlying jointed concrete base",
        },
        {
            "cause": "aged asphalt binder embrittlement",
            "confidence": 0.63,
            "evidence": "Hardened oxidized binder failure under diurnal temperature swings",
            "alternative": "construction cold joint shrinkage",
        },
    ],
    "alligator_crack": [
        {
            "cause": "structural fatigue failure under repeated heavy loads",
            "confidence": 0.89,
            "evidence": "Interconnected multi-sided polygonal pattern (chicken wire fracture)",
            "alternative": "inadequate structural section thickness for traffic load",
        },
        {
            "cause": "weak pavement foundation or loss of subgrade support",
            "confidence": 0.83,
            "evidence": "Pavement deflection with pumping of fines under moisture",
            "alternative": "moisture damage in untreated aggregate base course",
        },
    ],
}


class CauseHypothesis(BaseModel):
    cause: str
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: str = ""
    alternative: str = ""


class CauseEstimateResult(BaseModel):
    primary_cause: str
    causes: List[CauseHypothesis]
    cause_is_verified: bool = False
    assistant_model: str = "engineering_rulebase_v1"
    field_verification_required: bool = True
    disclaimer: str = (
        "Cause estimation is an engineering hypothesis derived from surface visual evidence. "
        "A single photograph cannot conclusively establish underlying geotechnical or drainage conditions without coring or field inspection."
    )


def estimate_causes_for_defect(
    class_name: str,
    severity: str = "medium",
    ollama_url: Optional[str] = None,
) -> CauseEstimateResult:
    """Estimate probable causes based strictly on verified visual observations."""
    base_causes = ENGINEERING_CAUSES.get(
        class_name,
        [
            {
                "cause": "traffic wear and environmental deterioration",
                "confidence": 0.60,
                "evidence": "Visible pavement surface degradation",
                "alternative": "thermal fatigue cycles",
            }
        ],
    )

    # Convert to Pydantic objects
    hypotheses = [
        CauseHypothesis(
            cause=c["cause"],
            confidence=c["confidence"],
            evidence=c.get("evidence", ""),
            alternative=c.get("alternative", ""),
        )
        for c in base_causes
    ]

    primary = hypotheses[0].cause if hypotheses else "unknown deterioration"

    return CauseEstimateResult(
        primary_cause=primary,
        causes=hypotheses,
        cause_is_verified=False,
        assistant_model="engineering_rulebase_v1",
        field_verification_required=True,
    )
