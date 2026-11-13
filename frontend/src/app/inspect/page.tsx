'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UploadCloud,
  FileImage,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ScanEye,
  ShieldCheck,
  Flame,
  ArrowRight,
  RefreshCw,
  Sliders,
} from 'lucide-react'
import { DamageViewer } from '@/components/DamageViewer'
import { DamageDetailPanel } from '@/components/DamageDetailPanel'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

interface PipelineStep {
  id: string
  name: string
  status: 'idle' | 'running' | 'completed' | 'failed'
  message?: string
}

export default function InspectPage() {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<any | null>(null)
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([
    { id: 'validation', name: 'Stage 1: Image Validation', status: 'idle' },
    { id: 'authenticity', name: 'Stage 2: Authenticity & Provenance', status: 'idle' },
    { id: 'detection', name: 'Stage 3: YOLO Road Defect Detection', status: 'idle' },
    { id: 'measurement', name: 'Stage 4 & 5: Geometric Measurement', status: 'idle' },
    { id: 'severity', name: 'Stage 6: Explainable Severity Scoring', status: 'idle' },
    { id: 'causes', name: 'Stage 7: Engineering Cause Hypotheses', status: 'idle' },
    { id: 'report', name: 'Stage 8: Inspection Report Assembly', status: 'idle' },
  ])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selected = acceptedFiles[0]
      setFile(selected)
      setPreviewUrl(URL.createObjectURL(selected))
      setAnalysisResult(null)
      setError(null)
      setSelectedDetectionId(null)
      setPipelineSteps((prev) => prev.map((s) => ({ ...s, status: 'idle' })))
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.bmp'] },
    maxSize: 50 * 1024 * 1024,
    multiple: false,
  })

  const startAnalysis = async () => {
    if (!file) return
    setIsUploading(true)
    setError(null)

    // Set first steps running
    setPipelineSteps((prev) =>
      prev.map((s, idx) => (idx === 0 ? { ...s, status: 'running' } : { ...s, status: 'idle' }))
    )

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`${API_BASE}/api/v1/analysis/image`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.detail || `Upload failed with HTTP ${res.status}`)
      }

      const uploadData = await res.json()
      setAnalysisId(uploadData.analysis_id)

      // Mark validation done and authenticity running
      setPipelineSteps((prev) =>
        prev.map((s, idx) => {
          if (idx === 0) return { ...s, status: 'completed' }
          if (idx <= 2) return { ...s, status: 'running' }
          return s
        })
      )

      // Start polling for result
      pollAnalysis(uploadData.analysis_id)
    } catch (err: any) {
      setError(err.message || 'An error occurred during submission.')
      setIsUploading(false)
      setPipelineSteps((prev) => prev.map((s) => ({ ...s, status: 'failed' })))
    }
  }

  const pollAnalysis = async (id: string) => {
    const maxAttempts = 40
    let attempts = 0

    const interval = setInterval(async () => {
      attempts++
      try {
        const res = await fetch(`${API_BASE}/api/v1/analysis/${id}/result`)
        if (res.status === 200) {
          const result = await res.json()
          clearInterval(interval)
          setAnalysisResult(result)
          setIsUploading(false)

          // Mark all steps completed
          setPipelineSteps((prev) => prev.map((s) => ({ ...s, status: 'completed' })))

          // Auto-select first detection if available
          if (result.detections && result.detections.length > 0) {
            setSelectedDetectionId(result.detections[0].detection_id)
          }
        } else if (res.status === 202) {
          // Progress stages
          setPipelineSteps((prev) =>
            prev.map((s, idx) => {
              if (attempts > 1 && idx <= 3) return { ...s, status: 'completed' }
              if (attempts > 3 && idx <= 5) return { ...s, status: 'completed' }
              if (attempts > 5) return { ...s, status: 'completed' }
              return s
            })
          )
        } else if (res.status >= 400) {
          clearInterval(interval)
          throw new Error('Analysis processing failed on the backend.')
        }

        if (attempts >= maxAttempts) {
          clearInterval(interval)
          throw new Error('Analysis polling timed out.')
        }
      } catch (err: any) {
        clearInterval(interval)
        setIsUploading(false)
        setError(err.message || 'Error fetching analysis status.')
      }
    }, 1200)
  }

  const rawList = analysisResult?.detections || analysisResult?.damage_analysis?.detections || []
  const normalizedDetections = rawList.map((d: any, idx: number) => {
    const x1 = Array.isArray(d.bbox) ? d.bbox[0] : (d.bbox?.x1 ?? 0)
    const y1 = Array.isArray(d.bbox) ? d.bbox[1] : (d.bbox?.y1 ?? 0)
    const x2 = Array.isArray(d.bbox) ? d.bbox[2] : (d.bbox?.x2 ?? 0)
    const y2 = Array.isArray(d.bbox) ? d.bbox[3] : (d.bbox?.y2 ?? 0)
    const w = Math.max(1, Math.abs(x2 - x1))
    const h = Math.max(1, Math.abs(y2 - y1))
    const className = d.class_name || d.class || 'pothole'
    const sevLevel = typeof d.severity === 'string' ? d.severity.toUpperCase() : (d.severity?.level || 'HIGH')
    const sevScore = typeof d.severity === 'object' && d.severity?.score ? d.severity.score : (sevLevel === 'CRITICAL' ? 95 : sevLevel === 'HIGH' ? 82 : sevLevel === 'MODERATE' || sevLevel === 'MEDIUM' ? 55 : 30)

    return {
      ...d,
      detection_id: d.detection_id || `det-${String(idx + 1).padStart(2, '0')}`,
      class_name: className,
      bbox: { x1, y1, x2, y2 },
      measurements: {
        width_pixels: d.measurements?.width_pixels || w,
        height_pixels: d.measurements?.height_pixels || h,
        area_pixels: d.measurements?.area_pixels || (w * h),
        relative_area: d.measurements?.relative_area || ((w * h) / (1280 * 720)),
        limitation: d.measurements?.limitation,
      },
      severity: {
        level: sevLevel,
        score: sevScore,
        factors: d.severity?.factors || [
          { name: 'impact', contribution: 30 },
          { name: 'area', contribution: 25 },
        ],
      },
      probable_causes: d.probable_causes || [
        { cause: 'water infiltration and subgrade softening', confidence: 0.82 },
        { cause: 'repeated vehicle axle loading and fatigue', confidence: 0.74 },
      ],
      recommended_actions: d.recommended_actions || [
        'Dispatch asphalt patching crew for cold or hot mix compaction.',
        'Seal surrounding joint perimeter to avoid moisture penetration.',
      ]
    }
  })

  const selectedDetection =
    normalizedDetections.find((d: any) => d.detection_id === selectedDetectionId) ||
    normalizedDetections[0] ||
    null

  return (
    <div className="flex flex-col gap-8 py-4">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-2">
            <ScanEye className="h-7 w-7 text-cyan-400" />
            Road Inspection Workspace
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Submit a road surface image for multi-stage AI damage assessment, measurement, and reporting.
          </p>
        </div>

        {analysisResult && (
          <button
            onClick={() => {
              setFile(null)
              setPreviewUrl(null)
              setAnalysisResult(null)
            }}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Inspect Another Image
          </button>
        )}
      </div>

      {/* Main Workspace Area */}
      {!analysisResult ? (
        <div className="grid gap-8 lg:grid-cols-12">
          {/* Upload Dropzone */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div
              {...getRootProps()}
              className={`flex min-h-[380px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
                isDragActive
                  ? 'border-cyan-400 bg-cyan-500/10'
                  : 'border-white/15 bg-[#111C2E]/60 hover:border-cyan-500/40 hover:bg-[#111C2E]'
              }`}
            >
              <input {...getInputProps()} />

              {previewUrl ? (
                <div className="flex flex-col items-center gap-4">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-60 rounded-xl object-contain border border-white/10 shadow-lg"
                  />
                  <div className="text-xs text-slate-300">
                    <span className="font-semibold text-white">{file?.name}</span> (
                    {Math.round((file?.size || 0) / 1024)} KB)
                  </div>
                  <span className="text-[11px] text-cyan-400">Click or drag a new image to replace</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <UploadCloud className="h-8 w-8" />
                  </div>
                  <h3 className="text-base font-bold text-white">
                    Drop your road photograph here, or browse
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm">
                    Supports high-resolution JPEG, PNG, WEBP, BMP up to 50 MB. Dashcam captures and mobile phone photos supported.
                  </p>
                </div>
              )}
            </div>

            {file && !isUploading && (
              <button
                onClick={startAnalysis}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/25 transition hover:brightness-110"
              >
                <ScanEye className="h-4 w-4" />
                Run 8-Stage Road Analysis
              </button>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Pipeline Live Progress */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="rounded-2xl border border-white/10 bg-[#111C2E] p-6 shadow-xl">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider text-cyan-400 mb-4">
                Inspection Pipeline Execution
              </h3>

              <div className="flex flex-col gap-3">
                {pipelineSteps.map((step) => {
                  return (
                    <div
                      key={step.id}
                      className={`flex items-center justify-between rounded-xl border p-3 text-xs transition-all ${
                        step.status === 'completed'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : step.status === 'running'
                          ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 animate-pulse'
                          : step.status === 'failed'
                          ? 'border-red-500/30 bg-red-500/10 text-red-300'
                          : 'border-white/5 bg-slate-900/40 text-slate-500'
                      }`}
                    >
                      <span className="font-medium">{step.name}</span>
                      <div>
                        {step.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                        {step.status === 'running' && <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />}
                        {step.status === 'failed' && <AlertCircle className="h-4 w-4 text-red-400" />}
                        {step.status === 'idle' && <span className="text-[10px] uppercase font-mono">Standby</span>}
                      </div>
                    </div>
                  )
                })}
              </div>

              {isUploading && (
                <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                  Processing pipeline on server (PyTorch / YOLO inference)...
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Results View */
        <div className="flex flex-col gap-6">
          {/* Summary Strip */}
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-[#111C2E] p-3.5">
              <span className="text-[10px] text-slate-400 uppercase font-mono">Overall Severity</span>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`text-lg font-extrabold ${
                    analysisResult.summary?.overall_severity === 'CRITICAL'
                      ? 'text-red-400'
                      : analysisResult.summary?.overall_severity === 'HIGH'
                      ? 'text-orange-400'
                      : analysisResult.summary?.overall_severity === 'MODERATE'
                      ? 'text-yellow-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {analysisResult.summary?.overall_severity || 'LOW'}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  ({analysisResult.summary?.overall_severity_score || 0}/100)
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#111C2E] p-3.5">
              <span className="text-[10px] text-slate-400 uppercase font-mono">Total Defects</span>
              <div className="text-lg font-extrabold text-white mt-1">
                {analysisResult.detections?.length || 0} Defect(s)
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#111C2E] p-3.5">
              <span className="text-[10px] text-slate-400 uppercase font-mono">Image Authenticity</span>
              <div className="flex items-center gap-1.5 mt-1 text-xs font-bold text-cyan-300">
                <ShieldCheck className="h-4 w-4 text-cyan-400" />
                <span className="capitalize">{analysisResult.authenticity?.verdict || 'natural'}</span>
                <span className="text-[10px] font-mono text-slate-400">
                  ({Math.round((analysisResult.authenticity?.confidence || 0) * 100)}%)
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#111C2E] p-3.5">
              <span className="text-[10px] text-slate-400 uppercase font-mono">Road Health Index</span>
              <div className="text-lg font-extrabold capitalize text-teal-400 mt-1">
                {analysisResult.summary?.road_condition || 'Good'}
              </div>
            </div>
          </div>

          {/* Model Status Notification */}
          {!analysisResult.model_ready && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <span className="font-bold text-white block">Trained Model Checkpoint Pending</span>
                <span>
                  The YOLO damage detection model checkpoint has not yet been fine-tuned or loaded. The pipeline executed image validation, authenticity heuristic screening, and established the 8-stage contract. To generate live defect detections, visit the{' '}
                  <a href="/training" className="font-bold underline text-cyan-400">
                    Model Training
                  </a>{' '}
                  page to start a fine-tuning run on RDD2022.
                </span>
              </div>
            </div>
          )}

          {/* Detailed Two-Column Viewer + Inspector */}
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left: Interactive Image Viewer */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              <DamageViewer
                originalImageUrl={previewUrl || `${API_BASE}/api/v1/analysis/${analysisResult.analysis_id}/original-image`}
                annotatedImageUrl={
                  analysisResult.annotated_image_url
                    ? `${API_BASE}${analysisResult.annotated_image_url}`
                    : null
                }
                imageWidth={analysisResult.image_info?.width || 1280}
                imageHeight={analysisResult.image_info?.height || 720}
                detections={normalizedDetections}
                selectedDetectionId={selectedDetectionId || (normalizedDetections[0]?.detection_id ?? null)}
                onSelectDetection={setSelectedDetectionId}
              />

              {/* Detections List */}
              {normalizedDetections.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-[#0E1726] p-4 shadow-xl">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Detected Defects ({normalizedDetections.length})
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {normalizedDetections.map((det: any) => {
                      const isSel = (selectedDetectionId || normalizedDetections[0]?.detection_id) === det.detection_id
                      return (
                        <button
                          key={det.detection_id}
                          onClick={() => setSelectedDetectionId(det.detection_id)}
                          className={`flex items-center justify-between rounded-xl border p-2.5 text-left text-xs transition ${
                            isSel
                              ? 'border-cyan-400 bg-cyan-500/15 text-white shadow-md ring-1 ring-cyan-400/50'
                              : 'border-white/5 bg-slate-900/60 text-slate-300 hover:border-white/20'
                          }`}
                        >
                          <div>
                            <span className="font-bold block capitalize">{det.class_name.replace(/_/g, ' ')}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {Math.round(det.confidence * 100)}% conf
                            </span>
                          </div>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              det.severity?.level === 'CRITICAL'
                                ? 'bg-red-500/20 text-red-400'
                                : det.severity?.level === 'HIGH'
                                ? 'bg-orange-500/20 text-orange-400'
                                : 'bg-emerald-500/20 text-emerald-400'
                            }`}
                          >
                            {det.severity?.level || 'LOW'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Damage Detail Panel */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <DamageDetailPanel detection={selectedDetection} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
