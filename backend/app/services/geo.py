"""Geospatial helpers for pothole reports.

Coordinates are never invented: missing or unusable GPS produces a report that
stays pending location verification instead of a guessed position.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

EARTH_RADIUS_M = 6_371_008.8
METERS_PER_DEGREE_LAT = 111_320.0


@dataclass
class LocationAssessment:
    status: str  # ok | pending | invalid
    latitude: Optional[float]
    longitude: Optional[float]
    accuracy_m: Optional[float]
    reason: Optional[str] = None


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = phi2 - phi1
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def effective_search_radius_m(
    accuracy_a: Optional[float],
    accuracy_b: Optional[float],
    base_radius_m: float,
    min_radius_m: float,
    max_radius_m: float,
) -> float:
    """Grow the candidate radius by reported GPS uncertainty, within bounds."""
    radius = base_radius_m + (accuracy_a or 0.0) + (accuracy_b or 0.0)
    return float(min(max_radius_m, max(min_radius_m, radius)))


def lat_lon_bounds(latitude: float, longitude: float, radius_m: float) -> tuple[float, float, float, float]:
    """Approximate degree bounding box for a radius. Used for candidate SQL filters."""
    d_lat = radius_m / METERS_PER_DEGREE_LAT
    cos_lat = max(1e-6, abs(math.cos(math.radians(latitude))))
    d_lon = radius_m / (METERS_PER_DEGREE_LAT * cos_lat)
    return latitude - d_lat, latitude + d_lat, longitude - d_lon, longitude + d_lon


def assess_location(
    latitude: Optional[float],
    longitude: Optional[float],
    accuracy_m: Optional[float],
    max_accuracy_m: float,
) -> LocationAssessment:
    if latitude is None and longitude is None:
        return LocationAssessment("pending", None, None, accuracy_m, "GPS coordinates were not provided.")

    if latitude is None or longitude is None:
        return LocationAssessment("invalid", latitude, longitude, accuracy_m, "Latitude and longitude must be provided together.")

    try:
        lat = float(latitude)
        lon = float(longitude)
    except (TypeError, ValueError):
        return LocationAssessment("invalid", None, None, accuracy_m, "Coordinates are not numeric.")

    if not (-90.0 <= lat <= 90.0):
        return LocationAssessment("invalid", None, None, accuracy_m, "Latitude must be between -90 and 90.")
    if not (-180.0 <= lon <= 180.0):
        return LocationAssessment("invalid", None, None, accuracy_m, "Longitude must be between -180 and 180.")
    if abs(lat) < 1e-6 and abs(lon) < 1e-6:
        return LocationAssessment("invalid", None, None, accuracy_m, "Coordinates look like a placeholder (0, 0).")

    if accuracy_m is not None:
        if accuracy_m < 0:
            return LocationAssessment("invalid", None, None, accuracy_m, "Accuracy must be non-negative.")
        if accuracy_m > max_accuracy_m:
            return LocationAssessment(
                "pending", lat, lon, accuracy_m,
                f"Reported accuracy {accuracy_m:.0f} m exceeds the {max_accuracy_m:.0f} m limit; location needs verification.",
            )

    return LocationAssessment("ok", lat, lon, accuracy_m)


def location_precision(latitude: float, longitude: float) -> tuple[float, float]:
    """Round stored coordinates to ~1 m to avoid implying false precision."""
    return round(latitude, 6), round(longitude, 6)
