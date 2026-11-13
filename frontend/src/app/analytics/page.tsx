'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Download,
  FileText,
  Flame,
  MapPin,
  RefreshCw,
  ScanEye,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { clientApi } from '@/lib/client-api'
import type {
  AnalyticsOverview,
  InspectionList,
  Pothole,
  PotholeReport,
} from '@/types/pitscout'
import {
  classLabel,
  downloadCsv,
  formatNumber,
  humanize,
  parseApiDate,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Progress,
  Segmented,
  SeverityBadge,
  Skeleton,
  StatCard,
  StatusBadge,
} from '@/components/ui'
import { CHART, ChartTooltip, SEVERITY_COLORS, SEVERITY_ORDER } from '@/components/charts/chart-theme'

type RangeKey = '7' | '30' | '90' | 'all'

const RANGE_LABEL: Record<RangeKey, string> = {
  '7': 'Last 7 days',
  '30': 'Last 30 days',
  '90': 'Last 90 days',
  all: 'All available',
}

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 }

const STATUS_ORDER = ['reported', 'verified', 'scheduled', 'in_progress', 'repaired', 'closed', 'rejected']

const STATUS_COLORS: Record<string, string> = {
  reported: CHART.info,
  verified: CHART.success,
  scheduled: '#5B8DB8',
  in_progress: CHART.warning,
  repaired: '#2E9E75',
  closed: CHART.muted,
  rejected: CHART.critical,
}

