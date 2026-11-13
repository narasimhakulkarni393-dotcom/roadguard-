# SYSTEM_ARCHITECTURE — PitScout

Status labels: **implemented**, **partial** (this file reflects the code as built and exercised;
see `TESTING_REPORT.md`).

---

## 1. Target system

PitScout extends the existing RoadGuard image-inspection codebase with three capabilities that
change the core data model:

1. **Video inspection** with temporal tracking (one physical pothole = one tracked object).
2. **Geolocated citizen reports** (GPS or manual pin, never fabricated coordinates).
3. **Duplicate identification** producing one canonical pothole record per physical pothole,
   with many reports and evidence files attached to it.

The existing image detection pipeline is preserved. No working UI page is removed.

---

## 2. Component diagram

```
                    ┌────────────────────────────────────────────┐
                    │ Next.js UI (frontend/)                      │
                    │  /dashboard /inspect /video /report         │
                    │  /potholes /analytics /datasets /training   │
                    └───────────────┬────────────────────────────┘
                                    │ server-side route handlers
                                    │ (Authorization added server-side)
                    ┌───────────────▼────────────────────────────┐
                    │ FastAPI API (backend/app)                   │
                    │                                             │
                    │  auth ── inspect ── analysis ── video       │
                    │  pothole-reports ── potholes ── analytics   │
                    │  datasets ── training ── inspections        │
                    │                                             │
                    │  InspectionPipeline (existing, image)       │
                    │  VideoPipeline (new)                        │
                    │  DuplicateMatcher (new)                     │
                    └───────┬───────────────┬────────────────────┘
                            │               │
                 ┌──────────▼─────┐  ┌──────▼─────────────────────┐
                 │ Model registry │  │ SQLite (WAL) / PostgreSQL  │
                 │ road (heur.)   │  │  inspections, analyses,    │
                 │ authenticity   │  │  detections, training_jobs │
                 │ YOLOv8 best.pt │  │  potholes, reports,        │
                 │ FP filter      │  │  evidence, locations,      │
                 └────────────────┘  │  status_history, video_jobs│
                                     └────────────────────────────┘
                            │
                  storage/local_storage.py (uploads, annotated, video keyframes)
```

---

## 3. Image pipeline (existing, preserved)

`backend/app/services/inspection_pipeline.py` keeps its strict order:

```
validate → road gate → authenticity gate → YOLO → false-positive filter
         → geometry → severity → causes → response
```

Changes made during this engagement are limited to correctness and safety:

- Input validation remains in the pipeline; the HTTP layer enforces size, signature and
  extension before decoding.
- Road/authenticity components stay heuristic but are described honestly as heuristics in
  API metadata and documentation.
- Heavy inference never runs directly on the event loop.

---

## 4. Video pipeline (implemented)

### 4.1 Processing

```
upload → validate container/size → open with OpenCV → probe fps/frame count
       → road gate + authenticity gate on a sampled frame
       → sample frames at VIDEO_SAMPLE_FPS (default 2.0, max 300)
       → run YOLO per sampled frame (reuse detector wrapper)
       → temporal association (tracker)
       → aggregate tracks → severity/cause per track + keyframe crops
       → persist VideoJob progress and the result document
```

- Sampling is configurable (`VIDEO_SAMPLE_FPS`, default 2.0) and bounded
  (`VIDEO_MAX_SAMPLED_FRAMES`, default 300) to cap CPU.
- Corrupt/unreadable video → `422`; processing failure → job `failed` with a sanitized error.
- Resources (`cv2.VideoCapture`) are always released in `finally`.
- Progress (`processed_frames / sampled_frames`) is persisted so the UI can poll.
- The HTTP endpoint returns `202` immediately; processing runs in a background task.

### 4.2 Tracking

Implemented as a deterministic IoU + centroid tracker (no extra dependency):

- A track is a sequence of detections of the same class with IoU ≥ `TRACK_IOU_THRESHOLD`
  (default 0.3) or centroid distance < `TRACK_MAX_CENTROID_RATIO` × frame diagonal.
- Tracks expire after `TRACK_MAX_AGE_FRAMES` missed sampled frames (default 4).
- A track becomes a reported pothole only after `TRACK_MIN_HITS` (default 2) observations;
  single-frame flickers are not counted.
- Track summary: class, first/last timestamp, hit count, max/mean confidence, best bbox,
  representative frame index, severity, probable causes and the keyframe URL.
- The video summary distinguishes **unique tracked defects** from **raw candidates**, so the
  same pothole seen across frames is not counted multiple times.
- A video whose first sampled frame is classified as AI-generated is rejected under policy
  (`status = rejected`) and produces no tracks.

ByteTrack is not vendored; the tracker is an explicit, testable IoU/centroid association. It can
be replaced by ByteTrack later without changing the API contract.

---

## 5. Geolocation (implemented)

- Report creation accepts `latitude`, `longitude`, `accuracy_m` (multipart form fields).
- Validation: latitude −90..90, longitude −180..180, accuracy must be finite and positive.
- If coordinates are absent, the report is stored with
  `location_status = "pending_location_verification"`, latitude/longitude `NULL`, and
  duplicate matching is `SKIPPED`. No placeholder coordinates are invented.
- An accuracy worse than `LOCATION_MAX_ACCURACY_M` (default 100 m) yields
  `invalid_location`; the report and its evidence are still preserved.
- The UI reads the browser Geolocation API only after an explicit button press, and also
  supports explicit manual latitude/longitude entry. An offline SVG coordinate plot renders
  stored coordinates without calling any external tile service.
- `PATCH /api/v1/pothole-reports/{id}/location` attaches verified coordinates later and
  re-runs duplicate resolution.

---

## 6. Duplicate identification (implemented, core feature)

