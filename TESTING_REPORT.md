# TESTING_REPORT — PitScout

Date: 2026-11-13
Environment: Windows 10 (10.0.26200), Python 3.14, Node.js v24.18.0
Backend: `http://127.0.0.1:8001` (PitScout 1.1.0) · Frontend: `http://127.0.0.1:3000` (production build)

This report records commands actually executed and their observed output. Nothing below is
inferred or projected. Model accuracy is **not** reported because no labelled evaluation set was
available and no accuracy evaluation was run.

---

## 1. Automated backend tests

```
cd backend
python -m pytest -q -rs
```

Observed:

```
.......................................s.............................    [100%]
SKIPPED [1] tests\test_pipeline_order.py:67: Test image not found
68 passed, 1 skipped in 12.40s
```

The single skip is a fixture-dependent pipeline-order test that requires an image not present in
this checkout. It is not counted as a pass.

Coverage areas exercised by the suite include auth (key required, wrong key, unset key), upload
validation, image pipeline stage order, severity/cause determinism, video tracker association,
GPS assessment (missing/wrong accuracy), duplicate decision policy (including the visual floor),
idempotency replay, and status transitions.

Frontend static analysis / production build:

```
cd frontend
npm run build
```

Observed: build completed successfully; all application pages (`/dashboard`, `/inspect`,
`/video`, `/report`, `/potholes`, `/analytics`, `/datasets`, `/training`, `/reports/[id]`) and all
`/api/v1/*` route handlers compiled.

---

## 2. End-to-end smoke tests (through the frontend proxy)

All requests below were issued to `http://127.0.0.1:3000`, i.e. they exercised the Next.js route
handlers, server-side key injection, the FastAPI backend and the database.

### 2.1 Health

```
GET /api/v1/health → 200
{"status":"healthy","app":"PitScout","version":"1.1.0","database":"connected",
 "detection_model_ready":true,"authenticity_model_ready":false}
```

The authenticity neural model is not bundled; the pipeline reports that honestly.

Auth enforcement against the backend directly (no key):

```
GET http://127.0.0.1:8001/api/v1/health   → 200 (public)
GET http://127.0.0.1:8001/api/v1/potholes → 401
GET http://127.0.0.1:8001/api/v1/videos   → 401
```

Key-leak check:

```
extract ROADGUARD_API_KEY from backend/.env, then grep -rF in frontend/.next/static and
frontend/.next/server/app → no match
```

The key does not appear in the client build.

### 2.2 Image inspection

```
POST /api/v1/inspect  file=storage/sample_road.jpg  Idempotency-Key: verify-inspect-1
→ 200, pipeline_status=completed
```

Observed: image validation passed (1280×720, JPEG, 520,591 bytes); road gate `road` 0.99;
authenticity `likely_real` 0.98; 2 detections (`transverse_crack` confidence 0.2033 and a
second crack), full severity factors/causes/actions returned.

Browser verification: uploaded the same file on `/inspect` and ran the 8-stage analysis. The UI
rendered the real result — overall severity HIGH (51.57/100), 2 defects at 20% and 15%
confidence, pixel geometry, causes and recommended actions. No fabricated values (previous
hardcoded fallbacks were removed).

### 2.3 Video upload, tracking and keyframes

```
POST /api/v1/videos  file=storage/test_video.mp4   → 202 {video_id, status:"pending", ...}
GET  /api/v1/videos/{id}                            → completed, progress 100
GET  /api/v1/videos/{id}/result
```

Observed result: 8 sampled / 8 processed frames, 10 raw candidates, **2 unique tracked defects**
(`transverse_crack`, `alligator_crack`), highest severity HIGH, per-track first/last timestamps
(0s–3.5s and 1.5s–2s), best confidence 21% / 15%, tracker metadata and 4 limitations.

```
GET /api/v1/videos/{id}/keyframes/1 → 200 image/jpeg 72,706 bytes
```

Browser verification on `/video`:

- Uploading the real panning video completed at 100% and rendered two tracked defect cards with
  timestamps, severity badges and keyframe `<img>` elements loading at 640×360 and 430×360.
- Uploading a synthetic canvas video was correctly **rejected** by the authenticity gate:
  "Video frame classified as likely AI-generated; rejected under policy." (status REJECTED).
- Uploading a malformed container produced a clean failure: "OpenCV could not decode the
  uploaded video container." (status FAILED), not a crash.

### 2.4 Geotagged report, duplicate matching, idempotency, relocation

Submission with coordinates:

```
POST /api/v1/pothole-reports (multipart) lat=18.520430 lon=73.856744 acc=8
Idempotency-Key: verify-report-<ts>
→ 201 report_id=2979253a… pothole_id=5ac4e552… status=attached_new
  decision=NO_MATCH (0 candidates in radius), location=verified
```

Replay of the same idempotency key:

```
POST same Idempotency-Key → same report_id 2979253a… (no duplicate row created)
```

Second submission ~0.6 m away with the same image:

```
→ attached_existing, decision=MATCH, score=0.9943
  reason="Combined geographic and visual similarity passed both gates."
```