export default function AnalyticsPage() {
  const [overview, setOverview] = React.useState<AnalyticsOverview | null>(null)
  const [inspections, setInspections] = React.useState<InspectionList | null>(null)
  const [potholes, setPotholes] = React.useState<Pothole[]>([])
  const [reports, setReports] = React.useState<PotholeReport[]>([])
  const [range, setRange] = React.useState<RangeKey>('30')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    const [overviewResult, inspectionsResult, potholesResult, reportsResult] = await Promise.allSettled([
      clientApi.analytics(),
      clientApi.inspections(1, 100),
      clientApi.potholes({ page_size: 200 }),
      clientApi.reports({ page_size: 100 }),
    ])
    if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value)
    if (inspectionsResult.status === 'fulfilled') setInspections(inspectionsResult.value)
    if (potholesResult.status === 'fulfilled') setPotholes(potholesResult.value.items)
    if (reportsResult.status === 'fulfilled') setReports(reportsResult.value.items)
    const failures = [overviewResult, inspectionsResult, potholesResult, reportsResult].filter(
      (result) => result.status === 'rejected'
    ).length
    if (failures) {
      setError(
        failures === 4
          ? 'Analytics data could not be loaded. Confirm the API service and server-side key.'
          : `${failures} analytics source${failures === 1 ? '' : 's'} could not be loaded; available records are shown.`
      )
    }
    setLoading(false)
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const startDate = React.useMemo(() => {
    if (range === 'all') return new Date(0)
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (Number(range) - 1))
    return date
  }, [range])

  const filteredInspections = React.useMemo(
    () =>
      (inspections?.items || []).filter((item) => {
        const date = parseApiDate(item.created_at)
        return date ? date >= startDate : false
      }),
    [inspections, startDate]
  )

  const filteredReports = React.useMemo(
    () =>
      reports.filter((report) => {
        const date = parseApiDate(report.created_at)
        return date ? date >= startDate : false
      }),
    [reports, startDate]
  )

  const filteredPotholes = React.useMemo(
    () =>
      potholes.filter((pothole) => {
        const date = parseApiDate(pothole.first_reported_at || pothole.created_at)
        return date ? date >= startDate : false
      }),
    [potholes, startDate]
  )

  const trend = React.useMemo(() => {
    const days = range === '7' ? 7 : range === '30' ? 30 : 90
    const bucketSize = days > 30 ? 7 : 1
    const bucketCount = Math.ceil(days / bucketSize)
    const now = new Date()
    now.setHours(23, 59, 59, 999)

    return Array.from({ length: bucketCount }).map((_, index) => {
      const end = new Date(now)
      end.setDate(end.getDate() - (bucketCount - 1 - index) * bucketSize)
      const start = new Date(end)
      start.setDate(start.getDate() - (bucketSize - 1))
      start.setHours(0, 0, 0, 0)
      const inBucket = (value: string | null) => {
        const date = parseApiDate(value)
        return date ? date >= start && date <= end : false
      }
      return {
        label:
          bucketSize === 1
            ? end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        inspections: filteredInspections.filter((item) => inBucket(item.created_at)).length,
        reports: filteredReports.filter((report) => inBucket(report.created_at)).length,
      }
    })
  }, [range, filteredInspections, filteredReports])

  const severityData = React.useMemo(
    () =>
      [...(overview?.severity_distribution || [])]
        .filter((entry) => entry.count > 0)
        .sort(
          (a, b) =>
            SEVERITY_ORDER.indexOf((a.level || '').toUpperCase()) -
            SEVERITY_ORDER.indexOf((b.level || '').toUpperCase())
        )
        .map((entry) => ({
          level: (entry.level || 'UNKNOWN').toUpperCase(),
          count: entry.count,
          color: SEVERITY_COLORS[(entry.level || '').toUpperCase()] || CHART.muted,
        })),
    [overview]
  )

  const severityTotal = severityData.reduce((sum, entry) => sum + entry.count, 0)

  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = {}
    potholes.forEach((pothole) => {
      counts[pothole.status] = (counts[pothole.status] || 0) + 1
    })
    return counts
  }, [potholes])

  const resolved = (statusCounts.repaired || 0) + (statusCounts.closed || 0)
  const resolutionRate = potholes.length ? (resolved / potholes.length) * 100 : 0

  const hotspots = React.useMemo(() => {
    const groups = new Map<
      string,
      { lat: number; lon: number; count: number; reports: number; severity: string; firstId: string }
    >()
    potholes.forEach((pothole) => {
      if (pothole.latitude == null || pothole.longitude == null) return
      const key = `${pothole.latitude.toFixed(3)}:${pothole.longitude.toFixed(3)}`
      const existing = groups.get(key)
      const severity = (pothole.severity || 'UNKNOWN').toUpperCase()
      if (existing) {
        existing.count += 1
        existing.reports += pothole.report_count
        if ((SEVERITY_RANK[severity] || 0) > (SEVERITY_RANK[existing.severity] || 0)) existing.severity = severity
      } else {
        groups.set(key, {
          lat: pothole.latitude,
          lon: pothole.longitude,
          count: 1,
          reports: pothole.report_count,
          severity,
          firstId: pothole.pothole_id,
        })
      }
    })
    return Array.from(groups.values())
      .sort((a, b) => b.reports - a.reports || b.count - a.count)
      .slice(0, 5)
  }, [potholes])

  const classRows = React.useMemo(() => {
    const source = overview?.damage_distribution || []
    const total = source.reduce((sum, entry) => sum + entry.count, 0)
    return {
      total,
      rows: [...source].sort((a, b) => b.count - a.count).slice(0, 6),
    }
  }, [overview])

  const exportPotholes = () => {
    downloadCsv(
      `pitscout-potholes-${range}d.csv`,
      filteredPotholes.map((pothole) => ({
        code: pothole.code,
        status: pothole.status,
        severity: pothole.severity || '',
        latitude: pothole.latitude ?? '',
        longitude: pothole.longitude ?? '',
        accuracy_m: pothole.location_accuracy_m ?? '',
        reports: pothole.report_count,
        first_reported_at: pothole.first_reported_at || '',
        last_reported_at: pothole.last_reported_at || '',
      }))
    )
  }

  const exportInspections = () => {
    downloadCsv(
      `pitscout-inspections-${range}d.csv`,
      filteredInspections.map((item) => ({
        inspection_id: item.id,
        filename: item.original_filename || '',
        status: item.status,
        created_at: item.created_at || '',
      }))
    )
  }

  if (loading && !overview && !inspections) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[122px] rounded-card" />
          ))}
        </div>
        <Skeleton className="h-[360px] rounded-card" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-[280px] rounded-card" />
          <Skeleton className="h-[280px] rounded-card" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Measurement · reporting"
        title="Evidence for every road decision."
        description="Trends, severity composition, repair progress and coordinate-based hotspots computed from the records stored in this workspace."
        actions={
          <>
            <Segmented
              value={range}
              onChange={setRange}
              options={[
                { value: '7', label: '7D' },
                { value: '30', label: '30D' },
                { value: '90', label: '90D' },
                { value: 'all', label: 'All' },
              ]}
            />
            <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={cn(loading && 'animate-spin')} /> Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={exportPotholes} disabled={filteredPotholes.length === 0}>
              <Download /> Export potholes
            </Button>
            <Button variant="secondary" size="sm" onClick={exportInspections} disabled={filteredInspections.length === 0}>
              <Download /> Export inspections
            </Button>
          </>
        }
      />

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-[12px] text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={load} className="font-semibold underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Inspections in range"
          value={formatNumber(filteredInspections.length)}
          hint={`${RANGE_LABEL[range]} · loaded records`}
          icon={ScanEye}
          tone="neutral"
        />
        <StatCard
          label="Reports submitted"
          value={formatNumber(filteredReports.length)}
          hint={`${filteredReports.filter((report) => report.match.decision === 'UNCERTAIN').length} awaiting duplicate review`}
          icon={FileText}
          tone="primary"
        />
        <StatCard
          label="New canonical potholes"
          value={formatNumber(filteredPotholes.length)}
          hint="First reported within range"
          icon={MapPin}
          tone="info"
        />
        <StatCard
          label="Resolution rate"
          value={`${resolutionRate.toFixed(0)}%`}
          hint={`${resolved} of ${potholes.length} records repaired or closed`}
          icon={ShieldCheck}
          tone={resolutionRate >= 60 ? 'success' : 'warning'}
          footer={<Progress value={resolutionRate} tone={resolutionRate >= 60 ? 'success' : 'warning'} height="sm" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader>
            <div>
              <CardTitle>Submission activity</CardTitle>
              <CardDescription>
                {range === '7' || range === '30' ? 'Daily' : 'Weekly'} inspection and report volume · {RANGE_LABEL[range].toLowerCase()}.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[10px] text-muted">
                <span className="size-2 rounded-sm bg-primary" /> Inspections
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-muted">
                <span className="size-2 rounded-sm bg-info" /> Reports
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[270px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="inspectionsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={CHART.primary} stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="reportsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.info} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={CHART.info} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 4" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: CHART.muted, fontSize: 9.5 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={18}
                  />
                  <YAxis allowDecimals={false} tick={{ fill: CHART.muted, fontSize: 9.5 }} tickLine={false} axisLine={false} width={44} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART.line, strokeDasharray: '3 3' }} />
                  <Area
                    type="monotone"
                    dataKey="inspections"
                    name="Inspections"
                    stroke={CHART.primary}
                    strokeWidth={2}
                    fill="url(#inspectionsFill)"
                  />
                  <Area
                    type="monotone"
                    dataKey="reports"
                    name="Reports"
                    stroke={CHART.info}
                    strokeWidth={2}
                    fill="url(#reportsFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 font-mono text-[9.5px] text-muted">
              Based on {inspections?.items.length ?? 0} latest inspection records and {reports.length} latest report submissions.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader>
            <div>
              <CardTitle>Severity composition</CardTitle>
              <CardDescription>All-time detections graded by severity.</CardDescription>
            </div>
            <Badge tone="neutral">All time</Badge>
          </CardHeader>
          <CardContent className="pt-2">
            {severityData.length === 0 ? (
              <EmptyState compact icon={Activity} title="No severity data" description="Detection severity appears after an image analysis completes." />
            ) : (
              <>
                <div className="relative h-[190px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={severityData}
                        dataKey="count"
                        nameKey="level"
                        innerRadius={60}
                        outerRadius={84}
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {severityData.map((entry) => (
                          <Cell key={entry.level} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display text-[25px] font-semibold leading-none text-ink tabular">
                      {formatNumber(severityTotal)}
                    </span>
                    <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">detections</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {severityData.map((entry) => (
                    <div key={entry.level} className="flex items-center gap-2">
                      <span className="size-2 rounded-sm" style={{ background: entry.color }} />
                      <span className="text-[11px] text-secondary">{humanize(entry.level)}</span>
                      <span className="ml-auto font-mono text-[10.5px] text-ink tabular">{entry.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <div>
              <CardTitle>Coordinate hotspots</CardTitle>
              <CardDescription>Potholes grouped into ~110 m coordinate cells.</CardDescription>
            </div>
            <Badge tone="warning">
              <Flame className="size-3" /> {hotspots.length}
            </Badge>
          </CardHeader>
          <CardContent className="pt-3">
            {hotspots.length === 0 ? (
              <EmptyState
                compact
                icon={MapPin}
                title="No located potholes"
                description="Canonical records with verified coordinates are required for hotspot analysis."
              />
            ) : (
              <ul className="space-y-1.5">
                {hotspots.map((hotspot, index) => (
                  <li key={`${hotspot.lat}-${hotspot.lon}`}>
                    <Link
                      href={`/map?focus=${hotspot.firstId}`}
                      className="flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition hover:border-line hover:bg-[#fbf9f3]"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#f1eee6] font-mono text-[10px] font-medium text-secondary">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[10.5px] text-ink">
                          {hotspot.lat.toFixed(4)}, {hotspot.lon.toFixed(4)}
                        </p>
                        <p className="text-[9.5px] text-muted">
                          {hotspot.count} record{hotspot.count === 1 ? '' : 's'} · {hotspot.reports} report
                          {hotspot.reports === 1 ? '' : 's'}
                        </p>
                      </div>
                      <SeverityBadge level={hotspot.severity} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 border-t border-line pt-2.5">
              <Link href="/map" className="flex items-center justify-between text-[10.5px] text-secondary hover:text-ink">
                Open live pothole map <BarChart3 className="size-3" />
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader>
            <div>
              <CardTitle>Lifecycle status</CardTitle>
              <CardDescription>Current registry state across all records.</CardDescription>
            </div>
            <Badge tone="success">{resolutionRate.toFixed(0)}% resolved</Badge>
          </CardHeader>
          <CardContent className="pt-3">
            {potholes.length === 0 ? (
              <EmptyState compact icon={ShieldCheck} title="Registry is empty" description="Verified reports create canonical records automatically." />
            ) : (
              <div className="space-y-2.5">
                {STATUS_ORDER.filter((status) => (statusCounts[status] || 0) > 0).map((status) => {
                  const count = statusCounts[status] || 0
                  const percent = (count / potholes.length) * 100
                  return (
                    <div key={status}>
                      <div className="mb-1 flex items-center justify-between text-[10.5px]">
                        <StatusBadge status={status} />
                        <span className="font-mono text-muted tabular">
                          {count} · {percent.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f1eee6]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.max(2, percent)}%`, background: STATUS_COLORS[status] || CHART.muted }}
                        />
                      </div>
                    </div>
                  )
                })}
                <p className="border-t border-line pt-2.5 text-[9.5px] leading-relaxed text-muted">
                  Resolution rate covers {potholes.length} canonical records. Status transitions are recorded in each
                  pothole&apos;s audit history.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Defect classes</CardTitle>
              <CardDescription>All-time detection mix.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            {classRows.rows.length === 0 ? (
              <EmptyState compact icon={Activity} title="No classes yet" description="Detection classes appear after analysis." />
            ) : (
              <div className="space-y-3">
                {classRows.rows.map((row, index) => {
                  const share = classRows.total ? (row.count / classRows.total) * 100 : 0
                  return (
                    <div key={row.name}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="truncate text-[10.5px] text-secondary">{classLabel(row.name)}</span>
                        <span className="font-mono text-[9.5px] text-muted tabular">{share.toFixed(0)}%</span>
                      </div>
                      <Progress
                        value={share}
                        height="sm"
                        tone={index === 0 ? 'primary' : index === 1 ? 'info' : index === 2 ? 'success' : 'warning'}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Reporting notes</CardTitle>
            <CardDescription>Scope and provenance of this analytics view.</CardDescription>
          </div>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/reports">
              Submission log <TrendingUp />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 pt-3 text-[11px] leading-relaxed text-secondary md:grid-cols-2">
          <p>
            Time-filtered counts are computed in this browser from the most recent 100 inspections, 100 reports and 200
            potholes returned by the API. Aggregated severity and defect-class figures are reported by the backend as
            all-time values and are labelled accordingly.
          </p>
          <p>
            Hotspot cells are a presentation grouping of stored coordinates, not a geocoded street address. No map
            provider or external tile service is contacted. CSV exports contain only records currently loaded in this
            view.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
