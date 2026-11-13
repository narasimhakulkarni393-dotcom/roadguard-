'use client'

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  History,
  Layers,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  RefreshCw,
  Wrench,
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
  EmptyState,
  SearchInput,
  Select,
  Input,
  Field,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  TableSkeleton,
  Pagination,
  LoadingPanel,
  SectionLabel,
  useToast,
} from '@/components/ui'
import type { Pothole, PotholeReport } from '@/types/pitscout'
import { clientApi } from '@/lib/client-api'
import {
  classLabel,
  coordinate,
  downloadCsv,
  formatDateTime,
  humanize,
  shortId,
  timeAgo,
} from '@/lib/format'

const PAGE_SIZE = 12
const MAX_LOADED = 200

const NEXT_STATUS: Record<string, string[]> = {
  reported: ['verified', 'rejected'],
  verified: ['scheduled', 'rejected'],
  scheduled: ['in_progress', 'verified'],
  in_progress: ['repaired', 'scheduled'],
  repaired: ['closed', 'verified'],
  closed: ['verified'],
  rejected: [],
}

const STATUS_OPTIONS = ['reported', 'verified', 'scheduled', 'in_progress', 'repaired', 'closed', 'rejected']
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1, UNKNOWN: 0 }
const OPEN_STATUSES = new Set(['reported', 'verified', 'scheduled', 'in_progress'])

type SortKey = 'recent' | 'oldest' | 'reports' | 'severity' | 'code'

function errorMessage(err: any, fallback: string) {
  const detail = err?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') return detail.detail || detail.error || fallback
  return err?.message || fallback
}

function hasCoordinates(pothole: Pothole): pothole is Pothole & { latitude: number; longitude: number } {
  return typeof pothole.latitude === 'number' && typeof pothole.longitude === 'number'
}

