'use client'

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  ImageOff,
  Inbox,
  Layers,
  MapPin,
  Navigation,
  Plus,
  RefreshCw,
  ShieldQuestion,
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
  DrawerContent,
  Dialog,
  DrawerFooter,
  SearchInput,
  Select,
  Field,
  EmptyState,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  TableSkeleton,
  Pagination,
  Progress,
  useToast,
} from '@/components/ui'
import type { PotholeReport } from '@/types/pitscout'
import { clientApi } from '@/lib/client-api'
import {
  classLabel,
  coordinate,
  downloadCsv,
  formatDateTime,
  formatPercent,
  humanize,
  timeAgo,
} from '@/lib/format'

const PAGE_SIZE = 12
const MAX_LOADED = 200
// Backend caps pothole-reports at 100 per page; load in chunks.
const FETCH_PAGE_SIZE = 100

const STATUS_OPTIONS = ['all', 'received', 'review_required', 'attached_existing', 'attached_new']
const DECISION_OPTIONS = ['all', 'MATCH', 'UNCERTAIN', 'NO_MATCH', 'SKIPPED']

const DECISION_NOTE: Record<string, string> = {
  MATCH: 'Linked to an existing canonical record after clearing the visual and shape thresholds.',
  UNCERTAIN: 'Routed to human review. Not a confirmed duplicate and not attached to any canonical record.',
  NO_MATCH: 'No nearby record cleared the policy thresholds. Preserved as its own report.',
  SKIPPED: 'The duplicate engine recorded no decision for this report.',
}

function errorMessage(err: any, fallback: string) {
  const detail = err?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') return detail.detail || detail.error || fallback
  return err?.message || fallback
}

function sortNewest(items: PotholeReport[]) {
  return [...items].sort((a, b) => {
    const timeA = a.captured_at ? Date.parse(a.captured_at) : a.created_at ? Date.parse(a.created_at) : 0
    const timeB = b.captured_at ? Date.parse(b.captured_at) : b.created_at ? Date.parse(b.created_at) : 0
    return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA)
  })
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-muted">Loading submission log…</div>}>
      <ReportsWorkspace />
    </Suspense>
  )
}

