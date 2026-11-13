'use client'

import React, { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  FileText,
  Info,
  Printer,
  ShieldCheck,
  Waves,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  SeverityBadge,
  Skeleton,
  StatusBadge,
} from '@/components/ui'
import { ApiError, clientApi } from '@/lib/client-api'
import { classLabel, formatBytes, formatDateTime, formatPercent, formatRatioPercent, humanize } from '@/lib/format'
import type { AnalysisResult, NormalizedDetection } from '@/types/pitscout'

const AUTHENTICITY_TONE: Record<string, 'success' | 'warning' | 'critical' | 'neutral'> = {
  NATURAL: 'success',
  AUTHENTIC: 'success',
  UNCERTAIN: 'warning',
  SUSPICIOUS: 'critical',
  SYNTHETIC: 'critical',
}

function causeOf(detection: NormalizedDetection) {
  const causes = detection.possible_causes || detection.probable_causes || []
  return causes[0]?.cause || 'Under investigation'
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 503) {
      return 'The analysis service is unavailable. Confirm the backend is running on port 8001 and ROADGUARD_API_KEY is set in the frontend server environment.'
    }
    if (error.status === 404) {
      return 'No stored analysis matches this identifier. The dossier is only available for completed image analyses.'
    }
    return error.message
  }
  return 'The dossier could not be loaded.'
}