function timestamp(value: string | null) {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export default function PotholesPage() {
  return (
    <Suspense fallback={<div className="p-6"><LoadingPanel label="Loading pothole registry…" /></div>}>
      <PotholeWorkspace />
    </Suspense>
  )
}

function PotholeWorkspace() {
  const searchParams = useSearchParams()
  const focusId = searchParams.get('focus')
  const { toast } = useToast()

  const [items, setItems] = useState<Pothole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [sort, setSort] = useState<SortKey>('recent')
  const [onlyMapped, setOnlyMapped] = useState(false)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Pothole | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [pendingTransition, setPendingTransition] = useState<string | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)
  const focusHandled = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await clientApi.potholes({ page_size: MAX_LOADED })
      setItems(data.items)
    } catch (err: any) {
      setError(errorMessage(err, 'The pothole registry could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!focusId || focusHandled.current) return
    focusHandled.current = true
    setSelectedId(focusId)
  }, [focusId])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setDetailError(null)
    try {
      const payload = await clientApi.pothole(id)
      setDetail(payload)
    } catch (err: any) {
      setDetail(null)
      setDetailError(errorMessage(err, 'The pothole detail could not be loaded.'))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setDetailError(null)
      setReason('')
      setPendingTransition(null)
      return
    }
    setReason('')
    setPendingTransition(null)
    void loadDetail(selectedId)
  }, [selectedId, loadDetail])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const result = items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (severityFilter !== 'all' && (item.severity || 'UNKNOWN').toUpperCase() !== severityFilter) return false
      if (onlyMapped && !hasCoordinates(item)) return false
      if (!term) return true
      return [item.code, item.pothole_id].some((value) => value.toLowerCase().includes(term))
    })
    const sorted = [...result]
    sorted.sort((a, b) => {
      switch (sort) {
        case 'reports':
          return b.report_count - a.report_count
        case 'severity':
          return (SEVERITY_RANK[(b.severity || 'UNKNOWN').toUpperCase()] || 0) - (SEVERITY_RANK[(a.severity || 'UNKNOWN').toUpperCase()] || 0)
        case 'code':
          return a.code.localeCompare(b.code)
        case 'oldest':
          return timestamp(a.last_reported_at) - timestamp(b.last_reported_at)
        case 'recent':
        default:
          return timestamp(b.last_reported_at) - timestamp(a.last_reported_at)
      }
    })
    return sorted
  }, [items, search, statusFilter, severityFilter, onlyMapped, sort])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, severityFilter, onlyMapped, sort])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const stats = useMemo(() => {
    const open = items.filter((item) => OPEN_STATUSES.has(item.status)).length
    const priority = items.filter((item) => ['HIGH', 'CRITICAL'].includes((item.severity || '').toUpperCase())).length
    const reports = items.reduce((sum, item) => sum + item.report_count, 0)
    return { open, priority, reports }
  }, [items])

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard?.writeText(value)
      toast({ tone: 'success', title: `${label} copied` })
    } catch {
      toast({ tone: 'error', title: 'Clipboard unavailable', description: 'Select the value and copy it manually.' })
    }
  }

  const exportCsv = () => {
    const rows = filtered.map((item) => ({
      pothole_id: item.pothole_id,
      code: item.code,
      status: item.status,
      severity: item.severity,
      latitude: item.latitude,
      longitude: item.longitude,
      location_accuracy_m: item.location_accuracy_m,
      report_count: item.report_count,
      first_reported_at: item.first_reported_at,
      last_reported_at: item.last_reported_at,
    }))
    downloadCsv(`pitscout-potholes-${new Date().toISOString().slice(0, 10)}.csv`, rows)
    toast({ tone: 'success', title: 'CSV exported', description: `${rows.length} visible records written to file.` })
  }

  const changeStatus = async (toStatus: string) => {
    if (!selectedId) return
    setStatusBusy(true)
    setDetailError(null)
    try {
      const updated = await clientApi.changePotholeStatus(selectedId, {
        status: toStatus,
        reason: reason.trim() || null,
        actor: 'dashboard-operator',
      })
      setDetail(updated)
      setItems((current) =>
        current.map((item) =>
          item.pothole_id === updated.pothole_id
            ? { ...item, status: updated.status, severity: updated.severity, last_reported_at: updated.last_reported_at }
            : item
        )
      )
      setReason('')
      setPendingTransition(null)
      toast({ tone: 'success', title: 'Status updated', description: `Record ${updated.code} is now ${humanize(updated.status)}.` })
    } catch (err: any) {
      setDetailError(errorMessage(err, 'Status transition failed.'))
    } finally {
      setStatusBusy(false)
    }
  }

  const record = detail || items.find((item) => item.pothole_id === selectedId) || null
  const nextStatuses = record ? NEXT_STATUS[record.status] || [] : []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Registry operations"
        title="Pothole management"
        description="Canonical records, their merged evidence and an auditable lifecycle. Status changes are explicit, reasoned transitions — nothing is auto-advanced."
        actions={
          <>
            <Button variant="secondary" onClick={() => void load()} loading={loading}>
              <RefreshCw />
              Refresh
            </Button>
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
        <StatCard label="Canonical records" value={items.length} hint="loaded registry" icon={Layers} tone="primary" />
        <StatCard label="Open work" value={stats.open} hint="reported → in progress" icon={Wrench} tone="info" />
        <StatCard label="High priority" value={stats.priority} hint="HIGH or CRITICAL severity" icon={AlertTriangle} tone={stats.priority > 0 ? 'critical' : 'neutral'} />
        <StatCard label="Linked reports" value={stats.reports} hint="preserved submissions across records" icon={MapPin} tone="success" />
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-critical/20 bg-critical-soft p-3.5 text-[12px] text-critical">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search canonical code or ID…"
              className="w-full sm:w-72"
              type="search"
              aria-label="Search potholes"
            />
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full sm:w-40"
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {humanize(status)}
                </option>
              ))}
            </Select>
            <Select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
              className="w-full sm:w-40"
              aria-label="Filter by severity"
            >
              <option value="all">All severities</option>
              {['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'UNKNOWN'].map((severity) => (
                <option key={severity} value={severity}>
                  {humanize(severity)}
                </option>
              ))}
            </Select>
            <Select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="w-full sm:w-48"
              aria-label="Sort records"
            >
              <option value="recent">Last reported · newest</option>
              <option value="oldest">Last reported · oldest</option>
              <option value="reports">Report count</option>
              <option value="severity">Severity</option>
              <option value="code">Code A–Z</option>
            </Select>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-[11.5px] text-secondary">
              <input
                type="checkbox"
                checked={onlyMapped}
                onChange={(event) => setOnlyMapped(event.target.checked)}
                className="size-3.5 rounded border-line accent-[#f08a42]"
              />
              Only mapped
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10.5px] text-muted">
            <span className="font-mono">
              {filtered.length} of {items.length} records
            </span>
            <span>·</span>
            <span>{filtered.filter(hasCoordinates).length} with stored coordinates</span>
            {(search || statusFilter !== 'all' || severityFilter !== 'all' || onlyMapped) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setStatusFilter('all')
                  setSeverityFilter('all')
                  setOnlyMapped(false)
                }}
              >
                Reset filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-5">
            <TableSkeleton rows={8} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            {error && items.length === 0 ? (
              <EmptyState
                icon={AlertCircle}
                title="Pothole registry unavailable"
                description={error}
                action={
                  <Button size="sm" onClick={() => void load()}>
                    Retry
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={MapPin}
                title={items.length === 0 ? 'No canonical potholes yet' : 'No records match these filters'}
                description={
                  items.length === 0
                    ? 'Verified reports create canonical records automatically. Submit a geotagged report to begin the registry.'
                    : 'Adjust the search, status, severity or mapping filter to see other records.'
                }
                action={
                  items.length === 0 ? (
                    <Button asChild size="sm">
                      <Link href="/report">
                        <Plus />
                        Report a pothole
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Status</TH>
                  <TH>Severity</TH>
                  <TH>Reports</TH>
                  <TH>Coordinates</TH>
                  <TH>Last reported</TH>
                  <TH>Lifecycle</TH>
                  <TH className="text-right">Manage</TH>
                </TR>
              </THead>
              <TBody>
                {visible.map((item) => {
                  const mapped = hasCoordinates(item)
                  const active = selectedId === item.pothole_id
                  return (
                    <TR
                      key={item.pothole_id}
                      onClick={() => setSelectedId(item.pothole_id)}
                      className={`cursor-pointer ${active ? 'bg-soft/60' : ''}`}
                    >
                      <TD>
                        <p className="font-mono text-[11.5px] font-semibold text-ink">{item.code}</p>
                        <p className="mt-0.5 font-mono text-[9.5px] text-muted">{shortId(item.pothole_id, 12)}</p>
                      </TD>
                      <TD>
                        <StatusBadge status={item.status} />
                      </TD>
                      <TD>
                        <SeverityBadge level={item.severity} />
                      </TD>
                      <TD className="font-mono text-[11.5px] tabular">{item.report_count}</TD>
                      <TD className="font-mono text-[10.5px]">
                        {mapped ? (
                          `${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`
                        ) : (
                          <span className="text-warning">Pending location</span>
                        )}
                      </TD>
                      <TD className="text-[11px]">
                        <span title={formatDateTime(item.last_reported_at)}>{timeAgo(item.last_reported_at)}</span>
                      </TD>
                      <TD>
                        <Badge tone={OPEN_STATUSES.has(item.status) ? 'info' : 'neutral'}>
                          {OPEN_STATUSES.has(item.status) ? 'Open' : 'Archived'}
                        </Badge>
                      </TD>
                      <TD className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedId(item.pothole_id)
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

      <p className="text-[10.5px] leading-relaxed text-muted">
        Records without stored coordinates stay in the registry but are not plotted. Status changes are recorded in each
        record&apos;s history with the actor and optional reason.
      </p>

      <Dialog open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
        {selectedId && (
          <DrawerContent
            title={record ? record.code : 'Pothole record'}
            description={record ? shortId(record.pothole_id, 16) : 'Loading record…'}
          >
            {detailLoading && !detail ? (
              <div className="flex min-h-[320px] items-center justify-center gap-2 text-xs text-secondary">
                <Loader2 className="size-4 animate-spin text-primary" />
                Loading record…
              </div>
            ) : detailError && !record ? (
              <div className="p-5">
                <div className="flex items-start gap-2 rounded-xl border border-critical/20 bg-critical-soft p-3 text-xs text-critical">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{detailError}</span>
                </div>
              </div>
            ) : record ? (
              <>
                <div className="space-y-5 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={record.status} />
                    <SeverityBadge level={record.severity} />
                    <Badge tone={OPEN_STATUSES.has(record.status) ? 'info' : 'neutral'}>
                      {OPEN_STATUSES.has(record.status) ? 'Open work' : 'Archived'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      className="ml-auto"
                      onClick={() => void copy(record.pothole_id, 'Pothole ID')}
                      aria-label="Copy pothole ID"
                    >
                      <Copy />
                    </Button>
                  </div>

                  <section className="rounded-xl border border-line bg-[#fbf9f3] p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-graphite">
                        <Navigation className="size-3.5 text-info" />
                        Stored location
                      </span>
                      <Badge tone={hasCoordinates(record) ? 'success' : 'warning'}>
                        {hasCoordinates(record) ? 'Coordinates' : 'Pending'}
                      </Badge>
                    </div>
                    <p className="mt-2 font-mono text-[12px] text-ink">
                      {coordinate(record.latitude, record.longitude)}
                    </p>
                    <p className="mt-1 text-[10.5px] text-muted">
                      {record.location_accuracy_m != null
                        ? `Reported accuracy ±${Math.round(record.location_accuracy_m)} m`
                        : hasCoordinates(record)
                          ? 'No accuracy radius was reported.'
                          : 'This record has no verified coordinates and is not plotted.'}
                    </p>
                  </section>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
                    <Fact label="Reports merged" value={String(record.report_count)} mono />
                    <Fact label="First reported" value={formatDateTime(record.first_reported_at)} small />
                    <Fact label="Last reported" value={timeAgo(record.last_reported_at)} small />
                    <Fact label="Created" value={formatDateTime(record.created_at)} small />
                  </dl>

                  <section className="border-t border-line pt-4">
                    <div className="flex items-center gap-2">
                      <Wrench className="size-3.5 text-primary" />
                      <SectionLabel>Status transition</SectionLabel>
                    </div>
                    {nextStatuses.length === 0 ? (
                      <p className="mt-2 text-[11.5px] leading-relaxed text-secondary">
                        {record.status === 'rejected'
                          ? 'Rejected records are terminal. No transition is available.'
                          : 'No further transition is defined from this state.'}
                      </p>
                    ) : pendingTransition ? (
                      <div className="mt-2 rounded-xl border border-warning/25 bg-warning-soft p-3">
                        <p className="text-[11.5px] leading-relaxed text-warning">
                          Confirm moving <span className="font-semibold">{record.code}</span> from{' '}
                          {humanize(record.status)} to {humanize(pendingTransition)}. This writes to the registry history.
                        </p>
                        <div className="mt-2.5 flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            loading={statusBusy}
                            onClick={() => void changeStatus(pendingTransition)}
                          >
                            <CheckCircle2 />
                            Confirm transition
                          </Button>
                          <Button size="sm" variant="ghost" disabled={statusBusy} onClick={() => setPendingTransition(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Field
                          label="Reason (optional, recorded in history)"
                          htmlFor="status-reason"
                          hint="Why is this record moving? The text is stored with the transition."
                        >
                          <Input
                            id="status-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            maxLength={500}
                            placeholder="Verified on site by surveyor-07."
                          />
                        </Field>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {nextStatuses.map((next) => (
                            <Button
                              key={next}
                              variant="secondary"
                              size="sm"
                              onClick={() => setPendingTransition(next)}
                              disabled={statusBusy}
                            >
                              {humanize(next)}
                            </Button>
                          ))}
                        </div>
                      </>
                    )}
                    <p className="mt-2 text-[10px] leading-relaxed text-muted">
                      Transitions are validated by the backend state machine. The UI cannot force an invalid state.
                    </p>
                  </section>

                  {record.locations && record.locations.length > 0 && (
                    <section className="border-t border-line pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <SectionLabel>Location records</SectionLabel>
                        <Badge tone="neutral">{record.locations.length}</Badge>
                      </div>
                      <ul className="mt-2 space-y-1.5">
                        {record.locations.slice(0, 6).map((location, index) => (
                          <li
                            key={`${location.latitude}-${location.longitude}-${index}`}
                            className="flex items-center justify-between gap-2 rounded-lg border border-line bg-[#fbf9f3] px-2.5 py-1.5 font-mono text-[10px] text-secondary"
                          >
                            <span>
                              {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                            </span>
                            <span className="flex items-center gap-1.5">
                              {location.accuracy_m != null && <span>±{Math.round(location.accuracy_m)} m</span>}
                              {location.is_primary && <Badge tone="primary">Primary</Badge>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {record.reports && record.reports.length > 0 && (
                    <section className="border-t border-line pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <SectionLabel>Linked reports</SectionLabel>
                        <Badge tone="neutral">{record.reports.length}</Badge>
                      </div>
                      <ul className="mt-2 space-y-1.5">
                        {record.reports.slice(0, 6).map((report: PotholeReport) => (
                          <li key={report.report_id}>
                            <Link
                              href={`/reports?focus=${report.report_id}`}
                              onClick={() => setSelectedId(null)}
                              className="flex items-center justify-between gap-2 rounded-lg border border-line bg-[#fbf9f3] px-2.5 py-2 transition hover:border-line-strong"
                            >
                              <span className="min-w-0">
                                <span className="block font-mono text-[10.5px] text-ink">
                                  {shortId(report.report_id, 12)}
                                </span>
                                <span className="mt-0.5 block text-[10px] text-muted">
                                  {timeAgo(report.created_at)} · {report.detection?.class ? classLabel(report.detection.class) : 'No detection'}
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                <DecisionBadge decision={report.match?.decision} />
                                <ExternalLink className="size-3 text-muted" />
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <section className="border-t border-line pt-4">
                    <div className="flex items-center gap-1.5">
                      <History className="size-3.5 text-primary" />
                      <SectionLabel>Status history</SectionLabel>
                    </div>
                    {record.status_history && record.status_history.length > 0 ? (
                      <ol className="mt-2 space-y-2 border-l border-line pl-3">
                        {[...record.status_history].reverse().map((change, index) => (
                          <li key={index} className="relative text-[10.5px] leading-relaxed text-secondary">
                            <span className="absolute -left-[17px] top-1.5 size-1.5 rounded-full bg-primary" />
                            <span className="font-medium text-ink">
                              {humanize(change.from || 'created')} → {humanize(change.to)}
                            </span>
                            <span className="block text-muted">
                              {formatDateTime(change.at)}
                              {change.actor ? ` · ${change.actor}` : ''}
                              {change.reason ? ` · ${change.reason}` : ''}
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mt-2 text-[11px] text-muted">No status transitions recorded.</p>
                    )}
                  </section>

                  {detailError && (
                    <p className="rounded-lg border border-critical/20 bg-critical-soft p-2.5 text-[11px] text-critical">
                      {detailError}
                    </p>
                  )}
                </div>

                <DrawerFooter>
                  <Button variant="secondary" size="sm" asChild onClick={() => setSelectedId(null)}>
                    <Link href={`/map?focus=${encodeURIComponent(record.pothole_id)}`}>
                      <MapPin />
                      Open on map
                    </Link>
                  </Button>
                  {record.reports && record.reports[0] && (
                    <Button variant="secondary" size="sm" asChild onClick={() => setSelectedId(null)}>
                      <Link href={`/duplicates?focus=${encodeURIComponent(record.reports[0].report_id)}`}>
                        <Layers />
                        Duplicate audit
                      </Link>
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelectedId(null)}>
                    Close
                  </Button>
                </DrawerFooter>
              </>
            ) : null}
          </DrawerContent>
        )}
      </Dialog>
    </div>
  )
}

function Fact({ label, value, small, mono }: { label: string; value: string; small?: boolean; mono?: boolean }) {
  return (
    <div>
      <dt className="label-mono">{label}</dt>
      <dd className={`mt-0.5 font-medium text-ink ${mono ? 'font-mono text-[13px] tabular' : small ? 'text-[11px]' : 'text-[12.5px]'}`}>
        {value}
      </dd>
    </div>
  )
}
