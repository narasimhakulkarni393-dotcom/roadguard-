# API_DOCUMENTATION — PitScout

Base URL (local): `http://127.0.0.1:8001`
Interactive schema: `/docs` (FastAPI), `/redoc`
All application endpoints are versioned under `/api/v1`.

Status labels: **implemented**, **partial**. Every contract in this file has been exercised
against the running server; see `TESTING_REPORT.md` for the executed commands.

The frontend does not call the backend from the browser. Every browser request goes to a
Next.js route handler under `frontend/src/app/api/v1/*` that attaches the API key server-side.

---

## Authentication

The API uses a single server-side API key (machine-to-machine). Provide one of:

```
Authorization: Bearer <ROADGUARD_API_KEY>
X-API-Key: <ROADGUARD_API_KEY>
```

- The key is read only from the `ROADGUARD_API_KEY` environment variable.
- Comparison is constant-time (`secrets.compare_digest`).
- The key is never returned or logged.
- Every data endpoint is protected. Only `/api/v1/health`, `/health` and `/ready` are public.
- If the server key is unset the API fails closed with `503` on protected routes.

Browser clients must call a Next.js route handler that adds the key server-side. The key must
never appear in `NEXT_PUBLIC_*` variables or client bundles.

---

## Error format

Baseline FastAPI errors:

```json
{ "detail": "Human-readable message." }
```

Target error format (all new endpoints, and hardened existing ones):

```json
{
  "error": {
    "code": "invalid_image",
    "message": "Unsupported or corrupt image.",
    "details": { "reason": "decode_failed" }
  },
  "request_id": "..."
}
```

The server currently returns the simpler `{"detail": "..."}` shape throughout; clients must
handle both. The structured envelope remains the target and is not yet emitted.

---

## 1. System

### `GET /api/v1/health` — implemented, public

Returns process health and model availability.

```json
{
  "status": "healthy",
  "app": "RoadGuard AI",
  "version": "1.0.0",
  "timestamp": "...Z",
  "database": "connected",
  "detection_model_ready": true,
  "authenticity_model_ready": false
}
```

### `GET /health`, `GET /ready` — implemented, public

Root summary and registry readiness (`/ready` includes per-component health).

### `GET /api/v1/models` — implemented, protected after hardening

Lists runtime model components.

> **Correction:** the baseline response hardcoded `mAP50: 0.71`, `precision: 0.74`,
> `recall: 0.68` with no evaluation behind them. The hardening phase replaces these with
> `null` metrics and an explicit `metrics_source: "not_evaluated"` field. No accuracy is
> claimed until a real evaluation is run.

---

## 2. Image inspection

### `POST /api/v1/inspect` — implemented, API key, multipart

Fields: `file` (JPEG/PNG/WEBP, ≤ 50 MB).
Response `200`: the full pipeline result (see section 2.1).
Errors: `401` missing/invalid key, `413` too large, `422` unsupported/corrupt.

### `POST /api/v1/inspect/batch` — implemented, API key, multipart

Field: `files` (1–10). Response `200`:

```json
{ "success": true, "batch_size": 2, "results": [{ "filename": "a.jpg", "result": { ... } }] }
```

### `GET /api/v1/inspection/{inspection_id}` — implemented, API key

Returns the stored inspection with `analysis: <pipeline result>`.

### 2.1 Pipeline result (abridged)