### 6.1 Data model

```
potholes (canonical physical pothole)
  id, code (unique, e.g. PS-20261113-4EF934), latitude, longitude,
  location_accuracy_m, primary_severity, status, report_count,
  first_reported_at, last_reported_at, created_at, updated_at

pothole_reports (every submission is preserved)
  id, pothole_id (nullable while uncertain), idempotency_key (unique),
  reporter_id, latitude, longitude, accuracy_m, location_status, location_note,
  captured_at, source_type, source_ref, description,
  detection_class, detection_confidence, severity_level, visual_descriptor (JSON),
  match_decision, match_score, match_signals (JSON), match_reason,
  status, created_at

evidence_files
  id, report_id, kind, storage_path, sha256, width, height, size_bytes, created_at

pothole_locations (location history)
  id, pothole_id, report_id, latitude, longitude, accuracy_m, is_primary, created_at

pothole_status_history
  id, pothole_id, from_status, to_status, reason, actor, created_at
```

`pothole_id` stays `NULL` for an UNCERTAIN report until it is attached or a canonical record
is created. The original report row and its evidence are never deleted or merged away; attaching
a report records a `pothole_locations` row and bumps `report_count`.

### 6.2 Matching signals

1. **Geospatial candidate search** — an accuracy-aware bounding box in degrees, then precise
   haversine distance. `radius_m = clamp(max(MATCH_BASE_RADIUS_M, accuracy_new, accuracy_candidate),
   MATCH_MIN_RADIUS_M, MATCH_MAX_RADIUS_M)` (defaults 50 / 15 / 250 m; observed radius 66 m for
   ±12 m accuracy).
2. **Visual similarity** — deterministic appearance descriptor from the evidence crop: Lab
   colour histogram + gradient-orientation histogram, L2-normalized; cosine similarity. This is
   a heuristic descriptor, **not** a trained embedding. Raw file hashes are never used as the
   primary signal.
3. **Shape similarity** — class compatibility, relative-area ratio and aspect-ratio similarity
   against the candidate's best stored detection.

### 6.3 Decision

```
distance_score = max(0, 1 - distance / radius)
visual_score   = cosine(descriptor_new, descriptor_candidate)   # 0..1
shape_score    = f(class match, area ratio, aspect ratio)       # 0..1

score = 0.45*distance_score + 0.40*visual_score + 0.15*shape_score

MATCH      if score >= MATCH_THRESHOLD (0.72) AND visual_score >= MIN_VISUAL_SIMILARITY (0.55)
NO_MATCH   if no candidate in radius, or score < REVIEW_THRESHOLD (0.55)
UNCERTAIN  otherwise  → report.status = review_required, candidate id retained
```

A candidate is **never** matched on distance alone: the visual floor is mandatory. Every
decision stores the component scores, the candidate id and the policy thresholds in
`pothole_reports.match_signals` for auditing.

### 6.4 Concurrency and idempotency

- `pothole_reports.idempotency_key` is unique; a replay returns the original report with a
  `201`-equivalent body instead of creating a duplicate.
- Matching + insert run in one transaction. On SQLite the write is serialized; on PostgreSQL
  the candidate rows can be locked.
- After a NO_MATCH insert the matcher re-runs the candidate search inside the same transaction.
  If a concurrent report created an equivalent pothole between the two steps, the newer empty
  pothole is discarded and the report is attached to the earlier canonical record.

---

## 7. Security architecture (changes during this engagement)

- No hardcoded key or secret defaults; the API key must come from `ROADGUARD_API_KEY`.
- If the key is unset, protected endpoints return `503` (misconfigured) instead of accepting
  a known default.
- All upload, history, analytics, report, video, pothole, dataset and training endpoints
  require the API key; only health/readiness are public.
- The browser never holds the key. Next.js route handlers under `frontend/src/app/api/v1/*`
  attach `Authorization: Bearer ...` server-side. Handlers return `503` when the frontend
  server's key is unset and never call the backend.
- CORS is restricted by `ALLOWED_ORIGINS` (default localhost dev origins), credentials off.
- Static upload mounts are removed; images are served through authenticated routes only.
- Uploads are read with a hard size cap and validated by Pillow/OpenCV signature, not extension
  only. Evidence files are served only through authenticated report/analysis routes.
- Inference runs in the threadpool so one upload cannot stall all requests.
- Rate limiting middleware is mounted for inference endpoints (in-process; replace with Redis
  for multi-instance deployments).
- Errors never include secrets, model paths or stack traces.

---

## 8. Deployment target

- Local: SQLite WAL, Uvicorn, Next.js (dev or production build).
- Production reference: PostgreSQL + PostGIS (optional; haversine SQL is used without PostGIS),
  object storage for evidence, a durable worker queue for video, TLS and a single allowed origin.
- No cloud deployment is performed in this engagement; see `DEVELOPMENT_ROADMAP.md`.

---

## 9. Honest boundaries

- No accuracy/recall/mAP figures are claimed for `best.pt`; no labelled evaluation set was
  provided, and no evaluation was run.
- Road and authenticity stages are heuristics, not trained neural networks.
- The visual-similarity descriptor is engineered, not learned. It can score synthetically
  uniform crops relatively high; the mandatory visual floor stops distance-only merges but does
  not replace a calibrated embedding. Recalibrate on a labelled re-visit dataset before
  production use.
- Tracking is IoU/centroid association, not ByteTrack, and is not benchmarked on MOT data.
- Video sampling inspects a subset of frames; defects visible only between samples are missed.
- Severity is pixel-geometry based; physical dimensions need camera calibration and are not
  fabricated.
- Documented but unfixed: `POST /api/v1/feedback` returns an id without persisting; inspection
  deletion removes DB rows but not evidence files on disk.
