'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useDropzone } from 'react-dropzone'
import { motion } from 'framer-motion'
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ScanEye,
  ShieldCheck,
  Flame,
  RefreshCw,
  Route,
  FileText,
  CircleDot,
  Activity,
  Layers,
  ImageOff,
} from 'lucide-react'
import { DamageViewer } from '@/components/DamageViewer'
import { DamageDetailPanel } from '@/components/DamageDetailPanel'
import {
  PageHeader,
  StatCard,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  SeverityBadge,
  EmptyState,
  Progress,
} from '@/components/ui'
import { clientApi } from '@/lib/client-api'
import { classLabel, formatBytes, formatNumber, shortId } from '@/lib/format'

const PIPELINE_STEPS = [
  { id: 'image_validation', label: 'Image validation', detail: 'Format, decode and EXIF orientation' },
  { id: 'authenticity_check', label: 'Authenticity screen', detail: 'Heuristic provenance screening' },
  { id: 'detection', label: 'Defect detection', detail: 'Server-side road-damage inference' },
  { id: 'measurement_severity_causes', label: 'Measurement and severity', detail: 'Geometry, scoring and cause hypotheses' },
  { id: 'annotation', label: 'Annotation overlay', detail: 'Evidence boxes when defects are found' },
  { id: 'report_assembly', label: 'Report assembly', detail: 'Assemble the inspection payload' },
] as const

const STAGE_INDEX: Record<string, number> = Object.fromEntries(
  PIPELINE_STEPS.map((step, index) => [step.id, index])
)

type StepState = 'idle' | 'running' | 'completed' | 'failed'