```json
{
  "success": true,
  "inspection_id": "uuid",
  "inference_run_id": "run_...",
  "image_sha256": "...",
  "pipeline_status": "completed",
  "image_validation": { "valid": true, "width": 1280, "height": 960, "format": "JPEG", "file_size_bytes": 123 },
  "road_classification": { "label": "road", "confidence": 0.78, "message": "..." },
  "authenticity": { "label": "likely_real", "confidence": 0.72, "warning": "..." },
  "damage_analysis": {
    "total_detections": 1,
    "total_raw_candidates": 1,
    "total_filtered_candidates": 0,
    "detections": [
      {
        "detection_id": "det_ab12cd34",
        "class": "pothole",
        "class_id": 0,
        "confidence": 0.61,
        "bbox": [100, 200, 240, 330],
        "geometry": { "width_pixels": 140, "height_pixels": 130, "area_pixels": 18200,
                      "relative_area": 0.0148, "physical_dimensions": null },
        "severity": { "level": "MODERATE", "score": 54.0, "factors": [], "priority": "medium" },
        "probable_causes": [
          { "cause": "Water ingress", "confidence": 0.4, "evidence": "...", "alternative": "..." }
        ],
        "cause_is_verified": false
      }
    ],
    "filtered_audit": []
  },
  "model_provenance": {
    "road_classifier": "1.0.0-cv-spectral",
    "authenticity_classifier": "1.0.0-fft-laplacian",
    "damage_detector": "yolov8n-roadguard-<checksum>",
    "false_positive_filter": "1.0.0-hard-negative-filter"
  },
  "execution_metadata": { "total_duration_ms": 900.0, "stage_timings_ms": {} }
}
```

Rejection shapes:

```json
{ "success": false, "pipeline_status": "rejected", "stage": "road_classification",
  "message": "Image rejected: scene is non-road ...", "detections": [] }
```

```json
{ "success": false, "pipeline_status": "needs_model", "stage": "damage_detection",
  "message": "Detection model unavailable...", "detections": [] }
```

`cause_is_verified` is always `false`; causes are hypotheses.

---

## 3. Background image analysis

### `POST /api/v1/analysis/image` and `/api/v1/analysis/upload` — implemented, API key

Multipart `file`. Response `202`:

```json
{
  "analysis_id": "uuid",
  "inspection_id": "uuid",
  "status": "pending",
  "status_url": "/api/v1/analysis/{id}",
  "result_url": "/api/v1/analysis/{id}/result",
  "message": "Image received. Analysis started in background."
}
```

### `GET /api/v1/analysis/{analysis_id}` — status

```json
{ "analysis_id": "...", "status": "processing", "pipeline_stage": "detection",
  "result_url": "...", "created_at": "..." }
```

`GET /api/v1/analysis/{id}/result` → `202` while running, `200` with the stored result,
`422` if failed. `GET .../annotated-image` and `.../original-image` return image bytes.

---

## 4. History, analytics, reports

