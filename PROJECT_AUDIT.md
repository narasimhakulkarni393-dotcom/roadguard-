# PROJECT_AUDIT — PitScout (RoadGuard codebase)

Audited repository: `cluade-s-plan` (github.com/sumitpshinde269-oss/cluade-s-plan-)
Audit date: 2026-11-13
Auditor: engineering agent
Method: full source read, dependency inspection, database inspection, `pytest` run, real
inference run on a sample image. No code was executed from the repository before this audit.

---

## 1. Executive summary

The repository is a working, single-user-oriented **RoadGuard** road-damage inspection app.
It performs image-based YOLO detection with a multi-stage post-processing pipeline and ships a
Next.js dashboard. The PitScout product vision in the specification is **not implemented**:

| PitScout capability | Status |
| --- | --- |
| Image-based pothole detection | **Implemented** (YOLOv8 + post-processing) |
| Video-based detection + tracking | **Missing** |
| GPS / geolocation capture and storage | **Missing** |
| Duplicate pothole identification (one pothole → one record) | **Missing** |
| Canonical pothole records with multiple reports/evidence | **Missing** |
| Interactive map / pothole dashboard | **Missing** |
| Backend database migrations for the app schema | **Missing** (uses `create_all`) |
| Authentication on data endpoints | **Partial** (only `/inspect` and `/admin/*`) |

Baseline verification performed:

```
cd backend && python -m pytest -q
=> 35 passed, 1 skipped in 11.78s
```

A real inference through the production pipeline returned:
`pipeline_status=completed`, 1 detection (`alligator_crack`, confidence 0.1836) on a sample
photo. The detector checkpoint `models/detection/best.pt` (6.4 MB) loads successfully with
Ultralytics on CPU.

---

## 2. Repository structure

The repository contains **two unrelated Python applications**:

1. `backend/` — the real RoadGuard application (FastAPI, sync SQLAlchemy, SQLite).
2. `app/` — an older standalone auth scaffold (users/refresh tokens) with its own
   `alembic.ini` + `migrations/` at repository root. It is **not imported** by
   `backend/app/main.py` and its Alembic config points at `hackvally.db`.

This duplication is a structural weakness, not a feature. The audit treats `backend/` as the
application of record.

```
backend/app/
  main.py                    FastAPI app factory (create_all on startup, CORS *, static mounts)
  api/routes/                11 route modules
  core/config.py             Manual .env loader, settings class (hardcoded defaults)
  core/auth.py               API-key auth, constant-time comparison
  database/                  Sync engine, SQLite WAL pragmas, get_db
  models/database.py         inspections, analyses, detections, training_jobs
  ml/                        Model wrappers + registry (lazy loaded)
  services/                  Inspection pipeline, validation, annotation, reports
  workers/job_manager.py     Background image analysis pipeline
  storage/local_storage.py   Local filesystem uploads
  tests/                     35 passing tests
frontend/                    Next.js 16 + React 19 + Tailwind 4
models/detection/best.pt     YOLOv8 checkpoint (6.4 MB)
models/authenticity/         Empty (.gitkeep only)
yolov8n.pt (repo root)       Base YOLOv8n checkpoint (6.5 MB)
docs/                        Model card, training guide, attributions, sample media
ml/, training/               Dataset + training CLI scripts
```

---

## 3. Technology stack (verified)

- Python 3.14.0 (repository claims 3.12+); globally installed `torch`, `ultralytics`, `cv2`,
  `numpy`, `Pillow`, `fastapi`, `sqlalchemy`, `pydantic` are present.
- FastAPI, sync SQLAlchemy 2.x, SQLite (WAL). PostgreSQL is not wired in practice.
- YOLOv8 via Ultralytics; Pillow/numpy for image analysis.
- Next.js 16.4.6, React 19.3, TypeScript, Tailwind 4, Leaflet + react-leaflet (installed but
  **unused**), Recharts, Framer Motion.
- Tests: pytest + FastAPI TestClient.

---

## 4. Implemented functionality (verified)

### 4.1 Image inspection pipeline

`backend/app/services/inspection_pipeline.py` implements 8 declared stages:

1. Input validation: empty-file guard, Pillow decode + `verify()`, EXIF transpose, RGB,
   minimum dimensions. (No file-size limit inside the pipeline; the route applies one.)
2. Road/non-road gate — **heuristic**, not a trained classifier.
3. Authenticity gate — **heuristic** FFT/Laplacian analysis, not a trained classifier.
4. YOLOv8 detection with taxonomy mapping (`pothole`, `manhole_cover`, `sewage_hole`,
   `longitudinal_crack`, `transverse_crack`, `alligator_crack`).
5. False-positive filtering — rule-based (size, brightness variance, class confidence).
6. Geometry: pixel width/height/area and relative area. No physical measurement claimed.
7. Severity scoring (deterministic, category thresholds).
8. Cause hypotheses and recommendations (rule-based, explicitly unverified).

### 4.2 API surface

