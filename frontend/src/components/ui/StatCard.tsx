import * as React from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

type StatTone = 'primary' | 'success' | 'warning' | 'critical' | 'info' | 'neutral'

const ICON_TONE: Record<StatTone, string> = {
  primary: 'bg-soft text-primary-hover border-primary/15',
  success: 'bg-success-soft text-success border-success/15',
  warning: 'bg-warning-soft text-warning border-warning/20',
  critical: 'bg-critical-soft text-critical border-critical/15',
  info: 'bg-info-soft text-info border-info/15',
  neutral: 'bg-[#f4f1e9] text-secondary border-line',
}

const VALUE_TONE: Record<StatTone, string> = {
  primary: 'text-ink',
  success: 'text-success',
  warning: 'text-warning',
  critical: 'text-critical',
  info: 'text-info',
  neutral: 'text-ink',
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  trend,
  footer,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  tone?: StatTone
  trend?: { direction: 'up' | 'down' | 'flat'; label: string }
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-card border border-line bg-card p-4.5 shadow-card transition-shadow hover:shadow-[0_2px_4px_rgba(37,39,32,0.05),0_18px_46px_-28px_rgba(37,39,32,0.3)]',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="label-mono">{label}</p>
        {Icon && (
          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg border', ICON_TONE[tone])}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div className={cn('mt-3 font-display text-[28px] font-semibold leading-none tracking-tight tabular', VALUE_TONE[tone])}>
        {value}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded font-mono text-[10px]',
              trend.direction === 'up' && 'text-success',
              trend.direction === 'down' && 'text-critical',
              trend.direction === 'flat' && 'text-muted'
            )}
          >
            {trend.direction === 'up' ? (
              <ArrowUpRight className="size-3" />
            ) : trend.direction === 'down' ? (
              <ArrowDownRight className="size-3" />
            ) : (
              <Minus className="size-3" />
            )}
            {trend.label}
          </span>
        )}
        {hint && <span className="truncate text-[11px] text-muted">{hint}</span>}
      </div>
      {footer && <div className="mt-3 border-t border-line pt-2.5">{footer}</div>}
    </div>
  )
}
