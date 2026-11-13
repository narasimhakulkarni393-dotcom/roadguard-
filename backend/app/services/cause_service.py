"""Stage 7 — Rule-based cause analysis."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass
class CauseEntry:
    cause: str
    likelihood: str  # likely | possible | speculative
    supporting_observations: List[str]
    recommended_inspection: str


# Cause knowledge base — keyed by class_name
CAUSE_KB: dict[str, List[dict]] = {
    "Pothole": [
        {
            "cause": "Water infiltration and freeze-thaw cycles",
            "likelihood": "likely",
            "observations": [
                "Potholes commonly form in climates with seasonal freeze-thaw.",
                "Water weakens sub-base, causing surface collapse under traffic.",
            ],
            "inspection": "Check drainage, sub-base moisture levels, and local climate history.",
        },
        {
            "cause": "Heavy traffic load exceeding pavement design capacity",
            "likelihood": "possible",
            "observations": [
                "Repeated heavy-vehicle passes accelerate fatigue cracking that evolves into potholes.",
            ],
            "inspection": "Review traffic counts and vehicle weight records for the road segment.",
        },
        {
            "cause": "Delamination of asphalt layers",
            "likelihood": "possible",
            "observations": [
                "Poor bonding between layers can allow water ingress and spalling.",
            ],
            "inspection": "Core sample extraction to assess layer adhesion.",
        },
    ],
    "Alligator Crack": [
        {
            "cause": "Structural fatigue from repeated loading",
            "likelihood": "likely",
            "observations": [
                "Alligator (fatigue) cracking is a classic sign of pavement structural failure.",
                "Pattern resembles alligator scales due to interlocking cracks.",
            ],
            "inspection": "Deflection testing (FWD) to assess structural capacity.",
        },
        {
            "cause": "Insufficient pavement thickness or base failure",
            "likelihood": "likely",
            "observations": [
                "Thin pavements over weak bases fail in this characteristic pattern under load.",
            ],
            "inspection": "Ground-penetrating radar or core samples to measure pavement depth and base condition.",
        },
        {
            "cause": "Aged/oxidised binder",
            "likelihood": "possible",
            "observations": [
                "Over time, asphalt binder becomes brittle, reducing resistance to fatigue.",
            ],
            "inspection": "Extract bitumen samples for laboratory binder testing.",
        },
    ],
    "Longitudinal Crack": [
        {
            "cause": "Joint reflective cracking",
            "likelihood": "likely",
            "observations": [
                "Cracks often reflect paving joint positions from underlying layers.",
            ],
            "inspection": "Map crack location vs known paving joints; core at crack for confirmation.",
        },
        {
            "cause": "Differential settlement of sub-base",
            "likelihood": "possible",
            "observations": [
                "Longitudinal cracks along road edges often indicate edge drop or shoulder settlement.",
            ],
            "inspection": "Survey road profile; check sub-base compaction near edges.",
        },
        {
            "cause": "Thermal shrinkage (low-temperature cracking)",
            "likelihood": "possible",
            "observations": [
                "In cold regions, rapid temperature drops cause asphalt to contract and crack longitudinally.",
            ],
            "inspection": "Review pavement grade specifications and local minimum temperature records.",
        },
    ],
    "Transverse Crack": [
        {
            "cause": "Thermal shrinkage / low-temperature cracking",
            "likelihood": "likely",
            "observations": [
                "Transverse cracks running perpendicular to traffic direction are a hallmark of thermal cracking.",
            ],
            "inspection": "Measure crack spacing; compare with thermal crack spacing models for the region.",
        },
        {
            "cause": "Reflective cracking from underlying concrete or old pavement",
            "likelihood": "possible",
            "observations": [
                "Overlay cracking often reflects joints or cracks in the underlying rigid pavement.",
            ],
            "inspection": "GPR survey to locate underlying joints or cracks.",
        },
        {
            "cause": "Construction defects (poor rolling, segregation)",
            "likelihood": "speculative",
            "observations": [
                "Localised transverse cracks near paving starts/stops can indicate construction irregularities.",
            ],
            "inspection": "Review as-built records; core sample at crack.",
        },
    ],
}

DISCLAIMER = (
    "IMPORTANT: These causes are inferred from visual patterns and general engineering knowledge only. "
    "Visual inspection cannot definitively determine root causes. Physical testing is required for certainty."
)


def analyse_causes(class_name: str) -> List[CauseEntry]:
    entries = CAUSE_KB.get(class_name, [])
    result = []
    for e in entries:
        result.append(CauseEntry(
            cause=e["cause"],
            likelihood=e["likelihood"],
            supporting_observations=e["observations"] + [DISCLAIMER],
            recommended_inspection=e["inspection"],
        ))
    return result


def get_recommended_actions(class_name: str, severity_level: str) -> List[str]:
    base = {
        "LOW": ["Monitor during next inspection cycle.", "Document location for trend analysis."],
        "MODERATE": ["Schedule maintenance within 3 months.", "Implement crack sealing to prevent water ingress."],
        "HIGH": ["Schedule repair within 1 month.", "Restrict heavy vehicle access if possible.", "Implement temporary patching."],
        "CRITICAL": [
            "IMMEDIATE ATTENTION REQUIRED.",
            "Consider road closure or traffic restriction.",
            "Emergency patching should be performed within days.",
            "Full structural assessment by certified engineer recommended.",
        ],
    }
    type_specific = {
        "Pothole": ["Fill pothole with hot-mix asphalt patching compound.", "Ensure proper compaction and sealing after repair."],
        "Alligator Crack": ["Full-depth reclamation or structural overlay may be required.", "Address root cause (drainage, load) before surfacing."],
        "Longitudinal Crack": ["Rout and seal cracks to prevent water ingress.", "Monitor for widening."],
        "Transverse Crack": ["Apply crack sealant.", "Consider stress-absorbing membrane interlayer on future overlays."],
    }
    actions = base.get(severity_level, base["MODERATE"]) + type_specific.get(class_name, [])
    return actions
