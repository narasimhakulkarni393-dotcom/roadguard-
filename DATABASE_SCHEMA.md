# DATABASE_SCHEMA — PitScout

Runtime database: SQLite in WAL mode (`backend/roadguard.db` by default, path configurable via
`DATABASE_URL`). All timestamps are stored as naive UTC by the application.

Schema creation: `backend/app/database/session.py` calls `Base.metadata.create_all` on startup.
The repository also contains a legacy Alembic scaffold (`migrations/versions/0001_initial_schema.py`,
which still targets old `users`/`refresh_tokens` tables). The PitScout tables below are **not**
covered by a migration revision; adding one is a roadmap item. This is documented rather than
claimed as complete.

---

## Entity relationships

```
inspections 1──n analyses 1──n detections

potholes 1──n pothole_reports 1──n evidence_files
potholes 1──n pothole_locations
potholes 1──n pothole_status_history

video_jobs            (standalone; result document stored as JSON text)
training_jobs         (standalone; job records and logs)
feedback              (standalone; ingest contract only)
```

`pothole_reports.pothole_id` is nullable so an uncertain submission is preserved before any
canonical record is chosen. `pothole_locations.report_id` and
`pothole_status_history` rows form the audit trail.

---

## Image inspection tables

### `inspections`

| Column | Type | Constraints / notes |
| --- | --- | --- |
| `id` | String(36) | PK, UUID |
| `original_filename` | String(255) | |
| `file_path` | Text | stored upload path |
| `file_size` | Integer | |
| `status` | String(32) | lifecycle (`pending`, `processing`, `completed`, `failed`, `rejected`, …) |
| `pipeline_stage` | String(64) | current stage |
| `error_message` | Text | sanitized |
| `created_at` / `updated_at` | DateTime | UTC |

### `analyses`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | String(36) | PK |
| `inspection_id` | FK → inspections.id | cascade delete |
| `status` | String(32) | |
| `result_json` | Text | full pipeline result document |
| `annotated_image_path` | Text | |
| `created_at` / `completed_at` | DateTime | |

### `detections`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | String(36) | PK |
| `analysis_id` | FK → analyses.id | cascade delete |
| `class_name` | String(64) | RDD2022 class |
| `confidence` | Float | detector output, not calibrated |
| `bbox_x1/y1/x2/y2` | Float | pixel geometry |
| `severity_level` / `severity_score` | String / Float | explainable scoring |
| `created_at` | DateTime | |

---

## Video tables

### `video_jobs`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | String(36) | PK |
| `status` | String(32) | `pending`, `processing`, `completed`, `failed`, `rejected` |
| `pipeline_stage` | String(64) | |
| `progress` | Integer | 0–100 |
| `original_filename` | String(255) | |
| `stored_path` | Text | |
| `file_size` | Integer | |
| `error_message` | Text | sanitized failure reason |
| `duration_seconds`, `fps` | Float | probed metadata |
| `total_frames`, `sampled_frames`, `processed_frames` | Integer | progress accounting |
| `created_at`, `updated_at`, `started_at`, `completed_at` | DateTime | |
| `result_json` | Text | complete result document (`summary`, `tracks`, `limitations`) |

Keyframes are stored on disk under `storage/keyframes/<video_id>/` and served through an
authenticated route; they are not separate table rows.

---

## Pothole registry tables

### `potholes` (canonical physical pothole)

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | String(36) | PK |
| `code` | String(32) | **unique**, e.g. `PS-20261113-4EF934` |
| `latitude`, `longitude` | Float | nullable in legacy rows; today created only from verified coordinates |
| `location_accuracy_m` | Float | |
| `primary_severity` | String(16) | `LOW`, `MODERATE`, `HIGH`, `CRITICAL` |
| `status` | String(24) | lifecycle below |
| `report_count` | Integer | number of attached reports |
| `first_reported_at`, `last_reported_at` | DateTime | |
| `created_at`, `updated_at` | DateTime | |

### `pothole_reports` (every submission preserved)

| Column | Type | Constraints / notes |
| --- | --- | --- |
| `id` | String(36) | PK |
| `pothole_id` | FK → potholes.id | nullable; `ON DELETE SET NULL` |
| `idempotency_key` | String(128) | **unique**; replay returns the original |
| `reporter_id` | String(64) | |
| `latitude`, `longitude`, `accuracy_m` | Float | null when GPS unavailable |
| `location_status` | String(32) | `verified`, `pending_location_verification`, `invalid_location` |
| `location_note` | Text | why a location is pending/invalid |
| `captured_at` | DateTime | client-supplied |
| `source_type` | String(16) | `image` |
| `source_ref` | String(64) | detector model version |
| `description` | Text | ≤2000 chars enforced at the API |
| `detection_class`, `detection_confidence` | String / Float | nullable when nothing detected |
| `severity_level` | String(16) | |
| `visual_descriptor` | JSON | Lab + gradient-orientation descriptor |
| `match_decision` | String(16) | `MATCH`, `NO_MATCH`, `UNCERTAIN`, `SKIPPED` |
| `match_score` | Float | |
| `match_signals` | JSON | component scores, candidate id, policy |
| `match_reason` | Text | human-readable explanation |
| `status` | String(32) | `received`, `attached_new`, `attached_existing`, `review_required`, `pending_location_verification`, `invalid_location` |
| `created_at` | DateTime | |

### `evidence_files`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | String(36) | PK |
| `report_id` | FK → pothole_reports.id | `ON DELETE CASCADE` |
| `kind` | String(32) | e.g. `original_image` |
| `storage_path` | Text | |
| `sha256` | String(64) | content hash |
| `width`, `height`, `size_bytes` | Integer | |
| `created_at` | DateTime | |

### `pothole_locations`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | String(36) | PK |
| `pothole_id` | FK → potholes.id | `ON DELETE CASCADE` |
| `report_id` | FK → pothole_reports.id | `ON DELETE SET NULL` |
| `latitude`, `longitude` | Float | not null |
| `accuracy_m` | Float | |
| `is_primary` | Boolean | canonical location flag |
| `created_at` | DateTime | |

### `pothole_status_history`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | String(36) | PK |
| `pothole_id` | FK → potholes.id | `ON DELETE CASCADE` |
| `from_status` | String(24) | null on creation |
| `to_status` | String(24) | not null |
| `reason` | Text | |
| `actor` | String(64) | |
| `created_at` | DateTime | |

---

## Pothole status lifecycle

```
reported    → verified | rejected
verified    → scheduled | rejected
scheduled   → in_progress | verified
in_progress → repaired | scheduled
repaired    → closed | verified
closed      → verified
rejected    → (terminal)
```

Invalid transitions are rejected by `STATUS_TRANSITIONS` in
`backend/app/services/pothole_report_service.py` and surface as `422`.
Every accepted transition writes a `pothole_status_history` row.

---

## Training and feedback tables

### `training_jobs`

`id`, `job_type`, `status`, `config` (JSON), `metrics` (JSON), `logs` (Text),
`started_at`, `completed_at`. Rows can exist, but no training executor is bundled; start
endpoints return `501`.

### `feedback`

`id`, `inspection_id`, `detection_id`, `is_correct`, `user_label`, `notes`, `created_at`.
The ingest route currently returns an id without persisting — documented defect.

---

## Operational notes

- Enable WAL for local concurrency (default in this build).
- `pothole_reports.idempotency_key` is the only uniqueness guarantee against double submission.
- Evidence and keyframes live on disk; back up `storage/` and the database together.
- For PostgreSQL, `JSON` columns map to `jsonb`-compatible types; haversine filtering is done
  in application code, so PostGIS is optional.