export default function InspectPage() {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<any | null>(null)
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState<string | null>(null)
  const [pollAttempts, setPollAttempts] = useState(0)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const previewRef = useRef<string | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, [])

  const resetAll = useCallback(() => {
    stopPolling()
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current)
      previewRef.current = null
    }
    setFile(null)
    setPreviewUrl(null)
    setUploadProgress(0)
    setUploading(false)
    setAnalysisId(null)
    setAnalysisResult(null)
    setSelectedDetectionId(null)
    setError(null)
    setStage(null)
    setPollAttempts(0)
  }, [stopPolling])

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return
      const selected = acceptedFiles[0]
      stopPolling()
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
      const url = URL.createObjectURL(selected)
      previewRef.current = url
      setFile(selected)
      setPreviewUrl(url)
      setAnalysisResult(null)
      setAnalysisId(null)
      setSelectedDetectionId(null)
      setError(null)
      setStage(null)
      setUploadProgress(0)
      setPollAttempts(0)
      setUploading(false)
    },
    [stopPolling]
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    onDropRejected: (rejections) => {
      const reason = rejections[0]?.errors?.[0]?.code
      setError(
        reason === 'file-too-large'
          ? 'That image is larger than 50 MB. Resize it and try again.'
          : reason === 'file-invalid-type'
            ? 'Unsupported file type. Use JPEG, PNG, WEBP or BMP.'
            : 'The image could not be accepted. Check the file and try again.'
      )
    },
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.bmp'] },
    maxSize: 50 * 1024 * 1024,
    multiple: false,
  })

  const pollAnalysis = useCallback(
    (id: string) => {
      stopPolling()
      let attempts = 0
      let inFlight = false

      const tick = async () => {
        if (inFlight) return
        inFlight = true
        attempts += 1
        setPollAttempts(attempts)
        try {
          const res = await fetch(`/api/v1/analysis/${id}/result`, { cache: 'no-store' })
          if (res.status === 200) {
            const result = await res.json()
            stopPolling()
            setAnalysisResult(result)
            setStage('done')
            setUploading(false)
            setSelectedDetectionId(result?.detections?.[0]?.detection_id ?? null)
            return
          }
          if (res.status === 202) {
            const body = await res.json().catch(() => null)
            if (body?.pipeline_stage) setStage(body.pipeline_stage)
            if (attempts >= 40) {
              stopPolling()
              setUploading(false)
              setStage('timeout')
              setError(
                'The analysis did not finish within 48 seconds. The job may still be running on the server — check the inspections log before resubmitting.'
              )
            }
            return
          }
          const body = await res.json().catch(() => null)
          stopPolling()
          setUploading(false)
          setStage('failed')
          setError(
            body?.detail ||
              body?.error ||
              `Analysis failed with HTTP ${res.status}. The inspection was preserved on the server.`
          )
        } catch (err: any) {
          stopPolling()
          setUploading(false)
          setStage('failed')
          setError(err?.message || 'Could not reach the analysis status endpoint.')
        } finally {
          inFlight = false
        }
      }

      pollRef.current = setInterval(() => {
        void tick()
      }, 1200)
      void tick()
    },
    [stopPolling]
  )

  const startAnalysis = async () => {
    if (!file || uploading) return
    stopPolling()
    setUploading(true)
    setError(null)
    setAnalysisResult(null)
    setSelectedDetectionId(null)
    setUploadProgress(0)
    setPollAttempts(0)
    setStage('uploading')

    try {
      const upload = await clientApi.uploadImage(file, (percent) => setUploadProgress(percent))
      setAnalysisId(upload.analysis_id)
      setStage('queued')
      pollAnalysis(upload.analysis_id)
    } catch (err: any) {
      setUploading(false)
      setStage(null)
      setError(err?.detail || err?.message || 'The image could not be uploaded.')
    }
  }

  const imageWidth = analysisResult?.image_info?.width || 1280
  const imageHeight = analysisResult?.image_info?.height || 720
  const rawList = analysisResult?.detections || analysisResult?.damage_analysis?.detections || []

  const normalizedDetections = rawList.map((detection: any, idx: number) => {
    const rawBbox = detection.bbox
    const x1 = Array.isArray(rawBbox) ? rawBbox[0] : (rawBbox?.x1 ?? 0)
    const y1 = Array.isArray(rawBbox) ? rawBbox[1] : (rawBbox?.y1 ?? 0)
    const x2 = Array.isArray(rawBbox) ? rawBbox[2] : (rawBbox?.x2 ?? 0)
    const y2 = Array.isArray(rawBbox) ? rawBbox[3] : (rawBbox?.y2 ?? 0)
    const width = Math.max(1, Math.abs(x2 - x1))
    const height = Math.max(1, Math.abs(y2 - y1))
    const className = detection.class_name || detection.class || 'unknown'
    const severityLevel =
      typeof detection.severity === 'string'
        ? detection.severity.toUpperCase()
        : detection.severity?.level || 'UNKNOWN'
    const geometry = detection.measurements || detection.geometry || {}

    // Absent scores, causes and actions stay empty instead of being invented.
    return {
      ...detection,
      detection_id: detection.detection_id || `det-${String(idx + 1).padStart(2, '0')}`,
      class_name: className,
      bbox: { x1, y1, x2, y2 },
      measurements: {
        width_pixels: geometry.width_pixels ?? width,
        height_pixels: geometry.height_pixels ?? height,
        area_pixels: geometry.area_pixels ?? width * height,
        relative_area: geometry.relative_area ?? (width * height) / (imageWidth * imageHeight),
        limitation: geometry.limitation || geometry.measurement_note,
      },
      severity: {
        level: severityLevel,
        score: typeof detection.severity?.score === 'number' ? detection.severity.score : null,
        factors: Array.isArray(detection.severity?.factors) ? detection.severity.factors : [],
      },
      possible_causes: detection.possible_causes || detection.probable_causes || [],
      recommended_actions: detection.recommended_actions || [],
    }
  })

  const selectedDetection =
    normalizedDetections.find((detection: any) => detection.detection_id === selectedDetectionId) ||
    normalizedDetections[0] ||
    null

  const activeIndex = stage ? STAGE_INDEX[stage] ?? -1 : -1
  const isDone = !!analysisResult || stage === 'done'
  const pipelineFailed = (stage === 'failed' || stage === 'timeout') && !analysisResult

  const stepState = (index: number): StepState => {
    if (isDone) return 'completed'
    if (pipelineFailed && activeIndex >= 0) {
      if (index < activeIndex) return 'completed'
      return index === activeIndex ? 'failed' : 'idle'
    }
    if (stage === 'uploading' || stage === 'queued') {
      return index === 0 ? (stage === 'queued' ? 'running' : 'idle') : 'idle'
    }
    if (activeIndex < 0) return 'idle'
    if (index < activeIndex) return 'completed'
    return index === activeIndex ? 'running' : 'idle'
  }

  const summary = analysisResult?.summary
  const authenticity = analysisResult?.authenticity
  const overallSeverity = summary?.overall_severity || 'UNKNOWN'
  const modelPending = analysisResult?.model_ready === false
  const authenticityFlagged =
    authenticity?.verdict && !['natural'].includes(String(authenticity.verdict).toLowerCase())

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Image intelligence"
        title="Image detection"
        description="Submit a road-surface photograph for the eight-stage server pipeline: validation, authenticity screening, defect detection, measurement, severity scoring and report assembly."
        actions={
          analysisResult ? (
            <>
              <Button variant="secondary" asChild>
                <Link href={`/reports/${analysisResult.analysis_id || analysisId}`}>
                  <FileText />
                  Open report
                </Link>
              </Button>
              <Button variant="soft" onClick={resetAll}>
                <RefreshCw />
                New inspection
              </Button>
            </>
          ) : (
            <Badge tone="info" dot>
              8-stage pipeline
            </Badge>
          )
        }
      />

      {!analysisResult ? (
        <div className="grid gap-5 lg:grid-cols-12">
          {/* Upload column */}
          <div className="flex flex-col gap-4 lg:col-span-7">
            <Card>
              <CardContent className="p-4">
                <div
                  {...getRootProps()}
                  className={`flex min-h-[360px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center transition-colors ${
                    isDragActive
                      ? 'border-primary bg-soft'
                      : 'border-line-strong bg-[#fbf9f3] hover:border-primary/50 hover:bg-[#fdf7ee]'
                  }`}
                >
                  <input {...getInputProps()} />
                  {previewUrl ? (
                    <div className="flex flex-col items-center gap-4">
                      <img
                        src={previewUrl}
                        alt="Selected road image preview"
                        className="max-h-60 rounded-lg border border-line object-contain shadow-card"
                      />
                      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-secondary">
                        <Badge tone="neutral">{formatBytes(file?.size)}</Badge>
                        <span className="max-w-[260px] truncate font-medium text-ink">{file?.name}</span>
                      </div>
                      <span className="text-[11px] text-muted">
                        Click or drop another image to replace this one.
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <span className="flex size-16 items-center justify-center rounded-2xl border border-primary/20 bg-soft text-primary-hover">
                        <UploadCloud className="size-7" />
                      </span>
                      <div>
                        <h2 className="font-display text-lg font-semibold text-ink">
                          Drop a road photograph here
                        </h2>
                        <p className="mt-1 text-xs text-secondary">
                          or browse from this device. One image per analysis.
                        </p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
                        {['JPEG', 'PNG', 'WEBP', 'BMP', 'max 50 MB'].map((label) => (
                          <span
                            key={label}
                            className="rounded border border-line bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="mt-2"
                        onClick={(event) => {
                          event.stopPropagation()
                          open()
                        }}
                      >
                        Browse files
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-critical/20 bg-critical-soft p-3.5 text-xs leading-relaxed text-critical">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {uploading && (
              <div className="rounded-xl border border-line bg-card p-4 shadow-card">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 font-medium text-graphite">
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                    {stage === 'queued' ? 'Analysis running on the server' : 'Uploading image'}
                  </span>
                  <span className="font-mono text-[11px] text-muted tabular">
                    {stage === 'queued' ? `poll ${pollAttempts}` : `${Math.round(uploadProgress)}%`}
                  </span>
                </div>
                <div className="mt-2.5">
                  <Progress
                    value={stage === 'queued' ? Math.min(95, 20 + pollAttempts * 2) : uploadProgress}
                    tone={stage === 'queued' ? 'info' : 'primary'}
                  />
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  {stage === 'queued'
                    ? 'The browser polls the authenticated API every 1.2 seconds. Status comes from the server job, not a simulated timer.'
                    : 'The image is sent through the same-origin API proxy; the API key stays on the server.'}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={startAnalysis} disabled={!file || uploading} loading={uploading} size="lg">
                <ScanEye />
                {uploading ? 'Analysis in progress' : 'Run road analysis'}
              </Button>
              {file && !uploading && (
                <Button variant="ghost" size="lg" onClick={resetAll}>
                  Clear
                </Button>
              )}
              <span className="ml-auto text-[11px] text-muted">
                Results are also stored in the inspection log.
              </span>
            </div>
          </div>

          {/* Pipeline column */}
          <div className="flex flex-col gap-4 lg:col-span-5">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Pipeline execution</CardTitle>
                  <p className="mt-1 text-[11px] text-muted">
                    Stage names are reported by the backend job.
                  </p>
                </div>
                <Badge tone={uploading ? 'primary' : pipelineFailed ? 'critical' : 'neutral'} dot>
                  {stage === 'uploading'
                    ? 'Uploading'
                    : stage === 'queued'
                      ? 'Queued'
                      : pipelineFailed
                        ? 'Failed'
                        : isDone
                          ? 'Complete'
                          : 'Standby'}
                </Badge>
              </CardHeader>
              <CardContent className="pt-4">
                <ol className="flex flex-col gap-1.5">
                  {PIPELINE_STEPS.map((step, index) => {
                    const state = stepState(index)
                    return (
                      <li
                        key={step.id}
                        className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                          state === 'completed'
                            ? 'border-success/15 bg-success-soft/60'
                            : state === 'running'
                              ? 'border-primary/25 bg-soft'
                              : state === 'failed'
                                ? 'border-critical/20 bg-critical-soft'
                                : 'border-transparent bg-[#fbf9f3]'
                        }`}
                      >
                        <div className="min-w-0">
                          <p
                            className={`text-xs font-medium ${
                              state === 'idle' ? 'text-muted' : 'text-ink'
                            }`}
                          >
                            {step.label}
                          </p>
                          <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">{step.detail}</p>
                        </div>
                        <span className="mt-0.5 shrink-0">
                          {state === 'completed' && <CheckCircle2 className="size-4 text-success" />}
                          {state === 'running' && <Loader2 className="size-4 animate-spin text-primary" />}
                          {state === 'failed' && <AlertCircle className="size-4 text-critical" />}
                          {state === 'idle' && <CircleDot className="size-4 text-[#cfc9bb]" />}
                        </span>
                      </li>
                    )
                  })}
                </ol>
                <p className="mt-3 border-t border-line pt-3 text-[10.5px] leading-relaxed text-muted">
                  A completed run confirms that the pipeline returned a result. It does not guarantee that
                  a detection model checkpoint is loaded.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>What the result contains</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2.5 pt-3 text-xs text-secondary">
                {[
                  { icon: ShieldCheck, text: 'Image validation and authenticity screening with limitations' },
                  { icon: ScanEye, text: 'Bounding boxes, class names and model confidence' },
                  { icon: Activity, text: 'Pixel geometry and explainable severity factors' },
                  { icon: Layers, text: 'Cause hypotheses and recommended inspection actions' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-start gap-2.5 rounded-lg border border-line bg-[#fbf9f3] px-3 py-2">
                    <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span className="leading-relaxed">{text}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col gap-5"
        >
          {/* Summary */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Overall severity"
              value={overallSeverity}
              icon={Flame}
              tone={
                overallSeverity === 'CRITICAL' || overallSeverity === 'HIGH'
                  ? 'critical'
                  : overallSeverity === 'MODERATE'
                    ? 'warning'
                    : 'success'
              }
              hint={
                typeof summary?.overall_severity_score === 'number'
                  ? `${summary.overall_severity_score}/100 composite score`
                  : 'No composite score returned'
              }
            />
            <StatCard
              label="Defects detected"
              value={formatNumber(normalizedDetections.length)}
              icon={ScanEye}
              tone={normalizedDetections.length > 0 ? 'primary' : 'neutral'}
              hint={summary?.total_detections != null ? `${summary.total_detections} reported by the pipeline` : 'Detections in this frame'}
            />
            <StatCard
              label="Authenticity screen"
              value={authenticity?.verdict ? classLabel(authenticity.verdict) : 'Not reported'}
              icon={ShieldCheck}
              tone={authenticityFlagged ? 'warning' : 'info'}
              hint={
                typeof authenticity?.confidence === 'number'
                  ? `${Math.round(authenticity.confidence * 100)}% confidence · ${authenticity.model_used || 'heuristic'}`
                  : 'Heuristic screening, not proof of origin'
              }
            />
            <StatCard
              label="Road condition"
              value={summary?.road_condition ? classLabel(summary.road_condition) : 'Not reported'}
              icon={Route}
              tone={
                summary?.road_condition === 'critical' || summary?.road_condition === 'poor'
                  ? 'critical'
                  : summary?.road_condition === 'fair'
                    ? 'warning'
                    : 'success'
              }
              hint={summary?.immediate_action_required ? 'Immediate action flagged' : 'Based on this frame only'}
            />
          </div>

          {modelPending && (
            <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft p-4 text-xs leading-relaxed text-warning">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <div>
                <span className="block font-semibold text-ink">Detection checkpoint pending</span>
                <span>
                  No fine-tuned damage-detection checkpoint is loaded, so the pipeline can return an empty
                  detection list. Validation, authenticity screening and the eight-stage contract still ran.
                  An empty result is not evidence that the road is defect-free.{' '}
                  <Link href="/training" className="font-semibold underline underline-offset-2">
                    Open model training
                  </Link>{' '}
                  to check readiness.
                </span>
              </div>
            </div>
          )}

          {authenticityFlagged && (
            <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft p-4 text-xs leading-relaxed text-warning">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <div>
                <span className="block font-semibold text-ink">
                  Authenticity screen flagged this image as {classLabel(authenticity.verdict)}
                </span>
                <span>
                  This is a {authenticity?.model_used || 'heuristic'} screen with limited evidence. Verify
                  the submission chain of custody before acting on the result.
                </span>
              </div>
            </div>
          )}

          {normalizedDetections.length === 0 && (
            <EmptyState
              icon={ImageOff}
              title="No defects were returned for this frame"
              description={
                modelPending
                  ? 'The detection model is not ready. Once a checkpoint is available, re-run this inspection to obtain boxes and measurements.'
                  : 'The model returned no detections above threshold. A single image can miss defects; schedule a wider inspection before concluding the road is sound.'
              }
              action={
                <Button variant="secondary" size="sm" onClick={resetAll}>
                  <RefreshCw />
                  Try another image
                </Button>
              }
            />
          )}

          {/* Viewer and inspector */}
          <div className="grid gap-5 lg:grid-cols-12">
            <div className="flex flex-col gap-4 lg:col-span-8">
              <DamageViewer
                originalImageUrl={
                  previewUrl || `/api/v1/analysis/${analysisResult.analysis_id || analysisId}/original-image`
                }
                annotatedImageUrl={
                  analysisResult.annotated_image_url
                    ? analysisResult.annotated_image_url
                    : null
                }
                imageWidth={imageWidth}
                imageHeight={imageHeight}
                detections={normalizedDetections}
                selectedDetectionId={selectedDetectionId || (normalizedDetections[0]?.detection_id ?? null)}
                onSelectDetection={setSelectedDetectionId}
              />

              {normalizedDetections.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Detected defects</CardTitle>
                    <Badge tone="neutral">{normalizedDetections.length}</Badge>
                  </CardHeader>
                  <CardContent className="grid gap-2 pt-4 sm:grid-cols-2 xl:grid-cols-3">
                    {normalizedDetections.map((detection: any) => {
                      const selected =
                        (selectedDetectionId || normalizedDetections[0]?.detection_id) ===
                        detection.detection_id
                      return (
                        <button
                          key={detection.detection_id}
                          type="button"
                          onClick={() => setSelectedDetectionId(detection.detection_id)}
                          className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition ${
                            selected
                              ? 'border-primary/50 bg-soft shadow-[0_0_0_1px_rgba(240,138,66,0.15)]'
                              : 'border-line bg-[#fbf9f3] hover:border-line-strong'
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-ink">
                              {classLabel(detection.class_name)}
                            </span>
                            <span className="mt-0.5 block font-mono text-[10px] text-muted">
                              {detection.detection_id} · {Math.round(detection.confidence * 100)}% conf
                            </span>
                          </div>
                          <SeverityBadge level={detection.severity?.level} />
                        </button>
                      )
                    })}
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="lg:col-span-4">
              <DamageDetailPanel detection={selectedDetection} />
            </div>
          </div>

          {/* Capture diagnostics */}
          {analysisResult.image_info && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Capture diagnostics</CardTitle>
                  <p className="mt-1 text-[11px] text-muted">
                    Reported by the image-validation stage. These describe this file, not road extent.
                  </p>
                </div>
                <Badge tone={analysisResult.quality?.is_acceptable === false ? 'warning' : 'neutral'}>
                  {analysisResult.quality?.score != null
                    ? `Quality ${Math.round(analysisResult.quality.score)}/100`
                    : 'File checks'}
                </Badge>
              </CardHeader>
              <CardContent className="grid gap-x-6 gap-y-3 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                <Diagnostic label="Resolution" value={`${analysisResult.image_info.width} × ${analysisResult.image_info.height} px`} />
                <Diagnostic label="File size" value={formatBytes(analysisResult.image_info.file_size_bytes)} />
                <Diagnostic label="Format" value={`${analysisResult.image_info.format} · ${analysisResult.image_info.mode}`} />
                <Diagnostic
                  label="Blur score"
                  value={`${Number(analysisResult.image_info.blur_score).toFixed(1)}${analysisResult.image_info.is_blurry ? ' · blurry' : ''}`}
                  tone={analysisResult.image_info.is_blurry ? 'warning' : undefined}
                />
                <Diagnostic label="Brightness" value={Number(analysisResult.image_info.brightness).toFixed(2)} />
                <Diagnostic label="Exposure" value={classLabel(analysisResult.image_info.exposure_quality)} />
                <Diagnostic label="MD5" value={String(analysisResult.image_info.md5_hash || '').slice(0, 12)} mono />
                <Diagnostic label="Analysis" value={shortId(analysisResult.analysis_id || analysisId)} mono />
              </CardContent>
              {Array.isArray(analysisResult.quality?.issues) && analysisResult.quality.issues.length > 0 && (
                <div className="border-t border-line px-5 py-3 text-[11px] text-warning">
                  Quality flags: {analysisResult.quality.issues.join(', ')}
                </div>
              )}
            </Card>
          )}
        </motion.div>
      )}
    </div>
  )
}

function Diagnostic({
  label,
  value,
  tone,
  mono,
}: {
  label: string
  value: string
  tone?: 'warning'
  mono?: boolean
}) {
  return (
    <div>
      <p className="label-mono">{label}</p>
      <p
        className={`mt-0.5 truncate text-[12.5px] font-medium ${
          tone === 'warning' ? 'text-warning' : 'text-ink'
        } ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value || '—'}
      </p>
    </div>
  )
}
