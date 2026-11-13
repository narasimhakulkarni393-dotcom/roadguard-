'use client'

import React, { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  MapPin,
  RefreshCw,
  AlertCircle,
  List,
  Map as MapIcon,
  ArrowUpRight,
  Plus,
  X,
  Loader2,
  ExternalLink,
  Navigation,
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
  Select,
  Segmented,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  TableSkeleton,
  LoadingPanel,
} from '@/components/ui'
import type { MapPoint } from '@/components/map/PotholeMapCanvas'
import type { Pothole } from '@/types/pitscout'
import { clientApi } from '@/lib/client-api'
import { classLabel, formatDateTime, shortId, timeAgo } from '@/lib/format'

const PotholeMapCanvas = dynamic(
  () => import('@/components/map/PotholeMapCanvas').then((mod) => mod.PotholeMapCanvas),
  {
    ssr: false,
    loading: () => <div className="h-[560px] w-full animate-pulse rounded-xl bg-[#efebe1]" />,
  }
)

const SEVERITIES = ['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'UNKNOWN'] as const
const STATUS_OPTIONS = [
  'reported',
  'verified',
  'scheduled',
  'in_progress',
  'repaired',
  'closed',
  'rejected',
]

const SEVERITY_CHIP: Record<string, { dot: string; active: string }> = {
  CRITICAL: { dot: 'bg-critical', active: 'border-critical/30 bg-critical-soft text-critical' },
  HIGH: { dot: 'bg-primary', active: 'border-primary/30 bg-soft text-primary-hover' },
  MODERATE: { dot: 'bg-warning', active: 'border-warning/30 bg-warning-soft text-warning' },
  LOW: { dot: 'bg-success', active: 'border-success/30 bg-success-soft text-success' },
  UNKNOWN: { dot: 'bg-muted', active: 'border-line-strong bg-[#f1eee6] text-secondary' },
}

function errorMessage(err: any, fallback: string) {
  const detail = err?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') return detail.detail || detail.error || fallback
  return err?.message || fallback
}

function hasCoordinates(pothole: Pothole): pothole is Pothole & { latitude: number; longitude: number } {
  return typeof pothole.latitude === 'number' && typeof pothole.longitude === 'number'
}

export default function MapPage() {
  return (
    <Suspense fallback={<div className="p-6"><LoadingPanel label="Loading pothole map…" /></div>}>
      <MapWorkspace />
    </Suspense>
  )
}

function MapWorkspace() {
  const searchParams = useSearchParams()
  const focusId = searchParams.get('focus')

  const [items, setItems] = useState<Pothole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'map' | 'list'>('map')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Pothole | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await clientApi.potholes({ page_size: 200 })
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
    if (!focusId) return
    setSelectedId(focusId)
    setView('map')
  }, [focusId])

  useEffect(() => {
    let cancelled = false
    if (!selectedId) {
      setDetail(null)
      setDetailError(null)
      return
    }
    setDetailLoading(true)
    setDetailError(null)
    clientApi
      .pothole(selectedId)
      .then((payload) => {
        if (!cancelled) setDetail(payload)
      })
      .catch((err: any) => {
        if (!cancelled) setDetailError(errorMessage(err, 'The pothole detail could not be loaded.'))
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const filtered = items.filter((pothole) => {
    if (statusFilter !== 'all' && pothole.status !== statusFilter) return false
    if (
      severityFilter.length > 0 &&
      !severityFilter.includes((pothole.severity || 'UNKNOWN').toUpperCase())
    ) {
      return false
    }
    const needle = search.trim().toLowerCase()
    if (needle && !pothole.code.toLowerCase().includes(needle)) return false
    return true
  })

  const mapPoints: MapPoint[] = filtered.filter(hasCoordinates).map((pothole) => ({
    id: pothole.pothole_id,
    code: pothole.code,
    latitude: pothole.latitude,
    longitude: pothole.longitude,
    severity: pothole.severity,
    status: pothole.status,
    reportCount: pothole.report_count,
  }))

  const mappedCount = items.filter(hasCoordinates).length
  const awaitingLocation = items.length - mappedCount
  const priorityCount = items.filter((pothole) =>
    ['HIGH', 'CRITICAL'].includes((pothole.severity || '').toUpperCase())
  ).length

  const selected = items.find((pothole) => pothole.pothole_id === selectedId) || null
  const recordsForDetail = detail || selected

  const toggleSeverity = (severity: string) => {
    setSeverityFilter((current) =>
      current.includes(severity) ? current.filter((value) => value !== severity) : [...current, severity]
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Geospatial registry"
        title="Live pothole map"
        description="Canonical pothole records with stored coordinates, plotted on a self-contained offline grid. Filters run over the loaded registry, not a third-party map provider."
        actions={
          <>
            <Button variant="secondary" onClick={() => void load()} loading={loading}>
              <RefreshCw />
              Refresh
            </Button>
            <Button asChild>
              <Link href="/report">
                <Plus />
                Report a pothole
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Canonical potholes" value={items.length} icon={MapPin} tone="primary" hint="Registry records loaded" />
        <StatCard label="Mapped" value={mappedCount} icon={Navigation} tone="info" hint="With stored coordinates" />
        <StatCard
          label="Awaiting location"
          value={awaitingLocation}
          icon={AlertCircle}
          tone={awaitingLocation > 0 ? 'warning' : 'neutral'}
          hint="Excluded from the map until verified"
        />
        <StatCard
          label="High priority"
          value={priorityCount}
          icon={AlertCircle}
          tone={priorityCount > 0 ? 'critical' : 'neutral'}
          hint="HIGH or CRITICAL severity"
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search pothole code…"
              className="w-full sm:w-64"
              aria-label="Search pothole code"
            />
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full sm:w-44"
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {classLabel(status)}
                </option>
              ))}
            </Select>
            <div className="ml-auto">
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  {
                    value: 'map',
                    label: (
                      <span className="flex items-center gap-1.5">
                        <MapIcon className="size-3.5" />
                        Map
                      </span>
                    ),
                  },
                  {
                    value: 'list',
                    label: (
                      <span className="flex items-center gap-1.5">
                        <List className="size-3.5" />
                        List
                      </span>
                    ),
                  },
                ]}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="label-mono mr-1">Severity</span>
            {SEVERITIES.map((severity) => {
              const active = severityFilter.includes(severity)
              const style = SEVERITY_CHIP[severity]
              return (
                <button
                  key={severity}
                  type="button"
                  onClick={() => toggleSeverity(severity)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition ${
                    active ? style.active : 'border-line bg-card text-muted hover:text-secondary'
                  }`}
                >
                  <span className={`size-1.5 rounded-full ${style.dot}`} />
                  {classLabel(severity)}
                </button>
              )
            })}
            {severityFilter.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSeverityFilter([])}>
                Clear
              </Button>
            )}
            <span className="ml-auto font-mono text-[10.5px] text-muted">
              {filtered.length} of {items.length} records · {mapPoints.length} plotted
            </span>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-critical/20 bg-critical-soft p-3.5 text-xs leading-relaxed text-critical">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          {loading ? (
            view === 'map' ? (
              <div className="h-[586px] rounded-card border border-line bg-card p-3">
                <div className="h-full w-full animate-pulse rounded-xl bg-[#efebe1]" />
              </div>
            ) : (
              <TableSkeleton rows={7} />
            )
          ) : view === 'map' ? (
            <Card>
              <CardContent className="p-3">
                <PotholeMapCanvas
                  points={mapPoints}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>Pothole list</CardTitle>
                  <p className="mt-1 text-[11px] text-muted">
                    Select a row to inspect the record. Coordinates are only shown for verified locations.
                  </p>
                </div>
                <Badge tone="neutral">{filtered.length}</Badge>
              </CardHeader>
              <CardContent className="p-0 pt-2">
                {filtered.length === 0 ? (
                  <div className="p-5">
                    {error && items.length === 0 ? (
                      <EmptyState
                        icon={AlertCircle}
                        compact
                        title="Registry unavailable"
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
                        compact
                        title="No potholes match"
                        description="Clear the severity, status or code filters to see more registry records."
                      />
                    )}
                  </div>
                ) : (
                  <Table>
                    <THead>
                      <tr>
                        <TH>Code</TH>
                        <TH>Severity</TH>
                        <TH>Status</TH>
                        <TH>Reports</TH>
                        <TH>Coordinates</TH>
                        <TH>Last reported</TH>
                        <TH className="text-right">View</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {filtered.map((pothole) => {
                        const active = pothole.pothole_id === selectedId
                        return (
                          <TR
                            key={pothole.pothole_id}
                            onClick={() => setSelectedId(pothole.pothole_id)}
                            className={`cursor-pointer ${active ? 'bg-soft/70' : ''}`}
                          >
                            <TD className="font-mono text-[11.5px] font-semibold text-ink">
                              {pothole.code}
                            </TD>
                            <TD>
                              <SeverityBadge level={pothole.severity} />
                            </TD>
                            <TD>
                              <StatusBadge status={pothole.status} />
                            </TD>
                            <TD className="font-mono text-[11.5px] tabular">{pothole.report_count}</TD>
                            <TD className="font-mono text-[10.5px]">
                              {hasCoordinates(pothole)
                                ? `${pothole.latitude.toFixed(5)}, ${pothole.longitude.toFixed(5)}`
                                : 'Pending verification'}
                            </TD>
                            <TD className="text-[11px]">{timeAgo(pothole.last_reported_at)}</TD>
                            <TD className="text-right">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setSelectedId(pothole.pothole_id)
                                  setView('map')
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[10.5px] font-medium text-secondary transition hover:text-ink"
                              >
                                <MapIcon className="size-3" />
                                Map
                              </button>
                            </TD>
                          </TR>
                        )
                      })}
                    </TBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-4">
          <RecordDetail
            record={recordsForDetail}
            loading={detailLoading}
            error={detailError}
            onClose={() => setSelectedId(null)}
          />
        </div>
      </div>

      <p className="flex items-start gap-2 border-t border-line pt-4 text-[10.5px] leading-relaxed text-muted">
        <MapPin className="mt-0.5 size-3.5 shrink-0" />
        Only canonical potholes with stored coordinates are plotted. Reports pending location verification
        remain in the submission log and are never assigned a guessed position.
      </p>
    </div>
  )
}

function RecordDetail({
  record,
  loading,
  error,
  onClose,
}: {
  record: Pothole | null
  loading: boolean
  error: string | null
  onClose: () => void
}) {
  if (!record && !loading && !error) {
    return (
      <Card className="lg:sticky lg:top-[92px]">
        <CardContent className="p-5">
          <EmptyState
            icon={MapPin}
            compact
            title="Select a pothole"
            description="Choose a marker or list row to inspect coordinates, report history and lifecycle status."
          />
        </CardContent>
      </Card>
    )
  }

  if (error && !record) {
    return (
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start gap-2.5 rounded-lg border border-critical/20 bg-critical-soft p-3 text-xs leading-relaxed text-critical">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const latitude = record?.latitude
  const longitude = record?.longitude
  const locationKnown = typeof latitude === 'number' && typeof longitude === 'number'

  return (
    <Card className="lg:sticky lg:top-[92px]">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 pt-5 pb-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-hover">
            {record?.pothole_id ? shortId(record.pothole_id, 12) : 'Pothole record'}
          </p>
          <h2 className="mt-1 truncate font-display text-lg font-semibold text-ink">
            {record?.code || 'Loading record…'}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {record && <SeverityBadge level={record.severity} />}
            {record && <StatusBadge status={record.status} />}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {loading && <Loader2 className="size-3.5 animate-spin text-primary" />}
          <Button variant="ghost" size="iconSm" onClick={onClose} aria-label="Close detail panel">
            <X />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <section className="rounded-xl border border-line bg-[#fbf9f3] p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-graphite">
              <Navigation className="size-3.5 text-info" />
              Stored location
            </span>
            <Badge tone={locationKnown ? 'success' : 'warning'}>
              {locationKnown ? 'Coordinates' : 'Pending'}
            </Badge>
          </div>
          {locationKnown ? (
            <>
              <div className="mt-2 grid grid-cols-2 gap-3 font-mono text-[12px] tabular">
                <div>
                  <span className="label-mono block">Latitude</span>
                  <span className="font-semibold text-ink">{latitude.toFixed(6)}</span>
                </div>
                <div>
                  <span className="label-mono block">Longitude</span>
                  <span className="font-semibold text-ink">{longitude.toFixed(6)}</span>
                </div>
              </div>
              <p className="mt-2 text-[10.5px] text-muted">
                {record?.location_accuracy_m != null
                  ? `Reported accuracy ±${Math.round(record.location_accuracy_m)} m`
                  : 'Accuracy was not reported for this record.'}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[11px] leading-relaxed text-secondary">
              This record has no verified coordinates, so it is not plotted. Verify a report location
              before using it for dispatch.
            </p>
          )}
        </section>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
          <Fact label="Reports" value={String(record?.report_count ?? 0)} />
          <Fact label="First reported" value={formatDateTime(record?.first_reported_at)} small />
          <Fact label="Last reported" value={timeAgo(record?.last_reported_at)} small />
          <Fact label="Created" value={formatDateTime(record?.created_at)} small />
        </dl>

        {record?.locations && record.locations.length > 0 && (
          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-graphite">Location records</h3>
              <Badge tone="neutral">{record.locations.length}</Badge>
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {record.locations.slice(0, 4).map((location, index) => (
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

        {record?.reports && record.reports.length > 0 && (
          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-graphite">Linked reports</h3>
              <Badge tone="neutral">{record.reports.length}</Badge>
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {record.reports.slice(0, 4).map((report) => (
                <li key={report.report_id}>
                  <Link
                    href={`/reports?focus=${report.report_id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line bg-[#fbf9f3] px-2.5 py-2 transition hover:border-line-strong"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-[10.5px] text-ink">
                        {shortId(report.report_id, 10)}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-muted">
                        {timeAgo(report.created_at)} · {classLabel(report.source_type)}
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

        {record?.status_history && record.status_history.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-graphite">Recent status changes</h3>
            <ul className="mt-2 flex flex-col gap-1.5 border-l border-line pl-3">
              {record.status_history.slice(-3).reverse().map((change, index) => (
                <li key={index} className="relative text-[10.5px] leading-relaxed text-secondary">
                  <span className="absolute -left-[17px] top-1.5 size-1.5 rounded-full bg-primary" />
                  <span className="font-medium text-ink">
                    {classLabel(change.from || 'new')} → {classLabel(change.to)}
                  </span>
                  <span className="block text-muted">
                    {timeAgo(change.at)}
                    {change.reason ? ` · ${change.reason}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {error && (
          <p className="rounded-lg border border-critical/20 bg-critical-soft p-2.5 text-[11px] text-critical">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {record && (
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/potholes?focus=${record.pothole_id}`}>
                Manage record
                <ArrowUpRight />
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link href="/report">
              <Plus />
              New report
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  )
}

function Fact({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <dt className="label-mono">{label}</dt>
      <dd className={`mt-0.5 font-medium text-ink ${small ? 'text-[11px]' : 'font-mono text-[13px] tabular'}`}>
        {value}
      </dd>
    </div>
  )
}
