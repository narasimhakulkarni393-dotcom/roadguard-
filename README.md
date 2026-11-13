# PitScout — Pothole Detection, Video Tracking & Geotagged Road Intelligence

PitScout is an infrastructure inspection platform for detecting, measuring and tracking road
damage (potholes and cracks), plus collecting geotagged citizen reports and resolving duplicate
reports into canonical, auditable pothole records.

It builds on the original RoadGuard image-inspection codebase. The existing 8-stage image
pipeline and UI were preserved; video tracking, GPS reporting, duplicate identification, the
canonical pothole registry and a server-side API proxy were added.

Detection follows the **CRDDC RDD2022** class scheme (`D00` longitudinal crack, `D10`
transverse crack, `D20` alligator crack, `D40` pothole).

---

## Features

1. **Image inspection** — 8-stage pipeline: validation → road gate → authenticity gate → YOLO →
   false-positive filter → geometry → explainable severity → cause hypotheses → report.
2. **Video survey** — sampled-frame detection with deterministic IoU/centroid tracking. One
   physical defect seen across frames yields one tracked defect with first/last timestamps,
   severity, probable causes and a keyframe crop. AI-generated video is rejected under policy.
3. **Geotagged reports** — browser GPS (explicit button) or manual coordinates. Missing GPS
   leaves the report `pending_location_verification`; coordinates are never invented.
4. **Duplicate identification** — candidate search by accuracy-aware radius, Lab-histogram +
   gradient-orientation visual similarity, and shape similarity. `MATCH` requires the combined
   score ≥ 0.72 **and** visual similarity ≥ 0.55, so proximity alone never merges records.
   Every submission is preserved; uncertain cases are queued for review.
5. **Canonical pothole registry** — merged reports, evidence, location history, status history
   and guarded lifecycle transitions (`reported → verified → scheduled → in_progress →
   repaired → closed`, plus rejection paths).
6. **Operations pages** — dashboard, analytics, dataset provenance, training console that
   honestly reports `501` while training is unbundled.

## Stack

- **Backend**: FastAPI, Python 3.11+, Pydantic v2, SQLAlchemy 2, SQLite WAL (PostgreSQL-ready),
  OpenCV, Pillow, Ultralytics YOLOv8.
- **Frontend**: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Recharts, Lucide.

---

## Quick start (local)

### 1. Backend

```bash
cd backend
# create .env with at least: ROADGUARD_API_KEY=<long-random-secret>
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Health: `http://127.0.0.1:8001/api/v1/health` · Schema: `http://127.0.0.1:8001/docs`

Port 8000 is the conventional default, but this workspace was verified on **8001** because a
pre-existing service already occupied 8000. Use whichever port is free and point the frontend
at it.

### 2. Frontend

Create `frontend/.env.local` (see `frontend/.env.example`):

```
BACKEND_URL=http://127.0.0.1:8001
ROADGUARD_API_KEY=<same secret as the backend>
```

```bash
cd frontend
npm install
npm run build
npm start -- --port 3000
```

Open `http://127.0.0.1:3000`.

The API key is server-only. Next.js route handlers under `frontend/src/app/api/v1/*` attach it.
Never place it in `NEXT_PUBLIC_*` variables.

### Verified local URLs

| Service | URL | Notes |
| --- | --- | --- |
| Frontend | `http://127.0.0.1:3000` | Production build verified |
| Backend | `http://127.0.0.1:8001` | PitScout 1.1.0 |
| Health (proxied) | `http://127.0.0.1:3000/api/v1/health` | No key required |

---

## Documentation

| Document | Contents |
| --- | --- |
| `SYSTEM_ARCHITECTURE.md` | Components, pipelines, data model, matching policy, security |
| `API_DOCUMENTATION.md` | Every endpoint with status, auth and payloads |
| `DATABASE_SCHEMA.md` | Tables, relationships, lifecycle constraints |
| `TESTING_REPORT.md` | Executed tests and manual smoke results, with limitations |
| `DEVELOPMENT_ROADMAP.md` | Phase status, decisions, blockers |
| `docs/MODEL_CARD.md`, `docs/DATASET_ATTRIBUTION.md`, `docs/TRAINING_GUIDE.md` | Model and data governance |

---

## Deployment

The Next.js frontend is deployed on Vercel:

- Production: https://frontend-nine-flame-89.vercel.app
- Project: `frontend` (root directory `frontend/`)
- Required environment variables: `BACKEND_URL` (public base URL of the PitScout API) and
  `ROADGUARD_API_KEY` (same machine-to-machine key the backend expects). Both are read only by
  the server-side route handlers; neither is exposed to the browser.

The FastAPI backend is **not** deployed on Vercel. It needs PyTorch/Ultralytics/OpenCV, a
writable SQLite database, on-disk evidence storage and in-process video jobs — none of which fit
the Vercel Functions runtime. Host it on a persistent container service and point `BACKEND_URL`
at it. Until a reachable backend is configured, the deployed UI renders its explicit
"API unreachable" state rather than fabricated data.

## Honest limitations

- No accuracy, recall or mAP claims are made for the detector. No labelled evaluation set was
  provided and no evaluation was run.
- Road and authenticity classifiers are heuristics, not trained networks.
- The duplicate descriptor is engineered (not a learned embedding); visual-only similarity on
  uniform synthetic crops can be misleading. Recalibrate on a labelled re-visit dataset.
- Severity uses 2D pixel geometry; real-world dimensions require camera calibration.
- Video analysis samples frames (default 2 fps, max 300); it does not decode every frame.
- Training endpoints return `501`: no curated dataset or training runtime is bundled.
- `POST /api/v1/feedback` still returns an id without persisting; inspection deletion leaves
  evidence files on disk. Both are documented, not silently claimed as done.

## Dataset & license

RDD2022 / Sekilab — CC BY 4.0. Platform code: MIT (see `docs/DATASET_ATTRIBUTION.md`).