function Dossier() {
  const params = useParams<{ id: string }>()
  const id = typeof params?.id === 'string' ? params.id : ''
  const [report, setReport] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      setReport(await clientApi.imageReport(id))
    } catch (err) {
      setReport(null)
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-3 w-96 max-w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !report) {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <CardContent className="flex flex-col items-center gap-3 py-12">
          <span className="flex size-11 items-center justify-center rounded-full border border-warning/25 bg-warning-soft text-warning">
            <AlertTriangle className="size-5" />
          </span>
          <h1 className="font-display text-lg font-semibold text-ink">Dossier unavailable</h1>
          <p className="max-w-md text-xs leading-relaxed text-secondary">{error}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link href="/inspect">
                <ArrowLeft /> Image detection
              </Link>
            </Button>
            <Button size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const summary = report.summary
  const verdict = (report.authenticity?.verdict || 'UNKNOWN').toUpperCase()
  const originalImage = `/api/v1/analysis/${report.analysis_id}/original-image`
  const annotatedImage = report.annotated_image_url || `/api/v1/analysis/${report.analysis_id}/annotated-image`
  const detections = report.detections || []
  const recordedAt = formatDateTime(report.created_at)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 print:max-w-none print:gap-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-col gap-1">
          <Link
            href="/inspect"
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition hover:text-ink"
          >
            <ArrowLeft className="size-3" /> Image detection
          </Link>
          <h1 className="font-display text-[22px] font-semibold leading-tight text-ink">Inspection dossier</h1>
          <p className="text-xs text-secondary">
            Read-only report assembled from one stored analysis. Dossier key: <span className="font-mono text-ink">{report.analysis_id}</span>
          </p>
        </div>
        <Button onClick={() => window.print()}>
          <Printer /> Print / export PDF
        </Button>
      </div>

      <Card className="print:rounded-none print:border-0 print:shadow-none">
        <div className="flex flex-col gap-4 border-b border-line px-6 py-5 md:flex-row md:items-start md:justify-between print:border-graphite/20">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary-hover">PitScout assessment dossier</p>
            <h2 className="mt-1 font-display text-[20px] font-semibold leading-tight text-ink">
              Pavement inspection report
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-secondary">
              <span className="inline-flex items-center gap-1.5">
                <Camera className="size-3.5 text-muted" /> {report.image_info?.filename || 'Stored image'}
              </span>
              <span className="font-mono text-[10px] text-muted">Recorded {recordedAt}</span>
              {report.inspection_id && (
                <span className="font-mono text-[10px] text-muted">Inspection {report.inspection_id}</span>
              )}
            </div>
          </div>
          <div className="shrink-0 rounded-xl border border-line bg-[#faf8f2] px-4 py-3 text-right print:bg-white">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">Overall severity</p>
            <div className="mt-1.5">
              <SeverityBadge level={summary?.overall_severity} />
            </div>
            <p className="mt-1 font-display text-lg font-semibold text-ink">
              {summary?.overall_severity_score ?? 0}
              <span className="text-xs font-normal text-muted"> / 100</span>
            </p>
          </div>
        </div>

        <div className="grid gap-3 px-6 py-5 sm:grid-cols-3 print:gap-2">
          <div className="rounded-xl border border-line bg-[#faf8f2] p-3.5 print:bg-white">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Defects identified</p>
            <p className="mt-1 font-display text-lg font-semibold text-ink">
              {summary?.total_detections ?? detections.length} <span className="text-xs font-normal text-muted">regions</span>
            </p>
          </div>
          <div className="rounded-xl border border-line bg-[#faf8f2] p-3.5 print:bg-white">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Authenticity</p>
            <div className="mt-1.5 flex items-center gap-2">
              <Badge tone={AUTHENTICITY_TONE[verdict] || 'neutral'}>{humanize(verdict)}</Badge>
              <span className="text-[11px] text-secondary">{formatPercent(report.authenticity?.confidence, 0)}</span>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-[#faf8f2] p-3.5 print:bg-white">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Recommended action</p>
            <p className="mt-1 text-[13px] font-semibold text-ink">
              {summary?.immediate_action_required ? 'Immediate repair' : 'Routine monitoring'}
            </p>
            <p className="text-[10px] text-muted">{humanize(summary?.road_condition)}</p>
          </div>
        </div>

        {!report.model_ready && (
          <div className="mx-6 mb-4 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-[11px] text-warning print:mx-0">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Detection model was not loaded for this analysis. Treat the empty or partial defect list as unavailable rather than
            as evidence that the road is undamaged.
          </div>
        )}

        <div className="border-t border-line px-6 py-5 print:border-graphite/20">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-secondary">Visual evidence</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <figure className="flex flex-col gap-1.5">
              <figcaption className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">Original submission</figcaption>
              {/* Same-origin proxy routes attach the server-side API key; <img> cannot send it directly. */}
              <img
                src={originalImage}
                alt={`Original road image for analysis ${report.analysis_id}`}
                className="max-h-72 w-full rounded-xl border border-line bg-[#f6f3ec] object-contain"
                loading="lazy"
              />
            </figure>
            <figure className="flex flex-col gap-1.5">
              <figcaption className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">Model localisation</figcaption>
              {report.annotated_image_url ? (
                <img
                  src={annotatedImage}
                  alt={`Annotated detections for analysis ${report.analysis_id}`}
                  className="max-h-72 w-full rounded-xl border border-line bg-[#f6f3ec] object-contain"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-line bg-[#faf8f2] text-[11px] text-muted">
                  No annotated overlay was produced for this analysis.
                </div>
              )}
            </figure>
          </div>
        </div>

        <div className="border-t border-line px-6 py-5 print:border-graphite/20">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-secondary">Defect breakdown</h3>
          {detections.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b border-line font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
                    <th className="py-2 pr-3 font-medium">ID</th>
                    <th className="py-2 pr-3 font-medium">Class</th>
                    <th className="py-2 pr-3 font-medium">Confidence</th>
                    <th className="py-2 pr-3 font-medium">Severity</th>
                    <th className="py-2 pr-3 font-medium">Area</th>
                    <th className="py-2 font-medium">Primary hypothesis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {detections.map((detection) => (
                    <tr key={detection.detection_id} className="align-top">
                      <td className="py-2.5 pr-3 font-mono text-[10px] text-secondary">{detection.detection_id}</td>
                      <td className="py-2.5 pr-3 font-medium text-ink">{classLabel(detection.class_name)}</td>
                      <td className="py-2.5 pr-3 font-mono text-ink">{formatPercent(detection.confidence, 0)}</td>
                      <td className="py-2.5 pr-3">
                        <SeverityBadge level={detection.severity?.level} />
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-[10px] text-secondary">
                        {detection.measurements?.area_pixels != null
                          ? `${Math.round(detection.measurements.area_pixels).toLocaleString()} px²`
                          : '—'}
                      </td>
                      <td className="py-2.5 text-secondary">{causeOf(detection)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-line bg-[#faf8f2] px-3 py-4 text-[11px] text-muted">
              No defects were recorded for this analysis{report.model_ready ? '.' : ' because the detection model was unavailable.'}
            </p>
          )}
        </div>

        <div className="grid gap-3 border-t border-line px-6 py-5 md:grid-cols-2 print:border-graphite/20">
          <div className="rounded-xl border border-line bg-[#faf8f2] p-3.5 print:bg-white">
            <h3 className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-secondary">
              <Waves className="size-3.5" /> Capture quality
            </h3>
            <dl className="mt-2 space-y-1.5 text-[11px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Dimensions</dt>
                <dd className="font-mono text-ink">
                  {report.image_info?.width} × {report.image_info?.height} px
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">File size</dt>
                <dd className="font-mono text-ink">{formatBytes(report.image_info?.file_size_bytes)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Blur score</dt>
                <dd className="font-mono text-ink">
                  {report.image_info?.blur_score?.toFixed?.(2) ?? '—'}
                  {report.image_info?.is_blurry ? ' · blurry' : ''}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Exposure</dt>
                <dd className="font-mono text-ink">{humanize(report.image_info?.exposure_quality)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Quality score</dt>
                <dd className="font-mono text-ink">{formatRatioPercent(report.quality?.score, 0)}</dd>
              </div>
            </dl>
            {report.quality?.issues?.length ? (
              <ul className="mt-2 space-y-1 border-t border-line pt-2 text-[10px] text-secondary">
                {report.quality.issues.map((issue) => (
                  <li key={issue}>· {issue}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-xl border border-line bg-[#faf8f2] p-3.5 print:bg-white">
            <h3 className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-secondary">
              <ShieldCheck className="size-3.5" /> Authenticity assessment
            </h3>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone={AUTHENTICITY_TONE[verdict] || 'neutral'}>{humanize(verdict)}</Badge>
              <span className="text-[10px] text-muted">{report.authenticity?.model_used || 'No model reported'}</span>
            </div>
            {report.authenticity?.factors?.length ? (
              <ul className="mt-2 space-y-1 text-[10px] text-secondary">
                {report.authenticity.factors.slice(0, 4).map((factor) => (
                  <li key={factor}>· {factor}</li>
                ))}
              </ul>
            ) : null}
            {report.authenticity?.limitations?.length ? (
              <p className="mt-2 border-t border-line pt-2 text-[10px] leading-relaxed text-muted">
                {report.authenticity.limitations.slice(0, 2).join(' ')}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mx-6 mb-6 flex items-start gap-2 rounded-xl border border-line bg-[#faf8f2] px-3.5 py-3 text-[10px] leading-relaxed text-secondary print:mx-0 print:bg-white">
          <Info className="mt-0.5 size-3.5 shrink-0 text-muted" />
          <p>
            Measurements come from monocular 2D imagery. Real-world dimensions and cavity depth require calibrated stereo
            capture or a physical field survey. Causes shown here are probabilistic hypotheses intended to prioritise
            inspection, not substitute for on-site engineering assessment. This dossier records what the model produced; it
            does not certify road condition.
          </p>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 text-[10px] text-muted print:hidden">
        <span className="inline-flex items-center gap-1.5">
          <FileText className="size-3" /> PitScout dossier · read-only view of stored analysis output
        </span>
        <span className="inline-flex items-center gap-1.5">
          Status <StatusBadge status={report.status} />
        </span>
      </div>
    </div>
  )
}

export default function ReportDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl space-y-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <Dossier />
    </Suspense>
  )
}
