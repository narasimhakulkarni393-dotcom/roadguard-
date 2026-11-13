'use client'

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Columns2,
  ImageOff,
  Loader2,
  MapPin,
  RefreshCw,
  Scale,
  SearchX,
  ShieldQuestion,
  Sparkles,
  Layers,
  Info,
} from 'lucide-react'
import {
  PageHeader,
  StatCard,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  SeverityBadge,
  StatusBadge,
  DecisionBadge,
  EmptyState,
  SearchInput,
  Tabs,
  Progress,
  LoadingPanel,
} from '@/components/ui'
import type { MatchPolicy, Pothole, PotholeReport, ReportEvidence } from '@/types/pitscout'
import { clientApi } from '@/lib/client-api'
import { classLabel, formatDateTime, formatPercent, shortId, timeAgo } from '@/lib/format'

type DecisionFilter = 'all' | 'MATCH' | 'UNCERTAIN' | 'NO_MATCH'

function errorMessage(err: any, fallback: string) {
  const detail = err?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') return detail.detail || detail.error || fallback
  return err?.message || fallback
}

function decisionOf(report: PotholeReport | null) {
  return (report?.match?.decision || 'SKIPPED').toUpperCase()
}

export default function DuplicatesPage() {
  return (
    <Suspense fallback={<div className="p-6"><LoadingPanel label="Loading duplicate audit…" /></div>}>
      <DuplicateWorkspace />
    </Suspense>
  )
}

