# DEVELOPMENT_ROADMAP — PitScout

Last updated: 2026-11-13

Legend: [x] done and verified, [~] partial, [ ] not done. Items marked [x] have been executed in
the repository; automated and manual verification results are in `TESTING_REPORT.md`.

---

## Phase 1 — Audit and architecture [x]

- [x] Full source, dependency, schema and route inspection (`PROJECT_AUDIT.md`).
- [x] Baseline test run before changes (35 passed, 1 skipped).
- [x] Real inference run against `models/detection/best.pt`.
- [x] Architecture, roadmap and API documentation.

Key findings at audit: no video/GPS/dedup; most endpoints unauthenticated; hardcoded default API
key; open CORS; synchronous inference on the event loop; no app migrations.

---

## Phase 2 — Harden image detection baseline [x]

- [x] Removed the hardcoded API key; the server fails closed (`503`) when unset.
- [x] API key required on uploads, history, analytics, reports, datasets, training, models,
  video, potholes and pothole reports.
- [x] CORS restricted to an allow-list; credentials off; static upload mounts removed.
- [x] Magic-byte image validation plus size cap before decode.
- [x] Inference runs in the threadpool.
- [x] Persistence failures logged instead of swallowed.
- [x] SQLAlchemy diagnostics query fixed; timestamps normalized to naive UTC.
- [x] OpenCV/ultralytics/numpy declared in requirements.
- [x] Existing image-pipeline behaviour preserved; tests green (68 passed, 1 skipped).

---

## Phase 3 — Video detection and tracking [x]

- [x] `POST /api/v1/videos/analyze` (202) with validation and job record.
- [x] `GET /api/v1/videos`, `.../{id}`, `.../{id}/result`, `.../{id}/keyframes/{track_id}`,
  `DELETE .../{id}`.
- [x] Frame sampling (`VIDEO_SAMPLE_FPS` default 2.0, cap 300), persisted progress.
- [x] IoU + centroid tracker with min-hits and max-age.
- [x] Unique-track summary separate from raw candidate count.
- [x] Corrupt video → `422`/clean `failed`; `VideoCapture` released in `finally`.
- [x] Keyframe crops for each track's best observation.
- [x] Tests: same defect across frames counted once; corrupt/unreadable video handled.
- [x] Browser-verified upload, progress, tracked cards, keyframes and rejection of AI-generated
  footage.

---

## Phase 4 — GPS and geolocation [x]

- [x] Report fields `latitude`, `longitude`, `accuracy_m` with strict range validation.
- [x] Missing GPS → `pending_location_verification`, null coordinates, matching `SKIPPED`.
- [x] Accuracy above `LOCATION_MAX_ACCURACY_M` → `invalid_location` (report preserved).
- [x] `PATCH /api/v1/pothole-reports/{id}/location` re-runs matching after verification.
- [x] Frontend device-geolocation button plus explicit manual coordinate entry.
- [x] Bounding-box filters on `/api/v1/potholes` and an offline SVG coordinate plot (no external
  map tiles, no third-party credentials required).

---

## Phase 5 — Duplicate pothole identification [x]

- [x] Tables `potholes`, `pothole_reports`, `evidence_files`, `pothole_locations`,
  `pothole_status_history`.
- [x] Accuracy-aware candidate search, then haversine distance.
- [x] Lab + gradient-orientation descriptor and cosine similarity.
- [x] MATCH / NO_MATCH / UNCERTAIN with audited component scores and policy.
- [x] Every report preserved; canonical record separate from submissions.
- [x] Idempotency key with replay returning the original report; transactional revalidation.
- [x] Endpoints for report create/list/detail/evidence, pothole list/detail/status.
- [x] Tests: same pothole, close-but-different, no GPS, replay, policy gates.
- [ ] Recalibrate `MATCH_MIN_VISUAL_SIMILARITY` and descriptor weights on a labelled re-visit
  dataset (blocker: no such dataset was provided).

