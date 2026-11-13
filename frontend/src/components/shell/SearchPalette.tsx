'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  ClipboardList,
  CornerDownLeft,
  FileText,
  Loader2,
  MapPin,
  ScanEye,
  Search,
  Video,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { clientApi } from '@/lib/client-api'
import type { Pothole, PotholeReport } from '@/types/pitscout'
import { NAV_ITEMS } from './nav-config'

interface ResultItem {
  key: string
  group: string
  label: string
  meta?: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const ACTIONS: ResultItem[] = [
  { key: 'action-inspect', group: 'Quick actions', label: 'Run an image inspection', href: '/inspect', icon: ScanEye, meta: 'YOLO pipeline' },
  { key: 'action-video', group: 'Quick actions', label: 'Analyze survey footage', href: '/video', icon: Video, meta: 'Tracking' },
  { key: 'action-report', group: 'Quick actions', label: 'Report a pothole', href: '/report', icon: MapPin, meta: 'GPS evidence' },
  { key: 'action-duplicates', group: 'Quick actions', label: 'Review duplicate decisions', href: '/duplicates', icon: FileText, meta: 'Match audit' },
]

export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const [query, setQuery] = React.useState('')
  const [potholes, setPotholes] = React.useState<Pothole[]>([])
  const [reports, setReports] = React.useState<PotholeReport[]>([])
  const [loading, setLoading] = React.useState(false)
  const [indexFailed, setIndexFailed] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const loaded = React.useRef(false)

  React.useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    if (loaded.current) return
    loaded.current = true
    setLoading(true)
    Promise.allSettled([clientApi.potholes({ page_size: 200 }), clientApi.reports({ page_size: 100 })])
      .then(([potholeResult, reportResult]) => {
        if (potholeResult.status === 'fulfilled') setPotholes(potholeResult.value.items)
        if (reportResult.status === 'fulfilled') setReports(reportResult.value.items)
        setIndexFailed(potholeResult.status === 'rejected' && reportResult.status === 'rejected')
      })
      .finally(() => setLoading(false))
  }, [open])

  const results = React.useMemo<ResultItem[]>(() => {
    const q = query.trim().toLowerCase()
    const navResults: ResultItem[] = NAV_ITEMS.map((item) => ({
      key: `nav-${item.href}`,
      group: 'Navigate',
      label: item.label,
      meta: item.description,
      href: item.href,
      icon: item.icon,
    }))

    if (!q) return [...ACTIONS, ...navResults].slice(0, 10)

    const potholeResults: ResultItem[] = potholes
      .filter((p) =>
        [p.code, p.status, p.severity, p.pothole_id].some((value) => value?.toLowerCase().includes(q))
      )
      .slice(0, 8)
      .map((p) => ({
        key: `pothole-${p.pothole_id}`,
        group: 'Canonical potholes',
        label: p.code,
        meta: [p.severity, p.status, `${p.report_count} report${p.report_count === 1 ? '' : 's'}`]
          .filter(Boolean)
          .join(' · '),
        href: `/potholes?focus=${p.pothole_id}`,
        icon: ClipboardList,
      }))

    const reportResults: ResultItem[] = reports
      .filter((r) =>
        [r.report_id, r.detection.class, r.match.decision, r.status, r.description]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q))
      )
      .slice(0, 6)
      .map((r) => ({
        key: `report-${r.report_id}`,
        group: 'Reports',
        label: r.report_id.slice(0, 8),
        meta: [r.detection.class, r.match.decision, r.status].filter(Boolean).join(' · '),
        href: r.pothole_id ? `/potholes?focus=${r.pothole_id}` : `/reports?focus=${r.report_id}`,
        icon: FileText,
      }))

    return [
      ...navResults.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 3),
      ...potholeResults,
      ...reportResults,
    ]
  }, [query, potholes, reports])

  React.useEffect(() => {
    setActive(0)
  }, [query])

  const grouped = React.useMemo(() => {
    const map = new Map<string, ResultItem[]>()
    results.forEach((item) => {
      const list = map.get(item.group) || []
      list.push(item)
      map.set(item.group, list)
    })
    return Array.from(map.entries())
  }, [results])

  const select = (item: ResultItem | undefined) => {
    if (!item) return
    onOpenChange(false)
    router.push(item.href)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current) => Math.min(current + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      select(results[active])
    }
  }

  let flatIndex = -1

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-100 bg-graphite/25 backdrop-blur-[3px] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-label="Global search"
          className="fixed left-1/2 top-[12vh] z-101 w-[calc(100%-1.5rem)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-panel border border-line bg-card shadow-float outline-none data-[state=open]:animate-rise"
        >
          <DialogPrimitive.Title className="sr-only">Search PitScout</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="size-4.5 shrink-0 text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search potholes, reports or jump to a screen…"
              className="h-13 w-full bg-transparent text-[14px] text-ink placeholder:text-muted focus:outline-none"
            />
            {loading && <Loader2 className="size-4 animate-spin text-primary" />}
            <kbd className="hidden shrink-0 rounded border border-line bg-[#f6f3ec] px-1.5 py-0.5 font-mono text-[9px] text-muted sm:block">
              ESC
            </kbd>
          </div>

          <div className="max-h-[58vh] overflow-y-auto p-2">
            {results.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-[13px] font-medium text-ink">No matches for “{query}”</p>
                <p className="mt-1 text-[11.5px] text-muted">
                  {indexFailed
                    ? 'Live records could not be indexed. Check the API connection in Settings.'
                    : 'Try a pothole code, report ID, decision or screen name.'}
                </p>
              </div>
            ) : (
              grouped.map(([group, items]) => (
                <div key={group} className="mb-1">
                  <p className="px-3 pb-1 pt-2.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                    {group}
                  </p>
                  {items.map((item) => {
                    flatIndex += 1
                    const itemIndex = flatIndex
                    const Icon = item.icon
                    const isActive = itemIndex === active
                    return (
                      <button
                        key={item.key}
                        onMouseEnter={() => setActive(itemIndex)}
                        onClick={() => select(item)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                          isActive ? 'bg-soft' : 'hover:bg-[#faf8f2]'
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-7 shrink-0 items-center justify-center rounded-md border',
                            isActive ? 'border-primary/20 bg-card text-primary' : 'border-line bg-[#faf8f2] text-muted'
                          )}
                        >
                          <Icon className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium text-ink">{item.label}</span>
                          {item.meta && <span className="block truncate text-[10.5px] text-muted">{item.meta}</span>}
                        </span>
                        {isActive ? (
                          <CornerDownLeft className="size-3.5 shrink-0 text-primary" />
                        ) : (
                          <ArrowRight className="size-3.5 shrink-0 text-transparent" />
                        )}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-line bg-[#fbf9f3] px-4 py-2 font-mono text-[9.5px] text-muted">
            <span>↑ ↓ navigate · ↵ open</span>
            <span>Indexed from live API records</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
