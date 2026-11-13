'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  Gauge,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Server,
  SlidersHorizontal,
  Terminal,
  XCircle,
} from 'lucide-react'
import {
  PageHeader,
  StatCard,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  Field,
  Input,
  Select,
  SectionLabel,
} from '@/components/ui'
import type { DatasetStatus, HealthStatus } from '@/types/pitscout'
import { clientApi } from '@/lib/client-api'
import { formatNumber } from '@/lib/format'

type ModelKind = 'detection' | 'authenticity'

function errorMessage(err: any, fallback: string) {
  const detail = err?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') return detail.detail || detail.error || fallback
  return err?.message || fallback
}

export default function TrainingPage() {
  const [modelType, setModelType] = useState<ModelKind>('detection')
  const [epochs, setEpochs] = useState(30)
  const [batchSize, setBatchSize] = useState(8)
  const [imgSize, setImgSize] = useState(640)
  const [learningRate, setLearningRate] = useState(0.01)
  const [device, setDevice] = useState('cpu')

  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [datasets, setDatasets] = useState<DatasetStatus | null>(null)
  const [readinessLoading, setReadinessLoading] = useState(true)
  const [isStarting, setIsStarting] = useState(false)
  const [response, setResponse] = useState<{
    tone: 'success' | 'warning' | 'error'
    title: string
    message: string
  } | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<string | null>(null)
  const [logs, setLogs] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadReadiness = useCallback(async () => {
    setReadinessLoading(true)
    const [healthResult, datasetResult] = await Promise.allSettled([clientApi.health(), clientApi.datasets()])
    setHealth(healthResult.status === 'fulfilled' ? healthResult.value : null)
    setDatasets(datasetResult.status === 'fulfilled' ? datasetResult.value : null)
    setReadinessLoading(false)
  }, [])

  useEffect(() => {
    void loadReadiness()
  }, [loadReadiness])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const payload = useMemo(() => {
    if (modelType === 'detection') {
      return {
        dataset_name: 'rdd2022',
        model_type: 'yolov8n',
        epochs: Number(epochs),
        imgsz: Number(imgSize),
        batch: Number(batchSize),
        lr: Number(learningRate),
        device,
      }
    }
    return {
      dataset_name: 'genimage',
      model_type: 'mobilenet_v3_small',
      epochs: Number(epochs),
      batch: Number(batchSize),
      lr: Number(learningRate),
    }
  }, [modelType, epochs, imgSize, batchSize, learningRate, device])

  const startTraining = async () => {
    setIsStarting(true)
    setResponse(null)
    setLogs('')
    setJobStatus(null)
    setJobId(null)
    try {
      const result = await clientApi.startTraining(payload, modelType)
      setJobId(result.job_id || null)
      setJobStatus(result.status || 'submitted')
      setResponse({
        tone: 'success',
        title: 'Training job accepted',
        message: result.job_id ? `Job ${result.job_id} was created.` : 'The backend accepted the training request.',
      })
      if (result.job_id) {
        const id = result.job_id
        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = setInterval(async () => {
          try {
            const log = await clientApi.trainingLogs(id)
            setLogs(log.logs)
            setJobStatus(log.status)
          } catch {
            // A transient log read failure should not clear the console.
          }
        }, 2500)
      }
    } catch (err: any) {
      const status = err?.status
      setResponse({
        tone: status === 501 ? 'warning' : 'error',
        title: status === 501 ? 'Training is not implemented in this deployment' : 'Training request failed',
        message: errorMessage(err, 'The training endpoint could not be reached.'),
      })
    } finally {
      setIsStarting(false)
    }
  }

  const rawFiles = datasets?.summary?.total_raw_files ?? datasets?.datasets.reduce((sum, item) => sum + item.raw_files, 0) ?? 0
  const processedFiles =
    datasets?.summary?.total_processed_files ?? datasets?.datasets.reduce((sum, item) => sum + item.processed_files, 0) ?? 0

  const requirements = [
    {
      label: 'Backend API reachable',
      met: Boolean(health),
      detail: health ? `${health.app} v${health.version}` : 'No health response received.',
    },
    {
      label: 'Detection checkpoint installed',
      met: Boolean(health?.detection_model_ready),
      detail: health?.detection_model_ready ? 'Model reports ready.' : 'The detection checkpoint is not loaded.',
    },
    {
      label: 'Authenticity checkpoint installed',
      met: Boolean(health?.authenticity_model_ready),
      detail: health?.authenticity_model_ready ? 'Model reports ready.' : 'The authenticity checkpoint is not loaded.',
    },
    {
      label: 'Curated dataset prepared',
      met: processedFiles > 0,
      detail:
        processedFiles > 0
          ? `${formatNumber(processedFiles)} processed files detected.`
          : `${formatNumber(rawFiles)} raw files, none processed.`,
    },
  ]

  const unmet = requirements.filter((item) => !item.met).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="System"
        title="Model training"
        description="Inspect training readiness and submit the exact configuration the backend would use. No fake runs, progress bars or accuracy claims."
        actions={
          <>
            <Button variant="secondary" onClick={() => void loadReadiness()} loading={readinessLoading}>
              <RefreshCw />
              Refresh readiness
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/datasets">
                <Database />
                Datasets
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft p-4">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="text-[11.5px] leading-relaxed text-warning">
          <p className="font-semibold">Training is not implemented in this build</p>
          <p className="mt-0.5 opacity-90">
            The backend intentionally answers HTTP 501. It requires a curated, split dataset and a training runtime, and ships
            with neither. The controls below submit a real request so the boundary is visible instead of simulated.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Detection model"
          value={health ? (health.detection_model_ready ? 'Ready' : 'Pending') : '—'}
          hint="from /api/v1/health"
          icon={Cpu}
          tone={health?.detection_model_ready ? 'success' : 'warning'}
        />
        <StatCard
          label="Authenticity model"
          value={health ? (health.authenticity_model_ready ? 'Ready' : 'Pending') : '—'}
          hint="from /api/v1/health"
          icon={Server}
          tone={health?.authenticity_model_ready ? 'success' : 'warning'}
        />
        <StatCard label="Raw dataset files" value={formatNumber(rawFiles)} hint="declared corpora" icon={Database} tone="info" />
        <StatCard
          label="Readiness gaps"
          value={unmet}
          hint="requirements not met"
          icon={Gauge}
          tone={unmet === 0 ? 'success' : 'warning'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-5">
          <Card>
            <CardHeader>
              <div>
                <SectionLabel>Configuration</SectionLabel>
                <CardTitle className="mt-1.5 flex items-center gap-2">
                  <SlidersHorizontal className="size-4 text-primary" />
                  Hyperparameters
                </CardTitle>
                <CardDescription>
                  These values are sent verbatim to the selected training endpoint. Ranges match the backend schema.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Target model" htmlFor="training-model" hint="Detection uses RDD2022; authenticity uses GenImage.">
                <Select
                  id="training-model"
                  value={modelType}
                  onChange={(event) => setModelType(event.target.value as ModelKind)}
                >
                  <option value="detection">YOLOv8n · road damage detection</option>
                  <option value="authenticity">MobileNetV3 · authenticity</option>
                </Select>
              </Field>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="training-epochs" className="text-[11px] font-semibold tracking-wide text-graphite">
                    Epochs
                  </label>
                  <span className="font-mono text-[11px] text-primary-hover">{epochs}</span>
                </div>
                <input
                  id="training-epochs"
                  type="range"
                  min={modelType === 'detection' ? 1 : 5}
                  max={modelType === 'detection' ? 300 : 100}
                  step={5}
                  value={epochs}
                  onChange={(event) => setEpochs(Number(event.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#efebe1] accent-[#f08a42]"
                />
                <div className="mt-1 flex justify-between font-mono text-[9px] text-muted">
                  <span>{modelType === 'detection' ? 1 : 5}</span>
                  <span>{modelType === 'detection' ? 300 : 100}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Batch size" htmlFor="training-batch">
                  <Select
                    id="training-batch"
                    value={batchSize}
                    onChange={(event) => setBatchSize(Number(event.target.value))}
                  >
                    {[4, 8, 16, 32].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </Field>
                {modelType === 'detection' ? (
                  <Field label="Image size (px)" htmlFor="training-size">
                    <Select
                      id="training-size"
                      value={imgSize}
                      onChange={(event) => setImgSize(Number(event.target.value))}
                    >
                      {[320, 416, 640, 1024, 1280].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <Field label="Learning rate" htmlFor="training-lr-auth">
                    <Input
                      id="training-lr-auth"
                      type="number"
                      step="0.0005"
                      min="0.0001"
                      value={learningRate}
                      onChange={(event) => setLearningRate(Number(event.target.value))}
                      className="font-mono"
                    />
                  </Field>
                )}
              </div>

              {modelType === 'detection' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Learning rate" htmlFor="training-lr">
                    <Input
                      id="training-lr"
                      type="number"
                      step="0.001"
                      min="0.0001"
                      value={learningRate}
                      onChange={(event) => setLearningRate(Number(event.target.value))}
                      className="font-mono"
                    />
                  </Field>
                  <Field label="Device" htmlFor="training-device">
                    <Select id="training-device" value={device} onChange={(event) => setDevice(event.target.value)}>
                      <option value="cpu">CPU</option>
                      <option value="cuda">CUDA (if available)</option>
                    </Select>
                  </Field>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-line bg-[#fbf9f3] p-2.5 text-[10.5px] leading-relaxed text-muted">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Nothing is trained locally. This form issues a real POST to{' '}
                  <span className="font-mono">/api/v1/training/{modelType}/start</span> through the server-side proxy.
                </span>
              </div>

              <Button className="w-full" onClick={startTraining} loading={isStarting} disabled={!health}>
                {isStarting ? 'Submitting request…' : 'Submit training request'}
                {!isStarting && <Play />}
              </Button>
              {!health && (
                <p className="text-[10.5px] leading-relaxed text-warning">
                  The API is unreachable, so the request cannot be submitted.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <SectionLabel>Request body</SectionLabel>
                <CardTitle className="mt-1.5">Exact JSON payload</CardTitle>
              </div>
              <Badge tone="neutral">{modelType}</Badge>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-xl border border-line bg-[#fbf9f3] p-3 font-mono text-[10.5px] leading-relaxed text-graphite">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-5 lg:col-span-7">
          <Card>
            <CardHeader>
              <div>
                <SectionLabel>Readiness</SectionLabel>
                <CardTitle className="mt-1.5">What this deployment would need</CardTitle>
              </div>
              <Badge tone={unmet === 0 ? 'success' : 'warning'} dot>
                {unmet === 0 ? 'Ready' : `${unmet} gap${unmet === 1 ? '' : 's'}`}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {requirements.map((item) => (
                <div
                  key={item.label}
                  className="flex items-start gap-2.5 rounded-xl border border-line bg-[#fbf9f3] p-3"
                >
                  {readinessLoading ? (
                    <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted" />
                  ) : item.met ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-warning" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-ink">{item.label}</p>
                    <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">{item.detail}</p>
                  </div>
                </div>
              ))}
              <p className="pt-1 text-[10.5px] leading-relaxed text-muted">
                Even when all four are met, the backend must implement a training runner before a job can exist. Readiness
                here is informational, not a promise that training will start.
              </p>
            </CardContent>
          </Card>

          {response && (
            <div
              className={`rounded-xl border p-4 ${
                response.tone === 'success'
                  ? 'border-success/20 bg-success-soft'
                  : response.tone === 'warning'
                    ? 'border-warning/25 bg-warning-soft'
                    : 'border-critical/20 bg-critical-soft'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {response.tone === 'success' ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                ) : response.tone === 'warning' ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                ) : (
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-critical" />
                )}
                <div>
                  <p
                    className={`text-[12.5px] font-semibold ${
                      response.tone === 'success'
                        ? 'text-success'
                        : response.tone === 'warning'
                          ? 'text-warning'
                          : 'text-critical'
                    }`}
                  >
                    {response.title}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-secondary">{response.message}</p>
                  {jobId && (
                    <p className="mt-1 font-mono text-[10.5px] text-ink">
                      job {jobId} · status {jobStatus || 'unknown'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Terminal className="size-4 text-primary" />
                <span className="text-[12.5px] font-semibold text-ink">Training telemetry</span>
              </div>
              <Badge tone={jobStatus ? 'info' : 'neutral'} dot={Boolean(jobStatus)}>
                {jobStatus || 'no active job'}
              </Badge>
            </div>
            <div className="bg-graphite p-4">
              <pre className="min-h-[240px] max-h-[360px] overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[#d8d4c8]">
                {logs ||
                  [
                    'PitScout training console',
                    '-------------------------',
                    '',
                    'No training job exists.',
                    'The submission endpoint currently answers HTTP 501.',
                    'A real job would appear here via /api/v1/training/{job_id}/logs.',
                  ].join('\n')}
              </pre>
            </div>
          </Card>

          <p className="flex items-start gap-2 text-[10.5px] leading-relaxed text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Model accuracy is never claimed here. Any future checkpoint must be evaluated on a held-out split before its
            metrics are displayed as real.
          </p>
        </div>
      </div>
    </div>
  )
}