---

## Phase 6 — Database and migrations [~]

- [x] Referential integrity and cascade rules defined on the models.
- [x] Unique index on `pothole_reports.idempotency_key`, unique `potholes.code`.
- [~] Alembic scaffolding exists (`migrations/`), but the only revision
  (`0001_initial_schema`) still targets legacy `users`/`refresh_tokens` tables.
- [ ] Author an initial migration covering the current PitScout schema and verify
  upgrade/downgrade; today the app bootstraps with `Base.metadata.create_all`.
- [ ] Add explicit indexes for location/time/status queries (bounding-box filters currently scan
  the local SQLite table; fine at this scale, not at production scale).

---

## Phase 7 — Frontend integration [x]

- [x] `/video` upload, polling, track summary, keyframes, limitations.
- [x] `/report` image upload, GPS/manual coordinates, duplicate outcome with signals, relocate
  form, evidence hashes.
- [x] `/potholes` registry with offline plot, merged reports, status history and transitions
  (detail is inline rather than a separate `/potholes/[id]` page).
- [x] Dashboard, analytics, datasets and training wired to real responses.
- [x] Navigation updated; loading/error/empty states reviewed.
- [x] All fabricated fallback data removed from client components.
- [x] Existing visual language and pages preserved.
- [ ] Dedicated Leaflet map page (deliberately replaced by an offline SVG plot to avoid
  unauthorised external tile calls); revisit only with approved tile credentials.

---

## Phase 8 — Testing, debugging, optimisation [x]

- [x] Backend tests for video, GPS, matching, idempotency and policy gates.
- [x] Frontend production build; all routes compiled.
- [x] End-to-end manual run on localhost with a real road image and real/synthetic video.
- [x] `TESTING_REPORT.md` written with actual commands and observed results only.
- [ ] Concurrency/load testing and PostgreSQL verification (not performed).

---

## Phase 9 — Documentation and deployment preparation [x]

- [x] `README.md`, `frontend/.env.example`, run instructions.
- [x] `SYSTEM_ARCHITECTURE.md`, `API_DOCUMENTATION.md`, `DATABASE_SCHEMA.md`,
  `TESTING_REPORT.md`, roadmap and model/dataset docs.
- [x] Limitations documented: heuristic classifiers, engineered descriptor, unbenchmarked
  tracking, in-process background work, no accuracy figure for `best.pt`.
- [x] PostgreSQL deployment notes included; no cloud resources created.
- [ ] No cloud deployment performed or claimed.

---

## Decisions recorded

1. **Extend the existing RoadGuard app**; the UI and detector were not replaced.
2. **SQLite for local execution**; production reference is PostgreSQL. Migrations are still a
   gap (Phase 6).
3. **No new heavyweight tracker dependency** — deterministic IoU/centroid association.
4. **Visual matching is an engineered descriptor**, explicitly not a learned embedding.
5. **UNCERTAIN is a first-class outcome**; proximity alone never merges records.
6. **API key auth for all data routes**; the browser never receives the key.
7. **No fabricated evaluation metrics**; `best.pt` has no provided validation results.

---

## Genuine blockers / external dependencies

- No labelled report-pair dataset, so duplicate thresholds are validated only with repository
  and synthetic media. All thresholds are environment-configurable.
- `models/authenticity/best.pt` is not bundled; the authenticity stage runs as a heuristic
  (`authenticity_model_ready: false`).
- No curated RDD2022 corpus or training runtime is bundled, so training endpoints return `501`.
- PostgreSQL/PostGIS is not provisioned; haversine filtering runs in portable SQL.
- Cloud deployment and external map-tile credentials require explicit approval and were not
  provisioned.
- A pre-existing, **unauthenticated** RoadGuard AI 1.0.0 process is listening on port 8000 in
  this workspace. PitScout runs on 8001. The old process should be stopped or firewalled before
  any network exposure.