Submission without GPS:

```
→ status=pending_location_verification, latitude=null, longitude=null,
  location.note="GPS coordinates were not provided.", match.decision=SKIPPED
```

Relocation of the pending report after coordinates become available:

```
PATCH /api/v1/pothole-reports/f7c0be36…/location {"latitude":18.520432,"longitude":73.856746,"accuracy_m":10}
→ 200 status=attached_existing, decision=MATCH, score=0.998
```

Browser verification on `/report`: uploaded an image, entered manual coordinates (device GPS was
not granted in the headless browser), submitted, and the page rendered the real report id,
`REVIEW REQUIRED`/`MATCH` decision, score, component signals (distance/radius/visual/shape),
location verification and evidence SHA-256. A second submission rendered
`DUPLICATE DECISION: MATCH score 0.875`, `distance: 0 m`, `radius: 66 m`,
`visual: 0.6867`, `shape: 1` — confirming the signal display reads the nested payload correctly.

Note: the visual descriptor is heuristic. A uniform synthetic crop reached visual similarity
0.69 against a real road crop. The mandatory visual floor (0.55) prevented proximity-only
merges, and the combined gate still governs, but descriptor calibration on real re-visit data is
required before production (documented limitation, not an accuracy claim).

### 2.5 Canonical registry and status lifecycle

```
GET /api/v1/potholes?page_size=5
→ total=1  PS-20261113-4EF934  status=reported  report_count=3
  latitude=18.52043 longitude=73.856744 accuracy=8 m
```

```
POST /api/v1/potholes/5ac4e552…/status {"status":"verified","reason":"Smoke test field confirmation","actor":"smoke-tester"}
→ 200 status=verified, status_history appended (reported → verified)
```

Browser verification on `/potholes`: the offline SVG plot rendered the stored coordinate, the
table listed the canonical record, and selecting it displayed the merged reports (3), match
decisions/scores and the full status history. The page states that no external map tiles are
requested.

### 2.6 Datasets and training (honest failure modes)

```
POST /api/v1/datasets/validate {} → 200
{"dataset_name":"rdd2022","valid":false,"checked_images":0,
 "message":"Source path does not exist: datasets/raw/rdd2022"}
```

```
POST /api/v1/training/detection/start {"epochs":10} → 501
{"detail":"Model training is not implemented in this deployment. It requires a curated, split
 dataset plus a training runtime; neither is bundled."}
```

Browser verification: `/training` displayed the `501` detail verbatim after clicking
"Start Training Run"; `/datasets` displayed real provenance/licence/status rather than invented
counts; `/analytics` and `/dashboard` rendered backend data (14–15 inspections at test time,
8–9 completed analyses, recent-inspection table with report links only where an analysis exists).

---

## 3. Defects found and fixed during verification

| Found | Fix |
| --- | --- |
| `/report` read `match.signals.distance_m`, but the API nests details at `match.signals.signals.*`, so all four signal fields rendered as `—` | Page now reads the nested object with a fallback; browser-verified real values |
| Frontend route handlers contained fabricated fallback data (severity scores, causes, mAP, totals) and a hardcoded fallback API key | Removed; handlers now proxy real responses and fail with a configuration `503` |
| Dashboard rendered report links for rejected inspections without an analysis | Link is gated on `analysis_id` and `status === 'completed'`; shows "No analysis" otherwise |
| Next dev server pages never hydrated in this environment | Verification switched to a production build (`npm run build` + `npm start`), which works |
| Port 3000 stayed occupied by an orphaned child process after stopping the task | Identified the listening PID and terminated that specific process before restart |

---

## 4. Operational finding — do not use port 8000

A **pre-existing, different** service is still listening on `127.0.0.1:8000`:

```
GET :8000/api/v1/health → {"app":"RoadGuard AI","version":"1.0.0"}
GET :8000/api/v1/inspections → 200 with no API key
```

It is an older RoadGuard build with data endpoints that answer **without authentication**. It is
not the PitScout backend. This session did not terminate it because ownership is unclear. It
should be stopped or firewalled before any network exposure. PitScout was therefore verified on
port **8001**.

---

## 5. What is not tested / not claimed

- **Detection accuracy, recall, mAP, calibration**: not measured. No labelled test set was
  provided and none was fabricated.
- **Authenticity model**: the trained model is not bundled; the heuristic gate is what runs
  (`authenticity_model_ready: false`).
- **Real GPS hardware**: headless browser geolocation was unavailable, so manual coordinates
  were used for UI submissions. Server-side GPS validation paths are covered by automated tests
  and direct API calls.
- **Mobile layout/interaction**: verified structurally at desktop viewport only; screenshot
  capture was unavailable in this environment.
- **Load, multi-instance concurrency, PostgreSQL**: not exercised. SQLite single-node only.
- **Deployment**: no cloud deployment was performed. Only local processes were verified.
- **Feedback persistence and evidence cleanup on inspection delete** remain unfixed and are
  documented in `DEVELOPMENT_ROADMAP.md`.