function DuplicateWorkspace() {
  const searchParams = useSearchParams()
  const focusId = searchParams.get('focus') || searchParams.get('report')

  const [reports, setReports] = useState<PotholeReport[]>([])
  const [potholes, setPotholes] = useState<Pothole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<DecisionFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [canonical, setCanonical] = useState<Pothole | null>(null)
  const [canonicalLoading, setCanonicalLoading] = useState(false)
  const [canonicalError, setCanonicalError] = useState<string | null>(null)
  const focusHandled = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [reportData, potholeData] = await Promise.all([
        clientApi.reports({ page_size: 100 }),
        clientApi.potholes({ page_size: 200 }),
      ])
      setReports(reportData.items)
      setPotholes(potholeData.items)
    } catch (err: any) {
      setError(errorMessage(err, 'The duplicate audit could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!focusId || focusHandled.current) return
    if (loading) return
    const existing = reports.find((report) => report.report_id === focusId)
    if (existing) {
      setSelectedId(existing.report_id)
      focusHandled.current = true
      return
    }
    focusHandled.current = true
    clientApi
      .report(focusId)
      .then((report) => {
        setReports((current) => [report, ...current.filter((item) => item.report_id !== report.report_id)])
        setSelectedId(report.report_id)
      })
      .catch((err: any) => setError(errorMessage(err, 'The linked report could not be loaded.')))
  }, [focusId, loading, reports])

  useEffect(() => {
    if (loading || selectedId || focusId || reports.length === 0) return
    setSelectedId(reports[0].report_id)
  }, [loading, reports, selectedId, focusId])

  const selected = reports.find((report) => report.report_id === selectedId) || null
  const audit = selected?.match?.signals || null
  const metrics = audit?.signals || null
  const policy = audit?.policy || reports.find((report) => report.match?.signals?.policy)?.match?.signals?.policy || null
  const candidateId =
    selected?.pothole_id || audit?.candidate_pothole_id || audit?.best_pothole_id || null

  useEffect(() => {
    let cancelled = false
    if (!candidateId) {
      setCanonical(null)
      setCanonicalError(null)
      setCanonicalLoading(false)
      return
    }
    const listed = potholes.find((pothole) => pothole.pothole_id === candidateId)
    if (listed) setCanonical(listed)
    setCanonicalLoading(true)
    setCanonicalError(null)
    clientApi
      .pothole(candidateId)
      .then((payload) => {
        if (!cancelled) setCanonical(payload)
      })
      .catch((err: any) => {
        if (!cancelled) setCanonicalError(errorMessage(err, 'The canonical record could not be loaded.'))
      })
      .finally(() => {
        if (!cancelled) setCanonicalLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [candidateId, potholes])

  const counts = {
    all: reports.length,
    MATCH: reports.filter((report) => decisionOf(report) === 'MATCH').length,
    UNCERTAIN: reports.filter((report) => decisionOf(report) === 'UNCERTAIN').length,
    NO_MATCH: reports.filter((report) => decisionOf(report) === 'NO_MATCH').length,
  }

  const filtered = reports.filter((report) => {
    const decision = decisionOf(report)
    if (filter !== 'all' && decision !== filter) return false
    const needle = search.trim().toLowerCase()
    if (!needle) return true
    return (
      report.report_id.toLowerCase().includes(needle) ||
      (report.detection?.class || '').toLowerCase().includes(needle) ||
      (report.description || '').toLowerCase().includes(needle)
    )
  })

  const submittedEvidence = selected?.evidence?.[0] || null
  const canonicalEvidence = canonicalEvidenceOf(canonical, selected?.report_id)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Duplicate intelligence"
        title="Duplicate detection centre"
        description="Review the matcher's evidence side by side: submitted proof against the candidate canonical record, with distance, visual and shape signals. Uncertain decisions are never shown as confirmed duplicates."
        actions={
          <>
            {counts.UNCERTAIN > 0 && (
              <Badge tone="warning" dot>
                {counts.UNCERTAIN} awaiting review
              </Badge>
            )}
            <Button variant="secondary" onClick={() => void load()} loading={loading}>
              <RefreshCw />
              Refresh audit
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Reports loaded" value={counts.all} icon={Layers} tone="primary" hint="Most recent 100 submissions" />
        <StatCard label="Matched" value={counts.MATCH} icon={CheckCircle2} tone="success" hint="Both gates passed" />
        <StatCard
          label="Review queue"
          value={counts.UNCERTAIN}
          icon={ShieldQuestion}
          tone={counts.UNCERTAIN > 0 ? 'warning' : 'neutral'}
          hint="Uncertain — not duplicates yet"
        />
        <StatCard label="No match" value={counts.NO_MATCH} icon={SearchX} tone="info" hint="Below the review threshold" />
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-critical/20 bg-critical-soft p-3.5 text-xs leading-relaxed text-critical">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3">
          <Tabs
            value={filter}
            onChange={(value) => setFilter(value as DecisionFilter)}
            items={[
              { id: 'all', label: 'All reports', count: counts.all },
              { id: 'MATCH', label: 'Matches', count: counts.MATCH },
              { id: 'UNCERTAIN', label: 'Review queue', count: counts.UNCERTAIN },
              { id: 'NO_MATCH', label: 'No match', count: counts.NO_MATCH },
            ]}
          />
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search report, class or note…"
            className="mb-2 w-full sm:w-64"
            aria-label="Search duplicate reports"
          />
        </div>
        <CardContent className="grid gap-5 p-4 lg:grid-cols-12">
          {/* Report list */}
          <div className="lg:col-span-5">
            {loading ? (
              <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-line bg-[#fbf9f3]">
                <Loader2 className="size-4 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={SearchX}
                compact
                title="No reports in this view"
                description="Change the decision tab or clear the search to see other submissions."
              />
            ) : (
              <ul className="flex max-h-[720px] flex-col gap-1.5 overflow-y-auto pr-1">
                {filtered.map((report) => {
                  const active = report.report_id === selectedId
                  const evidence = report.evidence?.[0]
                  return (
                    <li key={report.report_id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(report.report_id)}
                        className={`flex w-full items-stretch gap-3 rounded-xl border p-2 text-left transition ${
                          active
                            ? 'border-primary/45 bg-soft'
                            : 'border-line bg-card hover:border-line-strong hover:bg-[#fcfaf5]'
                        }`}
                      >
                        <span className="relative h-14 w-16 shrink-0 overflow-hidden rounded-lg bg-[#1e1f1b]">
                          {evidence ? (
                            <img
                              src={evidence.url}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="flex h-full items-center justify-center text-[#6f6f66]">
                              <ImageOff className="size-4" />
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate font-mono text-[10.5px] font-semibold text-ink">
                              {shortId(report.report_id, 12)}
                            </span>
                            <DecisionBadge decision={report.match?.decision} />
                          </span>
                          <span className="mt-1 block truncate text-[10.5px] text-secondary">
                            {classLabel(report.detection?.class || 'Defect')} · {formatDateTime(report.created_at)}
                          </span>
                          <span className="mt-1 flex items-center gap-1.5 text-[10px] text-muted">
                            <StatusBadge status={report.status} />
                            <span className="truncate">{report.location?.status === 'verified' ? 'Verified location' : classLabel(report.location?.status || 'location')}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="mt-2 font-mono text-[9.5px] uppercase tracking-wide text-muted">
              {filtered.length} shown · audit records are read-only here
            </p>
          </div>

          {/* Comparison */}
          <div className="lg:col-span-7">
            {loading ? (
              <div className="h-[420px] animate-pulse rounded-xl bg-[#fbf9f3]" />
            ) : !selected ? (
              <EmptyState
                icon={Columns2}
                title="Select a report to compare"
                description="The submitted evidence, candidate canonical record and matcher signals appear here."
              />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-hover">
                      Report {shortId(selected.report_id, 12)}
                    </p>
                    <h2 className="mt-1 font-display text-lg font-semibold text-ink">
                      {classLabel(selected.detection?.class || 'Submitted defect')}
                    </h2>
                    <p className="mt-1 text-[11px] text-muted">
                      {formatDateTime(selected.created_at)} · {classLabel(selected.source_type)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <DecisionBadge decision={selected.match?.decision} />
                    <StatusBadge status={selected.status} />
                  </div>
                </div>

                <DecisionBanner report={selected} candidateId={candidateId} />

                <div className="grid gap-3 sm:grid-cols-2">
                  <EvidencePane
                    title="Submitted evidence"
                    evidence={submittedEvidence}
                    footer={
                      <div className="flex flex-wrap items-center gap-1.5">
                        <SeverityBadge level={selected.detection?.severity} />
                        {selected.detection?.confidence != null && (
                          <Badge tone="neutral">
                            {formatPercent(selected.detection.confidence)} conf
                          </Badge>
                        )}
                      </div>
                    }
                  />
                  <EvidencePane
                    title="Canonical record"
                    evidence={canonicalEvidence}
                    loading={canonicalLoading}
                    emptyText={
                      candidateId
                        ? 'No prior evidence image is stored for this canonical record.'
                        : 'No canonical record was attached to this decision.'
                    }
                    footer={
                      canonical ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="primary">{canonical.code}</Badge>
                          <SeverityBadge level={canonical.severity} />
                          <StatusBadge status={canonical.status} />
                        </div>
                      ) : (
                        <span className="text-[10.5px] text-muted">
                          {canonicalError || (candidateId ? 'Loading record…' : 'No candidate record')}
                        </span>
                      )
                    }
                  />
                </div>

                {canonical && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-[#fbf9f3] px-3 py-2 text-[11px]">
                    <span className="flex items-center gap-2 text-secondary">
                      <MapPin className="size-3.5 text-info" />
                      {typeof canonical.latitude === 'number' && typeof canonical.longitude === 'number'
                        ? `${canonical.latitude.toFixed(5)}, ${canonical.longitude.toFixed(5)}`
                        : 'No stored coordinates'}
                      <span className="text-muted">· {canonical.report_count} reports</span>
                    </span>
                    <Link
                      href={`/potholes?focus=${canonical.pothole_id}`}
                      className="inline-flex items-center gap-1 font-medium text-primary-hover hover:underline"
                    >
                      Open canonical record
                      <ArrowUpRight className="size-3" />
                    </Link>
                  </div>
                )}

                <SignalPanel
                  report={selected}
                  policy={policy}
                />

                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <Button variant="secondary" size="sm" asChild>
                    <Link href={`/reports?focus=${selected.report_id}`}>
                      Open submission log
                      <ArrowUpRight />
                    </Link>
                  </Button>
                  {canonical && (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/potholes?focus=${canonical.pothole_id}`}>
                        Manage canonical pothole
                      </Link>
                    </Button>
                  )}
                  <span className="ml-auto text-[10px] text-muted">
                    Decisions are recorded by the backend matcher.
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 border-t border-line pt-4 text-[10.5px] leading-relaxed text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Proximity alone never produces a match. A confirmed match requires the combined-score and visual
          gates; plausible candidates below those gates are queued for human review and remain separate
          submissions. No record is merged by this screen.
        </span>
      </div>
    </div>
  )
}

function canonicalEvidenceOf(canonical: Pothole | null, currentReportId: string | undefined) {
  if (!canonical?.reports) return null
  for (const report of canonical.reports) {
    if (report.report_id === currentReportId) continue
    if (report.evidence && report.evidence.length > 0) return report.evidence[0]
  }
  return null
}

function DecisionBanner({ report, candidateId }: { report: PotholeReport; candidateId: string | null }) {
  const decision = decisionOf(report)
  const copy = {
    MATCH: {
      tone: 'border-success/25 bg-success-soft text-success',
      icon: CheckCircle2,
      title: 'Matched duplicate',
      body: 'The combined score and visual gate both passed. This submission is attached to the canonical record.',
    },
    UNCERTAIN: {
      tone: 'border-warning/25 bg-warning-soft text-warning',
      icon: ShieldQuestion,
      title: 'Uncertain — human review required',
      body: 'The candidate is plausible but below the auto-match gate. Do not treat this submission as a confirmed duplicate or merge the records.',
    },
    NO_MATCH: {
      tone: 'border-info/20 bg-info-soft text-info',
      icon: SearchX,
      title: 'No duplicate found',
      body: 'The best candidate stayed below the review threshold. The submission remains its own record.',
    },
    SKIPPED: {
      tone: 'border-line bg-[#f1eee6] text-secondary',
      icon: Info,
      title: 'Matching skipped',
      body: report.match?.reason || 'Location was unavailable, so duplicate matching could not run.',
    },
  }[decision] || {
    tone: 'border-line bg-[#f1eee6] text-secondary',
    icon: Info,
    title: 'No decision recorded',
    body: 'This audit record has no match decision.',
  }

  const Icon = copy.icon
  return (
    <div className={`rounded-xl border p-3.5 ${copy.tone}`}>
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink">{copy.title}</p>
          <p className="mt-1 text-[11px] leading-relaxed">{copy.body}</p>
          {report.match?.reason && decision !== 'SKIPPED' && (
            <p className="mt-1.5 font-mono text-[10px] opacity-80">{report.match.reason}</p>
          )}
          {decision === 'UNCERTAIN' && candidateId && (
            <p className="mt-1.5 text-[10.5px] font-medium">
              Candidate only · not attached to {shortId(candidateId, 10)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function EvidencePane({
  title,
  evidence,
  footer,
  loading,
  emptyText,
}: {
  title: string
  evidence: ReportEvidence | null
  footer?: React.ReactNode
  loading?: boolean
  emptyText?: string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [evidence?.evidence_id])

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="label-mono">{title}</span>
        {loading && <Loader2 className="size-3 animate-spin text-primary" />}
      </div>
      <div className="relative aspect-[4/3] bg-[#1e1f1b]">
        {evidence && !failed ? (
          <img
            src={evidence.url}
            alt={`${title} evidence`}
            className="h-full w-full object-contain"
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 text-center">
            <ImageOff className="size-5 text-[#8c8b80]" />
            <span className="text-[10.5px] leading-relaxed text-[#b7b5a9]">
              {failed ? 'Evidence image unavailable' : emptyText || 'No evidence image stored'}
            </span>
          </div>
        )}
        {evidence && !failed && (
          <span className="absolute left-2 top-2 rounded border border-white/20 bg-black/45 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-white backdrop-blur">
            {evidence.kind}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        {footer}
        {evidence && (
          <span className="font-mono text-[9.5px] text-muted">
            {evidence.width && evidence.height ? `${evidence.width}×${evidence.height} · ` : ''}
            {evidence.sha256 ? shortId(evidence.sha256, 10) : ''}
          </span>
        )}
      </div>
    </div>
  )
}

function SignalPanel({
  report,
  policy,
}: {
  report: PotholeReport
  policy: MatchPolicy | null
}) {
  const audit = report.match?.signals || null
  const metrics = audit?.signals || null
  const combined = metrics?.combined_score ?? report.match?.score ?? null
  const decision = decisionOf(report)
  const matchThreshold = policy?.match_threshold
  const minVisual = policy?.min_visual_similarity

  return (
    <Card>
      <CardHeader className="px-4 pt-4">
        <div>
          <CardTitle>Matcher signals</CardTitle>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Combined score = distance, visual and shape contributions. A candidate must pass both the
            combined and visual gates to match.
          </p>
        </div>
        <Badge tone={decision === 'MATCH' ? 'success' : decision === 'UNCERTAIN' ? 'warning' : 'neutral'}>
          {combined != null ? formatPercent(combined, 1) : 'No score'}
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-3">
        {!metrics && (
          <p className="rounded-lg border border-line bg-[#fbf9f3] px-3 py-2 text-[11px] leading-relaxed text-secondary">
            No signal metrics were recorded for this decision. This usually means no canonical candidate
            fell within the search radius, or the location could not be matched.
          </p>
        )}

        {metrics && (
          <>
            <div>
              <Progress
                value={Math.min(100, Math.max(0, (combined ?? 0) * 100))}
                tone={decision === 'MATCH' ? 'success' : decision === 'UNCERTAIN' ? 'warning' : 'info'}
              />
              <div className="mt-1.5 flex items-center justify-between font-mono text-[9.5px] text-muted">
                <span>0%</span>
                {matchThreshold != null && <span>auto-match ≥ {formatPercent(matchThreshold)}</span>}
                <span>100%</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SignalBar
                label="Distance"
                value={metrics.distance_score}
                weight={policy?.weights.distance}
                detail={`${metrics.distance_m.toFixed(1)} m of ${metrics.radius_m.toFixed(1)} m search radius`}
                tone="info"
              />
              <SignalBar
                label="Visual similarity"
                value={metrics.visual_similarity}
                weight={policy?.weights.visual}
                detail={
                  minVisual != null
                    ? `Visual gate ≥ ${formatPercent(minVisual)} for auto-match`
                    : 'Visual gate applies to auto-match'
                }
                tone={
                  minVisual != null && metrics.visual_similarity < minVisual ? 'warning' : 'success'
                }
              />
              <SignalBar
                label="Shape similarity"
                value={metrics.shape_similarity}
                weight={policy?.weights.shape}
                detail="Bounding-box aspect-ratio comparison"
                tone="primary"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
              <Contribution
                label="Distance"
                value={
                  policy?.weights.distance != null
                    ? metrics.distance_score * policy.weights.distance
                    : null
                }
              />
              <Contribution
                label="Visual"
                value={
                  policy?.weights.visual != null
                    ? metrics.visual_similarity * policy.weights.visual
                    : null
                }
              />
              <Contribution
                label="Shape"
                value={
                  policy?.weights.shape != null
                    ? metrics.shape_similarity * policy.weights.shape
                    : null
                }
              />
            </div>
          </>
        )}

        {policy && (
          <div className="rounded-lg border border-line bg-[#fbf9f3] p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-secondary">
              <Scale className="size-3.5 text-primary" />
              Backend policy
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] text-muted">
              <span>Auto-match: {formatPercent(policy.match_threshold)}</span>
              <span>Review: {formatPercent(policy.review_threshold)}</span>
              <span>Min visual: {formatPercent(policy.min_visual_similarity)}</span>
              <span>
                Weights: D {formatPercent(policy.weights.distance)} · V{' '}
                {formatPercent(policy.weights.visual)} · S {formatPercent(policy.weights.shape)}
              </span>
            </div>
          </div>
        )}

        <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted">
          <Sparkles className="mt-0.5 size-3 shrink-0" />
          Similarity is computed from the stored visual descriptor and bounding-box shape for this
          submission. Missing metrics are not estimated.
        </p>
      </CardContent>
    </Card>
  )
}

function SignalBar({
  label,
  value,
  weight,
  detail,
  tone,
}: {
  label: string
  value: number
  weight: number | undefined
  detail: string
  tone: 'primary' | 'info' | 'success' | 'warning'
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-graphite">
          {label}
          {weight != null && <span className="ml-1 text-[9.5px] text-muted">× {formatPercent(weight)}</span>}
        </span>
        <span className="font-mono font-semibold tabular text-ink">{formatPercent(value, 1)}</span>
      </div>
      <div className="mt-1">
        <Progress value={Math.min(100, Math.max(0, value * 100))} tone={tone} height="sm" />
      </div>
      <p className="mt-1 font-mono text-[9.5px] text-muted">{detail}</p>
    </div>
  )
}

function Contribution({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="label-mono">{label}</p>
      <p className="mt-0.5 font-mono text-[12px] font-semibold tabular text-ink">
        {value != null ? formatPercent(value, 1) : '—'}
      </p>
      <p className="text-[9px] text-muted">contribution</p>
    </div>
  )
}
