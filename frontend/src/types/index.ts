// Type definitions for PitScout

export type SeverityLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'
export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type TrainingStatus = 'queued' | 'running' | 'completed' | 'failed'
export type ModelType = 'detection' | 'authenticity'

export interface BoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface Detection {
  id: string
  class_name: string
  class_id: number
  confidence: number
  bbox: BoundingBox
  width_px: number
  height_px: number
  area_px: number
  severity_level: SeverityLevel
  severity_score: number
  severity_factors: string[]
  possible_causes: { cause: string; confidence: number }[]
  recommended_actions: string[]
}

export interface AuthenticityResult {
  is_authentic: boolean
  confidence: number
  flags: string[]
  method: string
}

export interface AnalysisPipelineStage {
  stage: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  message?: string
  result?: unknown
}

export interface AnalysisResult {
  analysis_id: string
  inspection_id: string
  status: AnalysisStatus
  pipeline_stage: string
  pipeline_stages: AnalysisPipelineStage[]
  authenticity: AuthenticityResult | null
  detections: Detection[]
  total_defects: number
  overall_severity: SeverityLevel | null
  image_width: number
  image_height: number
  processing_time_seconds: number | null
  error_message: string | null
  started_at: string
  completed_at: string | null
}

export interface Inspection {
  id: string
  created_at: string
  updated_at: string
  status: AnalysisStatus
  original_filename: string
  file_size: number
  notes: string | null
  analysis_id: string | null
}

export interface AnalyticsOverview {
  total_inspections: number
  total_defects: number
  potholes_detected: number
  high_priority_issues: number
  damage_distribution: { class_name: string; count: number }[]
  severity_distribution: { severity: SeverityLevel; count: number }[]
  inspection_trend: { date: string; count: number }[]
  model_performance: {
    detection_map50: number | null
    authenticity_accuracy: number | null
    avg_processing_time: number | null
  }
}

export interface DatasetStatus {
  datasets: DatasetInfo[]
}

export interface DatasetInfo {
  name: string
  source_url: string
  license: string
  image_count: number
  annotation_count: number
  status: 'not_downloaded' | 'downloading' | 'downloaded' | 'validated' | 'prepared'
  download_progress: number | null
  class_distribution: { class_name: string; count: number }[]
  size_bytes: number | null
  last_validated_at: string | null
}

export interface TrainingConfig {
  dataset: string
  model_type: ModelType
  image_size: 416 | 640 | 1280
  epochs: number
  batch_size: 4 | 8 | 16 | 32
  learning_rate: number
  device: 'auto' | 'cpu' | 'cuda'
}

export interface TrainingMetrics {
  epoch: number
  train_loss: number | null
  val_loss: number | null
  map50: number | null
  precision: number | null
  recall: number | null
}

export interface TrainingJob {
  id: string
  job_type: ModelType
  status: TrainingStatus
  config: TrainingConfig
  current_epoch: number
  total_epochs: number
  started_at: string | null
  completed_at: string | null
  metrics_history: TrainingMetrics[]
  latest_metrics: TrainingMetrics | null
  model_path: string | null
  error_message: string | null
}

export interface TrainingLogs {
  job_id: string
  logs: string
  line_count: number
}

export interface ModelVersion {
  id: string
  version: string
  model_type: ModelType
  training_date: string
  map50: number | null
  accuracy: number | null
  status: 'candidate' | 'promoted' | 'deprecated'
  job_id: string
}

export interface Report {
  id: string
  inspection_id: string
  analysis_id: string
  created_at: string
  inspection_date: string
  original_filename: string
  overall_severity: SeverityLevel | null
  total_defects: number
  detections: Detection[]
  authenticity: AuthenticityResult | null
  image_width: number
  image_height: number
  processing_time_seconds: number | null
  technical_notes: string[]
}

export interface UploadResponse {
  inspection_id: string
  analysis_id: string
  status: string
  message: string
}

export interface ApiError {
  detail: string
  status_code?: number
}
