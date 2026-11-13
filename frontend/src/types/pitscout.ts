export type Severity = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'UNKNOWN'

export interface HealthStatus {
  status: string
  app: string
  version: string
  timestamp: string
  database: string
  detection_model_ready: boolean
  authenticity_model_ready: boolean
}

export interface AnalyticsOverview {
  total_inspections: number
  completed_analyses: number
  total_detections: number
  potholes_detected: number
  cracks_detected: number
  high_priority_defects: number
  damage_distribution: { name: string; count: number }[]
  severity_distribution: { level: string; count: number }[]
  recent_inspections: RecentInspection[]
}

export interface RecentInspection {
  id: string
  filename: string | null
  status: string
  created_at: string | null
  analysis_id: string | null
}

export interface InspectionList {
  total: number
  page: number
  page_size: number
  items: {
    id: string
    status: string
    original_filename: string | null
    file_size: number | null
    created_at: string | null
    updated_at: string | null
  }[]
}

export interface MatchSignals {
  distance_m: number
  radius_m: number
  distance_score: number
  visual_similarity: number
  shape_similarity: number
  combined_score: number
}

export interface MatchPolicy {
  match_threshold: number
  review_threshold: number
  min_visual_similarity: number
  weights: { distance: number; visual: number; shape: number }
}

export interface MatchAudit {
  decision: string
  score: number | null
  best_pothole_id: string | null
  candidate_pothole_id?: string | null
  candidates_considered: number
  reason: string | null
  signals: MatchSignals | null
  policy: MatchPolicy | null
}

export interface ReportEvidence {
  evidence_id: string
  kind: string
  sha256: string
  width: number | null
  height: number | null
  url: string
}

export interface PotholeReport {
  report_id: string
  pothole_id: string | null
  status: string
  match: {
    decision: string | null
    score: number | null
    reason: string | null
    signals: MatchAudit | null
  }
  location: {
    latitude: number | null
    longitude: number | null
    accuracy_m: number | null
    status: string
    note: string | null
  }
  detection: {
    class: string | null
    confidence: number | null
    severity: string | null
  }
  captured_at: string | null
  created_at: string | null
  source_type: string
  source_ref: string | null
  description: string | null
  evidence: ReportEvidence[]
  idempotent_replay?: boolean
}

export interface ReportList {
  total: number
  page: number
  page_size: number
  items: PotholeReport[]
}

export interface Pothole {
  pothole_id: string
  code: string
  status: string
  severity: string | null
  latitude: number | null
  longitude: number | null
  location_accuracy_m: number | null
  report_count: number
  first_reported_at: string | null
  last_reported_at: string | null
  created_at: string | null
  status_history?: {
    from: string | null
    to: string
    reason: string | null
    actor: string | null
    at: string | null
  }[]
  reports?: PotholeReport[]
  locations?: {
    latitude: number
    longitude: number
    accuracy_m: number | null
    is_primary: boolean
    report_id: string | null
    at: string | null
  }[]
}

export interface PotholeList {
  total: number
  page: number
  page_size: number
  items: Pothole[]
}

export interface DetectionMeasurements {
  width_pixels: number
  height_pixels: number
  area_pixels: number
  relative_area: number
  limitation?: string | null
}

export interface DetectionCause {
  cause: string
  likelihood: string | null
  supporting_observations: string[]
  recommended_inspection: string | null
}

export interface NormalizedDetection {
  detection_id: string
  class_name: string
  confidence: number
  bbox: { x1: number; y1: number; x2: number; y2: number }
  measurements: DetectionMeasurements
  severity: {
    level: string
    score: number | null
    factors: unknown[]
  }
  possible_causes?: DetectionCause[]
  probable_causes?: DetectionCause[]
  recommended_actions: unknown[]
  [key: string]: unknown
}

export interface AnalysisResult {
  analysis_id: string
  inspection_id: string | null
  status: string
  pipeline_stage: string | null
  created_at: string | null
  completed_at: string | null
  image_info: {
    filename: string
    file_size_bytes: number
    width: number
    height: number
    format: string
    mode: string
    md5_hash: string
    blur_score: number
    is_blurry: boolean
    brightness: number
    exposure_quality: string
    exif_orientation_corrected: boolean
  }
  authenticity: {
    verdict: string
    confidence: number
    model_used: string
    factors: string[]
    limitations: string[]
  }
  quality: { is_acceptable: boolean; issues: string[]; score: number }
  model_ready: boolean
  detections: NormalizedDetection[]
  annotated_image_url: string | null
  summary: {
    total_detections: number
    damage_classes_found: string[]
    overall_severity: string
    overall_severity_score: number
    road_condition: string
    immediate_action_required: boolean
    priority_issues: string[]
  }
}

export interface VideoJob {
  video_id: string
  status: string
  pipeline_stage: string
  progress: number
  original_filename: string
  file_size: number | null
  duration_seconds: number | null
  fps: number | null
  total_frames: number | null
  sampled_frames: number | null
  processed_frames: number | null
  error_message: string | null
  created_at: string | null
  started_at: string | null
  completed_at: string | null
}

export interface VideoTrack {
  track_id: number
  class: string
  best_confidence: number
  mean_confidence: number
  frames_seen: number
  first_timestamp_s: number
  last_timestamp_s: number
  severity: { level: string; score: number; priority: string; factors: string[] }
  primary_cause?: string
  keyframe_url: string | null
}

export interface VideoResult {
  video_id: string
  status: string
  original_filename: string
  video: {
    width: number
    height: number
    fps: number
    total_frames: number
    duration_seconds: number | null
    sampled_frames: number
    processed_frames: number
    frame_stride: number
  }
  pipeline: {
    road_classification: { label: string | null; confidence: number | null }
    authenticity: { label: string | null; confidence: number | null }
  }
  summary: {
    unique_defects: number
    raw_candidates: number
    filtered_candidates: number
    by_class: Record<string, number>
    highest_severity: string | null
  }
  tracks: VideoTrack[]
  tracking: Record<string, unknown>
  limitations: string[]
}

export interface VideoList {
  total: number
  page: number
  page_size: number
  items: VideoJob[]
}

export interface DatasetStatus {
  datasets: {
    id: string
    name: string
    licence: string
    source: string
    status: string
    raw_files: number
    processed_files: number
    classes: string[]
  }[]
  summary?: {
    total_raw_files: number
    total_processed_files: number
    storage_path: string
  }
  [key: string]: unknown
}

export interface DatasetValidationResult {
  dataset_name?: string
  valid?: boolean
  checked_images?: number
  corrupted_images?: number
  corruption_details?: string[]
  message?: string
  detail?: string
}
