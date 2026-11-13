import type { TrainingConfig, UploadResponse, AnalysisResult, AnalyticsOverview, Inspection, TrainingJob, TrainingLogs, DatasetStatus, Report, ModelVersion } from '@/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const json = await res.json()
      detail = json.detail || detail
    } catch {}
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => fetch(`${API_BASE}/api/v1/health`),

  uploadImage: (file: File, onProgress?: (p: number) => void): Promise<UploadResponse> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      formData.append('file', file)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as UploadResponse)
          } catch {
            reject(new Error('Invalid JSON response'))
          }
        } else {
          let detail = `HTTP ${xhr.status}`
          try {
            const json = JSON.parse(xhr.responseText)
            detail = json.detail || detail
          } catch {}
          reject(new Error(detail))
        }
      }

      xhr.onerror = () => reject(new Error('Network error'))
      xhr.open('POST', `${API_BASE}/api/v1/analysis/upload`)
      xhr.send(formData)
    })
  },

  getAnalysis: (id: string) =>
    fetch(`${API_BASE}/api/v1/analysis/${id}`).then((r) => handleResponse<AnalysisResult>(r)),

  getResult: (id: string) =>
    fetch(`${API_BASE}/api/v1/analysis/${id}/result`).then((r) => handleResponse<AnalysisResult>(r)),

  getAnnotatedImageUrl: (id: string) => `${API_BASE}/api/v1/analysis/${id}/annotated-image`,
  getOriginalImageUrl: (id: string) => `${API_BASE}/api/v1/analysis/${id}/original-image`,

  getAnalytics: () =>
    fetch(`${API_BASE}/api/v1/analytics/overview`).then((r) => handleResponse<AnalyticsOverview>(r)),

  getInspections: () =>
    fetch(`${API_BASE}/api/v1/inspections`).then((r) => handleResponse<Inspection[]>(r)),

  getDatasets: () =>
    fetch(`${API_BASE}/api/v1/datasets/status`).then((r) => handleResponse<DatasetStatus>(r)),

  validateDataset: (name: string) =>
    fetch(`${API_BASE}/api/v1/datasets/${name}/validate`, { method: 'POST' }).then((r) =>
      handleResponse<{ message: string }>(r)
    ),

  prepareDataset: (name: string) =>
    fetch(`${API_BASE}/api/v1/datasets/${name}/prepare`, { method: 'POST' }).then((r) =>
      handleResponse<{ message: string }>(r)
    ),

  startTraining: (config: TrainingConfig) =>
    fetch(`${API_BASE}/api/v1/training/detection/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }).then((r) => handleResponse<TrainingJob>(r)),

  getTrainingJob: (id: string) =>
    fetch(`${API_BASE}/api/v1/training/${id}`).then((r) => handleResponse<TrainingJob>(r)),

  getTrainingLogs: (id: string) =>
    fetch(`${API_BASE}/api/v1/training/${id}/logs`).then((r) => handleResponse<TrainingLogs>(r)),

  listTrainingJobs: () =>
    fetch(`${API_BASE}/api/v1/training`).then((r) => handleResponse<TrainingJob[]>(r)),

  getModelVersions: () =>
    fetch(`${API_BASE}/api/v1/models`).then((r) => handleResponse<ModelVersion[]>(r)),

  promoteModel: (id: string) =>
    fetch(`${API_BASE}/api/v1/models/${id}/promote`, { method: 'POST' }).then((r) =>
      handleResponse<{ message: string }>(r)
    ),

  getReport: (id: string) =>
    fetch(`${API_BASE}/api/v1/reports/${id}`).then((r) => handleResponse<Report>(r)),
}
