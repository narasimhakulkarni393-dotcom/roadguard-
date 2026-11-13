'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle, Bell, CheckCircle2, Loader2, RefreshCw, ShieldAlert, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import { clientApi } from '@/lib/client-api'
import type { HealthStatus, Pothole, PotholeReport } from '@/types/pitscout'

interface Alert {
  id: string
  tone: 'critical' | 'warning' | 'info' | 'success'
  title: string
  description: string
  href: string
}

const TONE_STYLE = {
  critical: 'border-critical/20 bg-critical-soft text-critical',
  warning: 'border-warning/20 bg-warning-soft text-warning',
  info: 'border-info/20 bg-info-soft text-info',
  success: 'border-success/20 bg-success-soft text-success',
}

export function NotificationsMenu() {
  const [open, setOpen] = React.useState(false)
  const [alerts, setAlerts] = React.useState<Alert[]>([])
  const [loading, setLoading] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    const [healthResult, reportsResult, potholesResult] = await Promise.allSettled([
      clientApi.health(),
      clientApi.reports({ page_size: 100 }),
      clientApi.potholes({ page_size: 200 }),
    ])

    const next: Alert[] = []
    const health: HealthStatus | null = healthResult.status === 'fulfilled' ? healthResult.value : null
    const reports: PotholeReport[] = reportsResult.status === 'fulfilled' ? reportsResult.value.items : []
    const potholes: Pothole[] = potholesResult.status === 'fulfilled' ? potholesResult.value.items : []

    if (health && !health.detection_model_ready) {
      next.push({
        id: 'checkpoint',
        tone: 'warning',
        title: 'Detection checkpoint pending',
        description: 'The YOLO damage model is not loaded. Image runs complete validation only.',
        href: '/training',
      })
    }

    const uncertain = reports.filter(
      (report) => (report.match.decision || '').toUpperCase() === 'UNCERTAIN' || report.status === 'review_required'
    ).length
    if (uncertain > 0) {
      next.push({
        id: 'uncertain',
        tone: 'warning',
        title: `${uncertain} submission${uncertain === 1 ? '' : 's'} need duplicate review`,
        description: 'Plausible candidates scored below the auto-merge threshold.',
        href: '/duplicates',
      })
    }

    const unlocated = reports.filter((report) => report.location.status !== 'verified').length
    if (unlocated > 0) {
      next.push({
        id: 'location',
        tone: 'info',
        title: `${unlocated} report${unlocated === 1 ? '' : 's'} pending location verification`,
        description: 'No coordinates are invented; these records remain unverified until corrected.',
        href: '/reports',
      })
    }

    const urgent = potholes.filter(
      (pothole) =>
        ['HIGH', 'CRITICAL'].includes((pothole.severity || '').toUpperCase()) &&
        !['repaired', 'closed'].includes(pothole.status)
    ).length
    if (urgent > 0) {
      next.push({
        id: 'urgent',
        tone: 'critical',
        title: `${urgent} high-severity pothole${urgent === 1 ? '' : 's'} open`,
        description: 'Records are not yet repaired or closed in the lifecycle.',
        href: '/potholes',
      })
    }

    if (health && health.status !== 'healthy') {
      next.push({
        id: 'health',
        tone: 'critical',
        title: 'API health degraded',
        description: `Database reports: ${health.database}.`,
        href: '/settings',
      })
    }

    setAlerts(next)
    setLoaded(true)
    setLoading(false)
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((current) => !current)}
        className="relative flex size-9 items-center justify-center rounded-[10px] border border-transparent text-secondary transition hover:border-line hover:bg-card hover:text-ink"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="size-4.5" />
        {alerts.length > 0 && (
          <span className="absolute right-2 top-1.5 flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-70 w-[min(370px,calc(100vw-1.5rem))] overflow-hidden rounded-card border border-line bg-card shadow-float animate-rise">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="font-display text-[13px] font-semibold text-ink">Operational alerts</p>
              <p className="text-[10.5px] text-muted">
                {loading ? 'Refreshing live records…' : `${alerts.length} active signal${alerts.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <button
              onClick={load}
              className="flex size-7 items-center justify-center rounded-md border border-line text-muted transition hover:text-ink"
              aria-label="Refresh alerts"
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </button>
          </div>

          <div className="max-h-[340px] overflow-y-auto">
            {loading && !loaded ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-secondary">
                <Loader2 className="size-4 animate-spin text-primary" /> Reading workspace…
              </div>
            ) : alerts.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-9 text-center">
                <CheckCircle2 className="mb-2 size-5 text-success" />
                <p className="text-xs font-medium text-ink">No operational alerts</p>
                <p className="mt-1 text-[10.5px] text-muted">All tracked records are within current policy.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {alerts.map((alert) => (
                  <li key={alert.id}>
                    <Link
                      href={alert.href}
                      onClick={() => setOpen(false)}
                      className="flex gap-3 px-4 py-3 transition-colors hover:bg-[#fbf9f3]"
                    >
                      <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border', TONE_STYLE[alert.tone])}>
                        {alert.tone === 'critical' ? (
                          <ShieldAlert className="size-3.5" />
                        ) : alert.tone === 'warning' ? (
                          <AlertTriangle className="size-3.5" />
                        ) : (
                          <Video className="size-3.5" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11.5px] font-medium leading-snug text-ink">{alert.title}</span>
                        <span className="mt-0.5 block text-[10.5px] leading-relaxed text-muted">{alert.description}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-line bg-[#fbf9f3] px-4 py-2.5">
            <Link href="/reports" onClick={() => setOpen(false)} className="text-[11px] font-medium text-primary-hover hover:underline">
              Open submission log →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