| Method | Path | Status | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/inspections?page=&page_size=` | implemented | Paginated history |
| GET | `/api/v1/inspections/{id}` | implemented | Detail with analyses |
| DELETE | `/api/v1/inspections/{id}` | implemented | Removes DB rows only (evidence files remain on disk — defect to fix) |
| GET | `/api/v1/analytics/overview` | implemented | Counts and distributions; no accuracy claims |
| GET | `/api/v1/reports` | implemented | Recent completed analyses |
| GET | `/api/v1/reports/{analysis_id}` | implemented | Stored result JSON |
| GET | `/api/v1/datasets/status` | implemented | Filesystem counts |
| POST | `/api/v1/datasets/validate` | implemented | Reads the configured source path and validates images; reports `valid:false` with a message when the path is missing |
| POST | `/api/v1/datasets/prepare` | implemented | Converts/validates the local corpus; returns `501` when the source corpus is absent |
| GET/POST | `/api/v1/training/*` | implemented (start returns `501`) | Job records and logs; training execution is not bundled |
| POST | `/api/v1/feedback` | **partial — returns an id but persists nothing** | To be persisted |

---

## 5. Admin

### `GET /api/v1/admin/diagnostics` — implemented, API key

Runtime versions, model metadata, DB/storage checks.
Baseline defect: the DB check uses an invalid SQLAlchemy 2.0 call and always reports
`database_connected: false`; fixed during hardening.

### `POST /api/v1/admin/diagnostics/inference` — implemented, API key, multipart

Runs road/authenticity/detector stages without persistence and returns per-stage timings and
raw detections.

---

## 6. Video analysis — implemented, API key

### `POST /api/v1/videos/analyze` — multipart `file`, `202`

Accepted: `mp4`, `mov`, `avi`, `webm`, `mkv`, `m4v` up to `MAX_VIDEO_SIZE_MB` (200 MB).

```json
{
  "video_id": "uuid",
  "status": "pending",
  "progress": 0,
  "file_size": 1319287,
  "status_url": "/api/v1/videos/{id}",
  "result_url": "/api/v1/videos/{id}/result",
  "message": "Video received. Analysis started in background."
}
```

The job runs in a background worker. A video whose first sampled frame is classified as
AI-generated is stored with status `rejected` and no tracks.

### `GET /api/v1/videos` — paginated job list

`page`, `page_size` (1–100). Items contain `video_id`, `status`, `progress`,
`original_filename`, `duration_seconds`, `sampled_frames`, `created_at`.

### `GET /api/v1/videos/{video_id}` — status

Returns `status` (`pending|processing|completed|failed|rejected`), `pipeline_stage`,
`progress`, `sampled_frames`, `processed_frames`, `total_frames`, `fps`,
`duration_seconds`, `error_message`, timestamps and `result_url`.

### `GET /api/v1/videos/{video_id}/result`

```json
{
  "video_id": "uuid",
  "original_filename": "survey.mp4",
  "status": "completed",
  "video": { "width": 640, "height": 360, "fps": 10.0, "total_frames": 40,
             "sample_fps_requested": 2.0, "frame_stride": 5,
             "sampled_frames": 8, "processed_frames": 8 },
  "pipeline": {
    "road_classification": { "label": "road", "confidence": 0.99 },
    "authenticity": { "label": "likely_real", "confidence": 0.98 },
    "model_provenance": { "damage_detector": "...", "road_classifier": "...",
                          "authenticity_classifier": "...", "false_positive_filter": "..." }
  },
  "summary": { "unique_defects": 2, "raw_candidates": 10, "filtered_candidates": 0,
               "by_class": { "transverse_crack": 1, "alligator_crack": 1 },
               "highest_severity": "HIGH" },
  "tracks": [
    {
      "track_id": 1,
      "class": "transverse_crack",
      "best_confidence": 0.208,
      "mean_confidence": 0.19,
      "frames_seen": 8,
      "first_frame_index": 0,
      "last_frame_index": 7,
      "first_timestamp_s": 0.0,
      "last_timestamp_s": 3.5,
      "best_bbox": [0, 0, 1280, 720],
      "severity": { "level": "HIGH", "score": 72, "priority": "urgent",
                    "factors": ["..."], "uncertainty_note": "..." },
      "probable_causes": [ { "cause": "...", "confidence": 0.4, "evidence": "..." } ],
      "primary_cause": "...",
      "keyframe_url": "/api/v1/videos/{id}/keyframes/1"
    }
  ],
  "tracking": { "algorithm": "greedy IoU + centroid fallback", "iou_threshold": 0.3,
                "max_centroid_ratio": 0.12, "max_age_samples": 4, "min_hits": 2 },
  "execution_metadata": { "duration_ms": 1234.5 },
  "limitations": ["..."]
}
```

### `GET /api/v1/videos/{video_id}/keyframes/{track_id}` — JPEG keyframe

### `DELETE /api/v1/videos/{video_id}` — `204`

Removes the job row and its stored video/keyframes.

---

## 7. Pothole reports and geolocation — implemented, API key

### `POST /api/v1/pothole-reports` — multipart, `201`

| Field | Type | Notes |
| --- | --- | --- |
| `file` | file | Image evidence, required |
| `latitude`, `longitude` | float | Optional; must be a valid pair |
| `accuracy_m` | float | Optional GPS accuracy |
| `captured_at` | ISO-8601 | Optional |
| `description` | string (≤2000) | Optional |
| `reporter_id` | string | Optional |
| `client_report_id` | string | Optional idempotency fallback |
| `Idempotency-Key` | header | ≤128 chars; replay returns the original report |

If no coordinates are supplied the report is stored with `location.status =
"pending_location_verification"`, `latitude`/`longitude` null, and duplicate matching skipped.
Coordinates are never invented. If `accuracy_m` exceeds `LOCATION_MAX_ACCURACY_M` (100 m) the
location is marked `invalid_location`.

```json
{
  "report_id": "uuid",
  "pothole_id": "uuid | null",
  "status": "attached_new | attached_existing | review_required | pending_location_verification | invalid_location",
  "match": {
    "decision": "MATCH | NO_MATCH | UNCERTAIN | SKIPPED",
    "score": 0.9943,
    "reason": "Combined geographic and visual similarity passed both gates.",
    "signals": {
      "decision": "MATCH", "score": 0.9943, "best_pothole_id": "uuid",
      "candidates_considered": 1,
      "signals": { "distance_m": 0.7, "radius_m": 66, "distance_score": 1.0,
                   "visual_similarity": 0.98, "shape_similarity": 1.0,
                   "combined_score": 0.9943 },
      "policy": { "match_threshold": 0.72, "review_threshold": 0.55,
                  "min_visual_similarity": 0.55,
                  "weights": { "distance": 0.45, "visual": 0.4, "shape": 0.15 } }
    }
  },
  "location": { "latitude": 18.52043, "longitude": 73.856744, "accuracy_m": 8,
                "status": "verified", "note": null },
  "detection": { "class": "transverse_crack", "confidence": 0.2033, "severity": "HIGH" },
  "captured_at": "...",
  "created_at": "...",
  "source_type": "image",
  "source_ref": "...",
  "description": "...",
  "evidence": [ { "evidence_id": "...", "kind": "original", "sha256": "...",
                  "width": 1280, "height": 720,
                  "url": "/api/v1/pothole-reports/{report_id}/evidence/{evidence_id}" } ]
}
```

`MATCH` requires the combined score ≥ 0.72 **and** visual similarity ≥ 0.55. Proximity alone
can never produce `MATCH`; below 0.72 the report is `review_required` (UNCERTAIN) and retains
the candidate id for human review. Every submission is preserved as its own report row.

### `GET /api/v1/pothole-reports` — paginated list

### `GET /api/v1/pothole-reports/{report_id}` — single report

### `GET /api/v1/pothole-reports/{report_id}/evidence/{evidence_id}` — stored image bytes

### `PATCH /api/v1/pothole-reports/{report_id}/location`

Body `{ "latitude": 18.52, "longitude": 73.85, "accuracy_m": 10 }`. Attaches verified
coordinates to a pending report and re-runs duplicate resolution. Returns the report.

---

## 8. Canonical potholes — implemented, API key

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/potholes` | Paginated records; filters `status`, `min_lat`, `max_lat`, `min_lon`, `max_lon`, `page`, `page_size` (≤200) |
| GET | `/api/v1/potholes/{id}` | Detail with merged reports, evidence, location and status history |
| POST | `/api/v1/potholes/{id}/status` | Body `{ "status": "...", "reason": "...", "actor": "..." }`; invalid transitions return `422` |

Status lifecycle: `reported → verified | rejected`, `verified → scheduled | rejected`,
`scheduled → in_progress | verified`, `in_progress → repaired | scheduled`,
`repaired → closed | verified`, `closed → verified`; `rejected` is terminal.

---

## 9. Datasets and training — implemented, API key

| Method | Path | Behaviour |
| --- | --- | --- |
| GET | `/api/v1/datasets/status` | Filesystem counts and provenance metadata |
| POST | `/api/v1/datasets/validate` | Real scan of the source path; `valid:false` + message when absent |
| POST | `/api/v1/datasets/prepare` | Runs conversion when the corpus exists; `501` otherwise |
| POST | `/api/v1/training/detection/start` | `501` — no dataset or training runtime is bundled |
| POST | `/api/v1/training/authenticity/start` | `501` — same policy |
| GET | `/api/v1/training` | Job records |
| GET | `/api/v1/training/{id}` / `/logs` | Job detail and logs |

The frontend surfaces the `501` detail verbatim rather than pretending a job started.

---

## 10. Frontend route handlers (server-side proxies)

Every browser call targets `frontend/src/app/api/v1/*`. The handler attaches
`Authorization: Bearer <ROADGUARD_API_KEY>` server-side, forwards the request to
`BACKEND_URL`, and returns the backend status/body unchanged. Binary endpoints stream image
bytes; video uploads stream the request body (`duplex: "half"`).

If `ROADGUARD_API_KEY` is unset in the frontend server environment, handlers return `503`
with a configuration error and never call the backend. The key is not present in
`NEXT_PUBLIC_*` variables or the client bundle.