- `POST /api/v1/inspect` — API-key protected; synchronous pipeline; persists inspection.
- `POST /api/v1/inspect/batch` — API-key protected; up to 10 images.
- `GET /api/v1/inspection/{id}` — API-key protected.
- `POST /api/v1/analysis/image|upload` — **unauthenticated**; background pipeline.
- `GET /api/v1/analysis/{id}`, `/result`, `/annotated-image`, `/original-image` — unauthenticated.
- `GET/DELETE /api/v1/inspections[...]` — unauthenticated.
- `GET /api/v1/analytics/overview` — unauthenticated.
- `POST /api/v1/feedback` — unauthenticated.
- `GET /api/v1/reports`, `GET /api/v1/reports/{analysis_id}` — unauthenticated.
- `GET /api/v1/datasets/status`, `POST /validate`, `POST /prepare` — unauthenticated.
- `GET/POST /api/v1/training/*` — unauthenticated.
- `GET /api/v1/models` — unauthenticated.
- `GET /api/v1/admin/diagnostics`, `POST /api/v1/admin/diagnostics/inference` — API-key protected.
- `GET /api/v1/health`, `GET /health`, `GET /ready`, `GET /` — public.

### 4.3 Frontend

Pages: `/` (landing), `/inspect` (upload + analysis viewer), `/dashboard`, `/analytics`,
`/datasets`, `/training`, `/reports/[id]`. Next.js route handlers under
`frontend/src/app/api/v1/**` proxy to the FastAPI backend.

### 4.4 Tests

35 passing, 1 skipped, covering pipeline order, image independence, false positives, auth,
admin diagnostics and basic API behavior. The suite uses the real model when weights are
present; no video/GPS/dedup tests exist.

---

## 5. Partially implemented / overstated functionality

| Item | Reality |
| --- | --- |
| "Road Classifier" (MobileNetV3) | Spectral/brightness/gradient heuristic (`1.0.0-cv-spectral`). |
| "Authenticity Classifier" | FFT/Laplacian heuristic (`1.0.0-fft-laplacian`). |
| "8-stage AI pipeline" | Stages 1–2 are not ML; 5–8 are deterministic rules. |
| Background analysis | In-process FastAPI `BackgroundTasks`; no durable queue, no progress recovery. |
| PostgreSQL readiness | Sync engine hardcodes SQLite `connect_args`; no Postgres verification. |
| Rate limiting | Config exists; **no middleware is implemented or mounted** in `backend`. |
| Dataset/training UI | Routes exist; operational status not verified in this audit. |
| Model registry | Static wrapper registry, not a persisted model/version registry. |

---

## 6. Missing functionality required by PitScout

1. **Video upload, validation, frame sampling, inference, progress and summaries.**
2. **Object tracking / temporal association** so one physical pothole across frames counts once.
3. **GPS capture, validation, storage and manual map selection.**
4. **Canonical pothole records** with many reports, evidence files, location history and
   status history.
5. **Duplicate identification** using geospatial proximity + visual similarity + detection
   validation, with MATCH / NO_MATCH / UNCERTAIN outcomes.
6. **Race-condition-safe report creation** (idempotency, transactional revalidation).
7. **Pothole records dashboard, detail view and interactive map.**
8. **Alembic migrations for the application schema.**
9. Dedicated automated tests for all of the above.

---

## 7. Security and engineering findings

| Severity | Finding |
| --- | --- |
| Critical | Hardcoded default API key in `backend/app/core/config.py` (`API_KEY` fallback). |
| Critical | Hardcoded fallback secrets in `.env.example` (`SECRET_KEY`, API key). |
| High | Most data and inference endpoints are unauthenticated, including uploads. |
| High | `CORSMiddleware` allows any origin with `allow_credentials=True`. |
| High | `/static/uploads` and `/static/annotated` mounted publicly, exposing user images. |
| Medium | Synchronous YOLO inference inside `async def` routes blocks the event loop. |
| Medium | `/inspect` swallows database persistence exceptions (`except Exception: db.rollback()` with no log). |
| Medium | No server-side file-signature check in some routes; extension-only validation. |
| Medium | `db.execute("SELECT 1")` is invalid in SQLAlchemy 2.0, so the diagnostics DB check always reports disconnected. |
| Medium | Public upload endpoint has no size-streaming guard before full read into memory. |
| Low | `datetime.utcnow()` deprecated in Python 3.12+; naive timestamps stored as "UTC". |
| Low | Two model artifacts (`yolov8n.pt`, `best.pt`); provenance ambiguous. |
| Low | `requirements.txt` omits `torch`, `ultralytics`, `opencv-python`, `numpy`; runtime depends on global packages. |

---

## 8. Data model (current)

`inspections` (1) → (N) `analyses` (1) → (N) `detections`; `training_jobs`.
No users, locations, potholes, reports, evidence, or status history in the active schema
(users/refresh tokens exist only in the unused root scaffold).

---

## 9. Audit conclusion

The image-detection foundation is real and runnable. PitScout's differentiating features —
video tracking, geolocation and duplicate prevention — are absent. The highest engineering
priority is the canonical pothole record + matching subsystem, because it changes the data
model and every downstream API. Security hardening of the upload paths is a prerequisite
before exposing the app beyond localhost.

No accuracy figure is claimed anywhere in this audit; the model card and documentation
contain no verified evaluation of `best.pt`.
