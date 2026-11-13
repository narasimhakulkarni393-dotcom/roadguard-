'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Crosshair,
  FileText,
  MapPin,
  RefreshCw,
  ScanEye,
  ShieldQuestion,
  Video,
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
  HealthStatus,
  InspectionList,
  Pothole,
  PotholeReport,
} from '@/types/pitscout'
import { classLabel, formatDateTime, formatNumber, humanize, parseApiDate, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DecisionBadge,
  EmptyState,
  PageHeader,
  Progress,
  SeverityBadge,
  Skeleton,
  StatCard,
  StatusBadge,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui'
import { CHART, ChartTooltip, SEVERITY_COLORS, SEVERITY_ORDER } from '@/components/charts/chart-theme'

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 }

export default function DashboardPage() {
  const [overview, setOverview] = React.useState<AnalyticsOverview | null>(null)
  const [inspections, setInspections] = React.useState<InspectionList | null>(null)
  const [potholes, setPotholes] = React.useState<Pothole[]>([])
  const [potholeTotal, setPotholeTotal] = React.useState(0)
  const [reports, setReports] = React.useState<PotholeReport[]>([])
  const [health, setHealth] = React.useState<HealthStatus | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null)
  const [nowMs, setNowMs] = React.useState<number | null>(null)

  React.useEffect(() => {
    setNowMs(Date.now())
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    const [overviewResult, inspectionsResult, potholesResult, reportsResult, healthResult] =
      await Promise.allSettled([
        clientApi.analytics(),
        clientApi.inspections(1, 100),
        clientApi.potholes({ page_size: 200 }),
        clientApi.reports({ page_size: 100 }),
        clientApi.health(),
      ])

    if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value)
    if (inspectionsResult.status === 'fulfilled') setInspections(inspectionsResult.value)
    if (potholesResult.status === 'fulfilled') {
      setPotholes(potholesResult.value.items)
      setPotholeTotal(potholesResult.value.total)
    }
    if (reportsResult.status === 'fulfilled') setReports(reportsResult.value.items)
    if (healthResult.status === 'fulfilled') setHealth(healthResult.value)

    const failures = [overviewResult, inspectionsResult, potholesResult, reportsResult].filter(
      (result) => result.status === 'rejected'
    ).length
    if (failures === 4) {
      setError('The PitScout API could not be reached. Start the backend and confirm the server-side API key.')
    } else if (failures > 0) {
      setError(`${failures} workspace data source${failures === 1 ? '' : 's'} could not be loaded. Showing available records.`)
    }
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const uncertainReports = reports.filter(
    (report) => (report.match.decision || '').toUpperCase() === 'UNCERTAIN' || report.status === 'review_required'
  )

  const urgentPotholes = React.useMemo(
    () =>
      potholes
        .filter(
          (pothole) =>
            ['HIGH', 'CRITICAL'].includes((pothole.severity || '').toUpperCase()) &&
            !['repaired', 'closed', 'rejected'].includes(pothole.status)
        )
        .sort(
          (a, b) =>
            (SEVERITY_RANK[b.severity || ''] || 0) - (SEVERITY_RANK[a.severity || ''] || 0) ||
            (parseApiDate(b.last_reported_at)?.getTime() || 0) - (parseApiDate(a.last_reported_at)?.getTime() || 0)
        )
        .slice(0, 5),
    [potholes]
  )

  const throughput = React.useMemo(() => {
    if (nowMs === null) return []
    const items = inspections?.items || []
    const days = Array.from({ length: 14 }).map((_, index) => {
      const date = new Date(nowMs)
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() - (13 - index))
      return date
    })
    return days.map((day) => {
      const key = day.toDateString()
      const count = items.filter((item) => parseApiDate(item.created_at)?.toDateString() === key).length
      return {
        label: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        inspections: count,
      }
    })
  }, [inspections, nowMs])

  const throughputTotal = throughput.reduce((sum, day) => sum + day.inspections, 0)

  const severityData = React.useMemo(() => {
    const source = overview?.severity_distribution || []
    return [...source]
      .filter((entry) => entry.count > 0)
      .sort(
        (a, b) =>
          (SEVERITY_RANK[(b.level || '').toUpperCase()] || 0) -
          (SEVERITY_RANK[(a.level || '').toUpperCase()] || 0)
      )
      .map((entry) => ({
        level: (entry.level || 'UNKNOWN').toUpperCase(),
        count: entry.count,
        color: SEVERITY_COLORS[(entry.level || '').toUpperCase()] || CHART.muted,
      }))
  }, [overview])

  const severityTotal = severityData.reduce((sum, entry) => sum + entry.count, 0)

  const defectMix = React.useMemo(() => {
    const source = overview?.damage_distribution || []
    const total = source.reduce((sum, entry) => sum + entry.count, 0)
    return {
      total,
      rows: [...source].sort((a, b) => b.count - a.count).slice(0, 5),
    }
  }, [overview])

  const decisionCounts = React.useMemo(() => {
    const counts = { MATCH: 0, UNCERTAIN: 0, NO_MATCH: 0, SKIPPED: 0 }
    reports.forEach((report) => {
      const key = (report.match.decision || 'SKIPPED').toUpperCase() as keyof typeof counts
      if (key in counts) counts[key] += 1
    })
    return counts
  }, [reports])

  const totalDecisions = decisionCounts.MATCH + decisionCounts.UNCERTAIN + decisionCounts.NO_MATCH

  const dateLabel =
    nowMs === null
      ? ''
      : new Date(nowMs).toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })

  if (loading && !overview && !inspections) {
    return (
      <div className="space-y-5">
        <div className="space-y-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-80 max-w-full" />
          <Skeleton className="h-3.5 w-[520px] max-w-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[122px] rounded-card" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-12">
          <Skeleton className="h-[340px] rounded-card lg:col-span-7" />
          <Skeleton className="h-[340px] rounded-card lg:col-span-5" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Network overview · ${dateLabel}`}
        title="Road conditions, at a glance."
        description="A live operational view of inspections, detections, canonical pothole records and the duplicate-review queue."
        actions={
          <>
            <span className="mr-1 hidden items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted sm:flex">
              <span className="size-1.5 animate-pulse rounded-full bg-success" />
              Live · {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
            </span>
            <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={cn(loading && 'animate-spin')} />
              Refresh
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/report">
                <MapPin /> Report pothole
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/inspect">
                <ScanEye /> New inspection
              </Link>
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
          label="Inspections logged"
          value={formatNumber(overview?.total_inspections ?? 0)}
          hint={`${formatNumber(overview?.completed_analyses ?? 0)} analyses completed`}
          icon={ScanEye}
          tone="neutral"
        />
        <StatCard
          label="Defects detected"
          value={formatNumber(overview?.total_detections ?? 0)}
          hint={`${formatNumber(overview?.potholes_detected ?? 0)} potholes · ${formatNumber(overview?.cracks_detected ?? 0)} cracks`}
          icon={Activity}
          tone="primary"
        />
        <StatCard
          label="Canonical potholes"
          value={formatNumber(potholeTotal)}
          hint={
            overview?.high_priority_defects
              ? `${formatNumber(overview.high_priority_defects)} high-priority detections`
              : 'Located, evidence-backed records'
          }
          icon={MapPin}
          tone="info"
          footer={
            <Link href="/map" className="flex items-center justify-between text-[10.5px] text-secondary hover:text-ink">
              Open live map <ArrowUpRight className="size-3" />
            </Link>
          }
        />
        <StatCard
          label="Duplicate review queue"
          value={formatNumber(uncertainReports.length)}
          hint="Uncertain matches in latest 100 submissions"
          icon={ShieldQuestion}
          tone={uncertainReports.length > 0 ? 'warning' : 'success'}
          footer={
            <Link href="/duplicates" className="flex items-center justify-between text-[10.5px] text-secondary hover:text-ink">
              Review decisions <ArrowUpRight className="size-3" />
            </Link>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <div>
              <CardTitle>Inspection throughput</CardTitle>
              <CardDescription>Recorded inspections per day over the last 14 days.</CardDescription>
            </div>
            <Badge tone="neutral">{formatNumber(throughputTotal)} in range</Badge>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[248px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={throughput} margin={{ top: 6, right: 20, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="throughputFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={CHART.primary} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: CHART.muted, fontSize: 9.5 }} tickLine={false} axisLine={false} interval={2} />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: CHART.muted, fontSize: 9.5 }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART.line, strokeDasharray: '3 3' }} />
                  <Area
                    type="monotone"
                    dataKey="inspections"
                    name="Inspections"
                    stroke={CHART.primary}
                    strokeWidth={2}
                    isAnimationActive={false}
                    fill="url(#throughputFill)"
                    activeDot={{ r: 4, fill: CHART.primary, stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 flex items-center justify-between font-mono text-[9.5px] text-muted">
              <span>Based on the {formatNumber(inspections?.items.length ?? 0)} most recent inspection records.</span>
              <Link href="/analytics" className="text-primary-hover hover:underline">
                Full analytics →
              </Link>
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <div>
              <CardTitle>Severity mix</CardTitle>
              <CardDescription>Detections graded by the explainable severity engine.</CardDescription>
            </div>
            <Link href="/analytics" className="text-[11px] font-medium text-primary-hover hover:underline">
              Details
            </Link>
          </CardHeader>
          <CardContent className="pt-2">
            {severityData.length === 0 ? (
              <EmptyState
                compact
                icon={Activity}
                title="No graded detections yet"
                description="Run an image inspection to populate the severity distribution."
              />
            ) : (
              <>
                <div className="relative h-[190px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={severityData}
                        dataKey="count"
                        nameKey="level"
                        innerRadius={62}
                        outerRadius={86}
                        paddingAngle={2}
                        strokeWidth={0}
                        isAnimationActive={false}
                      >
                        {severityData.map((entry) => (
                          <Cell key={entry.level} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display text-[26px] font-semibold leading-none text-ink tabular">
                      {formatNumber(severityTotal)}
                    </span>
                    <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">detections</span>
                  </div>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-2">
                  {severityData.map((entry) => (
                    <div key={entry.level} className="flex items-center gap-2">
                      <span className="size-2 rounded-sm" style={{ background: entry.color }} />
                      <span className="text-[11px] text-secondary">{humanize(entry.level)}</span>
                      <span className="ml-auto font-mono text-[10.5px] text-ink tabular">{entry.count}</span>
                    </div>
                  ))}
                </div>
                {overview && overview.high_priority_defects > 0 && (
                  <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5 text-[10.5px] text-critical">
                    <AlertTriangle className="size-3" />
                    {overview.high_priority_defects} high-priority detection
                    {overview.high_priority_defects === 1 ? '' : 's'} logged across all inspections.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader>
            <div>
              <CardTitle>Recent inspections</CardTitle>
              <CardDescription>The latest submissions processed by the image pipeline.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/inspect">
                New inspection <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <div className="mt-3">
            {overview?.recent_inspections?.length ? (
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Inspection</TH>
                    <TH>Status</TH>
                    <TH>Submitted</TH>
                    <TH className="text-right">Report</TH>
                  </TR>
                </THead>
                <TBody>
                  {overview.recent_inspections.map((inspection) => (
                    <TR key={inspection.id}>
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-[#faf8f2] text-muted">
                            <FileText className="size-3.5" />
                          </span>
                          <div className="min-w-0">
                            <p className="max-w-[260px] truncate text-[12px] font-medium text-ink">
                              {inspection.filename || 'Untitled capture'}
                            </p>
                            <p className="font-mono text-[9.5px] text-muted">{inspection.id.slice(0, 8)}…</p>
                          </div>
                        </div>
                      </TD>
                      <TD>
                        <StatusBadge status={inspection.status} />
                      </TD>
                      <TD className="whitespace-nowrap font-mono text-[10.5px] text-muted">
                        {formatDateTime(inspection.created_at)}
                      </TD>
                      <TD className="text-right">
                        {inspection.analysis_id && inspection.status === 'completed' ? (
                          <Button variant="secondary" size="sm" asChild>
                            <Link href={`/reports/${inspection.analysis_id}`}>Open</Link>
                          </Button>
                        ) : (
                          <span className="font-mono text-[10px] text-muted">—</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <div className="px-5 pb-5">
                <EmptyState
                  compact
                  icon={ScanEye}
                  title="No inspections recorded"
                  description="Upload a road photograph to run validation, authenticity screening and defect detection."
                  action={
                    <Button size="sm" asChild>
                      <Link href="/inspect">Run first inspection</Link>
                    </Button>
                  }
                />
              </div>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader>
            <div>
              <CardTitle>Priority queue</CardTitle>
              <CardDescription>Open high and critical canonical records.</CardDescription>
            </div>
            <Link href="/potholes" className="text-[11px] font-medium text-primary-hover hover:underline">
              Manage
            </Link>
          </CardHeader>
          <CardContent className="pt-3">
            {urgentPotholes.length === 0 ? (
              <EmptyState
                compact
                icon={CheckCircle2}
                title="No urgent records"
                description="No open high or critical severity potholes are currently recorded."
              />
            ) : (
              <ul className="space-y-1.5">
                {urgentPotholes.map((pothole) => (
                  <li key={pothole.pothole_id}>
                    <Link
                      href={`/potholes?focus=${pothole.pothole_id}`}
                      className="flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition hover:border-line hover:bg-[#fbf9f3]"
                    >
                      <SeverityBadge level={pothole.severity} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[11px] font-medium text-ink">{pothole.code}</p>
                        <p className="text-[9.5px] text-muted">
                          {humanize(pothole.status)} · {pothole.report_count} report{pothole.report_count === 1 ? '' : 's'}
                        </p>
                      </div>
                      <span className="whitespace-nowrap font-mono text-[9px] text-muted">
                        {timeAgo(pothole.last_reported_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 border-t border-line pt-2.5">
              <Link href="/map" className="flex items-center justify-between text-[10.5px] text-secondary hover:text-ink">
                Inspect on the live map <ArrowUpRight className="size-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <div>
              <CardTitle>Defect mix</CardTitle>
              <CardDescription>Most frequent classes across all detections.</CardDescription>
            </div>
            <Badge tone="primary">{formatNumber(defectMix.total)} total</Badge>
          </CardHeader>
          <CardContent className="pt-3">
            {defectMix.rows.length === 0 ? (
              <EmptyState compact icon={ClipboardList} title="No defects classified yet" description="Detection results will appear here." />
            ) : (
              <div className="space-y-3.5">
                {defectMix.rows.map((row, index) => {
                  const share = defectMix.total ? (row.count / defectMix.total) * 100 : 0
                  const colors = [CHART.primary, CHART.info, CHART.success, CHART.warning, CHART.graphite]
                  return (
                    <div key={row.name}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <span className="truncate text-[11.5px] text-secondary">{classLabel(row.name)}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted tabular">
                          {row.count} · {share.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f1eee6]">
                        <div
                          className="h-full rounded-full transition-[width] duration-500"
                          style={{ width: `${Math.max(2, share)}%`, background: colors[index % colors.length] }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader>
            <div>
              <CardTitle>Duplicate decisions</CardTitle>
              <CardDescription>Audit outcomes from recent submissions.</CardDescription>
            </div>
            <DecisionBadge decision={uncertainReports.length ? 'UNCERTAIN' : 'NO_MATCH'} />
          </CardHeader>
          <CardContent className="pt-3">
            {totalDecisions === 0 ? (
              <EmptyState
                compact
                icon={ShieldQuestion}
                title="No decisions recorded"
                description="Submit a geotagged report to exercise the duplicate matcher."
                action={
                  <Button size="sm" variant="secondary" asChild>
                    <Link href="/report">Report a pothole</Link>
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
                {[
                  { key: 'MATCH' as const, tone: 'success' as const, label: 'Matched to canonical record' },
                  { key: 'UNCERTAIN' as const, tone: 'warning' as const, label: 'Queued for human review' },
                  { key: 'NO_MATCH' as const, tone: 'info' as const, label: 'Created a new record' },
                ].map((row) => {
                  const value = decisionCounts[row.key]
                  const percent = totalDecisions ? (value / totalDecisions) * 100 : 0
                  return (
                    <div key={row.key}>
                      <div className="mb-1 flex items-center justify-between text-[10.5px]">
                        <span className="flex items-center gap-1.5 text-secondary">
                          <span
                            className={cn(
                              'size-1.5 rounded-full',
                              row.tone === 'success' && 'bg-success',
                              row.tone === 'warning' && 'bg-warning',
                              row.tone === 'info' && 'bg-info'
                            )}
                          />
                          {row.key.replace('_', ' ')}
                        </span>
                        <span className="font-mono text-muted tabular">
                          {value} · {percent.toFixed(0)}%
                        </span>
                      </div>
                      <Progress value={percent} tone={row.tone} height="sm" />
                      <p className="mt-1 text-[9.5px] text-muted">{row.label}</p>
                    </div>
                  )
                })}
                <p className="border-t border-line pt-2.5 text-[9.5px] leading-relaxed text-muted">
                  Proximity alone never merges records; visual and shape gates must also pass.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Workspace readiness</CardTitle>
              <CardDescription>Live service and model state.</CardDescription>
            </div>
            <Link href="/settings" className="text-[11px] font-medium text-primary-hover hover:underline">
              Settings
            </Link>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-3">
            {[
              { label: 'API service', ok: !!health && health.status === 'healthy', value: health?.status || 'unknown' },
              { label: 'Database', ok: health?.database === 'connected', value: health?.database || 'unknown' },
              { label: 'Detection model', ok: !!health?.detection_model_ready, value: health?.detection_model_ready ? 'ready' : 'pending' },
              {
                label: 'Authenticity model',
                ok: !!health?.authenticity_model_ready,
                value: health?.authenticity_model_ready ? 'ready' : 'pending',
              },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-lg border border-line bg-[#fbf9f3] px-2.5 py-2">
                <span className="text-[10.5px] text-secondary">{row.label}</span>
                <span className={cn('flex items-center gap-1.5 font-mono text-[9px] uppercase', row.ok ? 'text-success' : 'text-warning')}>
                  <span className={cn('size-1.5 rounded-full', row.ok ? 'bg-success' : 'bg-warning')} />
                  {row.value}
                </span>
              </div>
            ))}
            {!health?.detection_model_ready && (
              <Link
                href="/training"
                className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft p-2.5 text-[10px] leading-relaxed text-warning"
              >
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                Detection checkpoint is pending; fine-tune a model before relying on live detections.
              </Link>
            )}
            <p className="pt-1 font-mono text-[9px] text-muted">
              {health ? `${health.app} · v${health.version}` : 'Health telemetry unavailable'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-[#fbf9f3] px-4 py-3">
        <p className="flex items-center gap-2 text-[10.5px] text-muted">
          <Crosshair className="size-3.5" />
          All coordinates shown are stored, verified values. No location is inferred or fabricated.
        </p>
        <Link href="/duplicates" className="text-[10.5px] font-medium text-primary-hover hover:underline">
          Review duplicate decisions →
        </Link>
      </div>
    </div>
  )
}