function ReportsWorkspace() {
  const searchParams = useSearchParams()
  const focusId = searchParams.get('focus') || searchParams.get('report')
  const { toast } = useToast()

  const [reports, setReports] = useState<PotholeReport[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [decisionFilter, setDecisionFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const focusHandled = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const first = await clientApi.reports({ page: 1, page_size: FETCH_PAGE_SIZE })
      const items = [...first.items]
      let pageNumber = 1
      while (items.length < Math.min(first.total, MAX_LOADED)) {
        pageNumber += 1
        const next = await clientApi.reports({ page: pageNumber, page_size: FETCH_PAGE_SIZE })
        if (next.items.length === 0) break
        items.push(...next.items)
      }
      setReports(sortNewest(items.slice(0, MAX_LOADED)))
      setTotal(first.total)
    } catch (err: any) {
      setError(errorMessage(err, 'The submission log could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!focusId || focusHandled.current || loading) return
    focusHandled.current = true
    const existing = reports.find((report) => report.report_id === focusId)
    if (existing) {
      setSelectedId(existing.report_id)
      return
    }
    clientApi
      .report(focusId)
      .then((report) => {
        setReports((current) => sortNewest([report, ...current.filter((item) => item.report_id !== report.report_id)]))
        setSelectedId(report.report_id)
      })
      .catch((err: any) => setError(errorMessage(err, 'The linked report could not be loaded.')))
  }, [focusId, loading, reports])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return reports.filter((report) => {
      const decision = (report.match.decision || 'SKIPPED').toUpperCase()
      if (statusFilter !== 'all' && report.status.toLowerCase() !== statusFilter) return false
      if (decisionFilter !== 'all' && decision !== decisionFilter) return false
      if (!term) return true
      return [report.report_id, report.pothole_id, report.description, report.detection.class]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [reports, search, statusFilter, decisionFilter])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, decisionFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const stats = useMemo(() => {
    const linked = reports.filter((report) => Boolean(report.pothole_id)).length
    const pendingLocation = reports.filter((report) => report.location.status !== 'verified').length
    const review = reports.filter((report) => (report.match.decision || '').toUpperCase() === 'UNCERTAIN').length
    return { linked, pendingLocation, review }
  }, [reports])

  const selected = selectedId ? reports.find((report) => report.report_id === selectedId) || null : null

  const exportCsv = () => {
    const rows = filtered.map((report) => ({
      report_id: report.report_id,
      captured_at: report.captured_at,
      created_at: report.created_at,
      status: report.status,
      decision: report.match.decision,
      match_score: report.match.score,
      pothole_id: report.pothole_id,
      detected_class: report.detection.class,
      detection_confidence: report.detection.confidence,
      severity: report.detection.severity,
      location_status: report.location.status,
      latitude: report.location.latitude,
      longitude: report.location.longitude,
      accuracy_m: report.location.accuracy_m,
      description: report.description,
    }))
    downloadCsv(`pitscout-reports-${new Date().toISOString().slice(0, 10)}.csv`, rows)
    toast({ tone: 'success', title: 'CSV exported', description: `${rows.length} visible reports written to file.` })
  }

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard?.writeText(id)
      toast({ tone: 'success', title: 'Report ID copied' })
    } catch {
      toast({ tone: 'error', title: 'Clipboard unavailable', description: 'Select the ID and copy it manually.' })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Field operations"
        title="Submission log"
        description="Every preserved report, its duplicate decision, its location verification state and its link to the canonical registry."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download />
              Export visible
            </Button>
            <Button asChild>
              <Link href="/report">
                <Plus />
                New report
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Reports loaded" value={reports.length} hint={total > reports.length ? `of ${total} stored` : 'all stored reports'} icon={Inbox} tone="primary" />
        <StatCard label="Linked to canonical" value={stats.linked} hint="attached to a registry record" icon={CheckCircle2} tone="success" />
        <StatCard label="Pending location" value={stats.pendingLocation} hint="no verified coordinates" icon={MapPin} tone="warning" />
        <StatCard label="Awaiting review" value={stats.review} hint="uncertain duplicate decisions" icon={ShieldQuestion} tone="info" />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-critical/20 bg-critical-soft p-3.5 text-[12px] text-critical">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
          <button className="ml-auto underline underline-offset-2" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      <Card>
        <CardHeader className="flex-col gap-3 md:flex-row md:items-center">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search report, pothole, class or description…"
              className="w-full sm:max-w-sm"
              type="search"
            />
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="sm:max-w-[180px]">
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All statuses' : humanize(option)}
                </option>
              ))}
            </Select>
            <Select value={decisionFilter} onChange={(event) => setDecisionFilter(event.target.value)} className="sm:max-w-[180px]">
              {DECISION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All decisions' : option.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void load()} loading={loading}>
            {!loading && <RefreshCw />}
            Refresh
          </Button>
        </CardHeader>

        {loading ? (
          <div className="p-5">
            <TableSkeleton rows={8} />
          </div>
        ) : error && reports.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={AlertCircle}
              title="Submission log unavailable"
              description={error}
              action={
                <Button size="sm" onClick={() => void load()}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Inbox}
              title={reports.length === 0 ? 'No reports stored yet' : 'No reports match these filters'}
              description={
                reports.length === 0
                  ? 'Submit a field report to populate the log with evidence, duplicate decisions and location status.'
                  : 'Clear the search or filters to see the other preserved reports.'
              }
              action={
                reports.length === 0 ? (
                  <Button asChild size="sm">
                    <Link href="/report">
                      <Plus />
                      Report a pothole
                    </Link>
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSearch('')
                      setStatusFilter('all')
                      setDecisionFilter('all')
                    }}
                  >
                    Reset filters
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH className="w-14"> </TH>
                  <TH>Report</TH>
                  <TH>Captured</TH>
                  <TH>Status</TH>
                  <TH>Duplicate decision</TH>
                  <TH>Location</TH>
                  <TH>Canonical</TH>
                  <TH className="text-right">Detail</TH>
                </TR>
              </THead>
              <TBody>
                {visible.map((report) => {
                  const evidence = report.evidence[0]
                  return (
                    <TR key={report.report_id} className="cursor-pointer" onClick={() => setSelectedId(report.report_id)}>
                      <TD>
                        {evidence ? (
                          <img
                            src={evidence.url}
                            alt=""
                            className="size-10 rounded-md border border-line object-cover"
                          />
                        ) : (
                          <span className="flex size-10 items-center justify-center rounded-md border border-line bg-[#fbf9f3] text-muted">
                            <ImageOff className="size-4" />
                          </span>
                        )}
                      </TD>
                      <TD>
                        <p className="font-mono text-[11.5px] font-medium text-ink">{report.report_id}</p>
                        <p className="mt-0.5 max-w-[240px] truncate text-[11px] text-muted">
                          {report.detection.class ? classLabel(report.detection.class) : report.description || 'No detection recorded'}
                        </p>
                      </TD>
                      <TD className="whitespace-nowrap text-[12px]">
                        <span title={formatDateTime(report.captured_at || report.created_at)}>
                          {timeAgo(report.captured_at || report.created_at)}
                        </span>
                      </TD>
                      <TD>
                        <StatusBadge status={report.status} />
                      </TD>
                      <TD>
                        <div className="flex items-center gap-1.5">
                          <DecisionBadge decision={report.match.decision} />
                          {report.match.score != null && (
                            <span className="font-mono text-[10px] text-muted">{report.match.score.toFixed(2)}</span>
                          )}
                        </div>
                      </TD>
                      <TD>
                        <Badge tone={report.location.status === 'verified' ? 'success' : 'warning'} dot>
                          {report.location.status === 'verified' ? 'Verified' : 'Pending'}
                        </Badge>
                      </TD>
                      <TD className="font-mono text-[11px]">
                        {report.pothole_id ? (
                          <Link
                            href={`/map?focus=${encodeURIComponent(report.pothole_id)}`}
                            onClick={(event) => event.stopPropagation()}
                            className="text-primary-hover hover:underline"
                          >
                            {report.pothole_id}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </TD>
                      <TD className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedId(report.report_id)
                          }}
                        >
                          Open
                          <ArrowRight />
                        </Button>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
            <Pagination page={safePage} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
          </>
        )}
      </Card>

      {total > reports.length && (
        <p className="text-[11px] text-muted">
          Showing the {reports.length} most recent reports of {total}. Older reports remain in the database and can be
          retrieved by report ID.
        </p>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        {selected && (
          <DrawerContent
            title="Report detail"
            description="Preserved submission as stored by the backend."
          >
            <div className="space-y-5 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="label-mono">Report ID</p>
                  <p className="mt-1 break-all font-mono text-[12.5px] text-ink">{selected.report_id}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    Captured {formatDateTime(selected.captured_at)} · stored {formatDateTime(selected.created_at)}
                  </p>
                </div>
                <Button variant="secondary" size="iconSm" onClick={() => void copyId(selected.report_id)} aria-label="Copy report ID">
                  <Copy />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={selected.status} />
                <DecisionBadge decision={selected.match.decision} />
                <Badge tone={selected.location.status === 'verified' ? 'success' : 'warning'} dot>
                  {selected.location.status.replace(/_/g, ' ')}
                </Badge>
                <SeverityBadge level={selected.detection.severity} />
              </div>

              {selected.evidence[0] && (
                <div className="overflow-hidden rounded-xl border border-line bg-[#fbf9f3]">
                  <img src={selected.evidence[0].url} alt="Report evidence" className="max-h-64 w-full object-contain" />
                </div>
              )}

              <div className="rounded-xl border border-line bg-[#fbf9f3] p-3">
                <p className="label-mono">Detector output</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11.5px]">
                  <div>
                    <p className="text-muted">Class</p>
                    <p className="font-medium text-ink">
                      {selected.detection.class ? classLabel(selected.detection.class) : 'Not detected'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted">Confidence</p>
                    <p className="font-mono text-ink">
                      {selected.detection.confidence != null
                        ? formatPercent(selected.detection.confidence, 1)
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {selected.description && (
                <div>
                  <p className="label-mono">Reporter description</p>
                  <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-secondary">
                    {selected.description}
                  </p>
                </div>
              )}

              <div
                className={`rounded-xl border p-3 ${
                  (selected.match.decision || '').toUpperCase() === 'MATCH'
                    ? 'border-success/20 bg-success-soft'
                    : (selected.match.decision || '').toUpperCase() === 'UNCERTAIN'
                      ? 'border-warning/25 bg-warning-soft'
                      : 'border-line bg-[#fbf9f3]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="label-mono">Duplicate decision</p>
                  {selected.match.score != null && (
                    <span className="font-mono text-[10.5px] text-secondary">score {selected.match.score.toFixed(3)}</span>
                  )}
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-secondary">
                  {DECISION_NOTE[(selected.match.decision || 'SKIPPED').toUpperCase()] || 'No decision recorded.'}
                </p>
                {selected.match.reason && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">Engine note: {selected.match.reason}</p>
                )}
                {selected.match.signals?.signals && (
                  <div className="mt-3 space-y-2">
                    <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px] text-secondary">
                      <span>distance: {selected.match.signals.signals.distance_m ?? '—'} m</span>
                      <span>radius: {selected.match.signals.signals.radius_m ?? '—'} m</span>
                      <span>visual: {formatPercent(selected.match.signals.signals.visual_similarity, 1)}</span>
                      <span>shape: {formatPercent(selected.match.signals.signals.shape_similarity, 1)}</span>
                    </div>
                    <Progress
                      value={(selected.match.signals.signals.combined_score || 0) * 100}
                      tone={
                        (selected.match.decision || '').toUpperCase() === 'MATCH'
                          ? 'success'
                          : (selected.match.decision || '').toUpperCase() === 'UNCERTAIN'
                            ? 'warning'
                            : 'info'
                      }
                      height="sm"
                      label="Combined score"
                    />
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-line p-3">
                <div className="flex items-center gap-1.5">
                  <Navigation className="size-3.5 text-primary" />
                  <p className="label-mono">Location</p>
                </div>
                <p className="mt-1.5 font-mono text-[11.5px] text-ink">
                  {coordinate(selected.location.latitude, selected.location.longitude)}
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  {selected.location.accuracy_m != null ? `Accuracy ±${selected.location.accuracy_m} m · ` : ''}
                  {selected.location.note || humanize(selected.location.status)}
                </p>
              </div>

              {selected.evidence.length > 1 && (
                <div>
                  <p className="label-mono">Evidence files</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {selected.evidence.map((evidence) => (
                      <div key={evidence.evidence_id} className="overflow-hidden rounded-lg border border-line">
                        <img src={evidence.url} alt="Report evidence" className="h-24 w-full object-cover" />
                        <p className="truncate p-1.5 font-mono text-[9px] text-muted" title={evidence.sha256}>
                          {evidence.sha256}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DrawerFooter>
              <Button variant="secondary" size="sm" asChild onClick={() => setSelectedId(null)}>
                <Link href={`/duplicates?focus=${encodeURIComponent(selected.report_id)}`}>
                  <Layers />
                  Duplicate audit
                </Link>
              </Button>
              {selected.pothole_id && (
                <Button variant="secondary" size="sm" asChild onClick={() => setSelectedId(null)}>
                  <Link href={`/map?focus=${encodeURIComponent(selected.pothole_id)}`}>
                    <MapPin />
                    Canonical record
                  </Link>
                </Button>
              )}
            </DrawerFooter>
          </DrawerContent>
        )}
      </Dialog>
    </div>
  )
}
