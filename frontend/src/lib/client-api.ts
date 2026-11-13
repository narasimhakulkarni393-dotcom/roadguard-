import type {
  AnalysisResult,
  AnalyticsOverview,
  DatasetStatus,
  DatasetValidationResult,
  HealthStatus,
  InspectionList,
  Pothole,
  PotholeList,
  PotholeReport,
  ReportList,
  VideoJob,
  VideoList,
  VideoResult,
} from '@/types/pitscout'

export class ApiError extends Error {
  status: number
  detail: unknown

  constructor(message: string, status: number, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function describeDetail(detail: unknown, fallback: string) {
  if (typeof detail === 'string' && detail.trim()) return detail
  if (detail && typeof detail === 'object') {
    const record = detail as Record<string, unknown>
    if (typeof record.message === 'string') return record.message
    try {
      return JSON.stringify(detail)
    } catch {
      return fallback
    }
  }
  return fallback
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  if (!res.ok) {
    const detail = (body as Record<string, unknown> | null)?.detail ?? body
    throw new ApiError(describeDetail(detail, `Request failed with HTTP ${res.status}`), res.status, detail)
  }
  return body as T
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: 'no-store', ...init })
  return parse<T>(res)
}

function query(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value))
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

function postFormWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
  headers?: Record<string, string>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', path)
    Object.entries(headers || {}).forEach(([key, value]) => xhr.setRequestHeader(key, value))
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onload = () => {
      let body: unknown = null
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        body = xhr.responseText
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T)
        return
      }
      const detail = (body as Record<string, unknown> | null)?.detail ?? body
      reject(new ApiError(describeDetail(detail, `Upload failed with HTTP ${xhr.status}`), xhr.status, detail))
    }
    xhr.onerror = () => reject(new ApiError('Network error while contacting the API.', 0))
    xhr.send(formData)
  })
}

export const clientApi = {
  health: () => requestJson<HealthStatus>('/api/v1/health'),
  analytics: () => requestJson<AnalyticsOverview>('/api/v1/analytics/overview'),
  inspections: (page = 1, pageSize = 20) =>
    requestJson<InspectionList>(`/api/v1/inspections${query({ page, page_size: pageSize })}`),

  reports: (params: { status?: string; pothole_id?: string; page?: number; page_size?: number } = {}) =>
    requestJson<ReportList>(`/api/v1/pothole-reports${query(params)}`),
  report: (id: string) => requestJson<PotholeReport>(`/api/v1/pothole-reports/${id}`),
  relocateReport: (id: string, payload: { latitude: number; longitude: number; accuracy_m?: number | null }) =>
    requestJson<PotholeReport>(`/api/v1/pothole-reports/${id}/location`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  submitReport: (formData: FormData, idempotencyKey: string, onProgress?: (percent: number) => void) =>
    postFormWithProgress<PotholeReport>('/api/v1/pothole-reports', formData, onProgress, {
      'Idempotency-Key': idempotencyKey,
    }),

  potholes: (params: { status?: string; page?: number; page_size?: number } = {}) =>
    requestJson<PotholeList>(`/api/v1/potholes${query(params)}`),
  pothole: (id: string) => requestJson<Pothole>(`/api/v1/potholes/${id}`),
  changePotholeStatus: (id: string, payload: { status: string; reason?: string | null; actor?: string | null }) =>
    requestJson<Pothole>(`/api/v1/potholes/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  uploadImage: (file: File, onProgress?: (percent: number) => void) => {
    const formData = new FormData()
    formData.append('file', file)
    return postFormWithProgress<{ analysis_id: string; inspection_id?: string }>(
      '/api/v1/analysis/image',
      formData,
      onProgress
    )
  },
  analysisResult: (id: string) => requestJson<AnalysisResult>(`/api/v1/analysis/${id}/result`),
  imageReport: (analysisId: string) => requestJson<AnalysisResult>(`/api/v1/reports/${analysisId}`),

  videos: (page = 1, pageSize = 20) =>
    requestJson<VideoList>(`/api/v1/videos${query({ page, page_size: pageSize })}`),
  uploadVideo: (file: File, onProgress?: (percent: number) => void) => {
    const formData = new FormData()
    formData.append('file', file)
    return postFormWithProgress<VideoJob>('/api/v1/videos', formData, onProgress)
  },
  video: (id: string) => requestJson<VideoJob>(`/api/v1/videos/${id}`),
  videoResult: (id: string) => requestJson<VideoResult>(`/api/v1/videos/${id}/result`),
  deleteVideo: (id: string) => requestJson<null>(`/api/v1/videos/${id}`, { method: 'DELETE' }),

  datasets: () => requestJson<DatasetStatus>('/api/v1/datasets/status'),
  validateDataset: (name: string) =>
    requestJson<DatasetValidationResult>('/api/v1/datasets/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset_name: name }),
    }),
  prepareDataset: (name: string) =>
    requestJson<DatasetValidationResult>('/api/v1/datasets/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset_name: name }),
    }),

  startTraining: (payload: Record<string, unknown>, kind: 'detection' | 'authenticity') =>
    requestJson<{ job_id?: string; status?: string; detail?: string }>(
      `/api/v1/training/${kind}/start`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    ),
  trainingLogs: (id: string) =>
    requestJson<{ logs: string; status: string }>(`/api/v1/training/${id}/logs`),
}
