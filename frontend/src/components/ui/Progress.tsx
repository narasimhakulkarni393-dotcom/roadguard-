import * as React from 'react'
import { cn } from '@/lib/utils'

const TONES = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-critical',
  info: 'bg-info',
  graphite: 'bg-graphite',
} as const

export function Progress({
  value,
  tone = 'primary',
  className,
  height = 'md',
  label,
}: {
  value: number
  tone?: keyof typeof TONES
  className?: string
  height?: 'sm' | 'md'
  label?: string
}) {
  const safe = Math.max(0, Math.min(100, value))
  return (
    <div className={className}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="text-secondary">{label}</span>
          <span className="font-mono text-muted tabular">{safe.toFixed(0)}%</span>
        </div>
      )}
      <div className={cn('w-full overflow-hidden rounded-full bg-[#efebe1]', height === 'sm' ? 'h-1.5' : 'h-2')}>
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', TONES[tone])}
          style={{ width: `${safe}%` }}
        />
      </div>
    </div>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
  className,
}: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
  className?: string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3', className)}>
      <span className="font-mono text-[10.5px] text-muted">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="rounded-md border border-line bg-card px-2.5 py-1 text-[11px] font-medium text-secondary transition hover:text-ink disabled:opacity-40"
        >
          Prev
        </button>
        <span className="px-1 font-mono text-[10.5px] text-secondary">
          {page} / {pages}
        </span>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          className="rounded-md border border-line bg-card px-2.5 py-1 text-[11px] font-medium text-secondary transition hover:text-ink disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}
