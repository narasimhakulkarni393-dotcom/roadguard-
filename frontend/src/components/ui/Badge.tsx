import * as React from 'react'
import { cn } from '@/lib/utils'
import { humanize } from '@/lib/format'

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'critical' | 'info' | 'graphite'

const TONES: Record<Tone, string> = {
  neutral: 'border-line bg-[#f3f0e8] text-secondary',
  primary: 'border-primary/20 bg-soft text-primary-hover',
  success: 'border-success/20 bg-success-soft text-success',
  warning: 'border-warning/25 bg-warning-soft text-warning',
  critical: 'border-critical/20 bg-critical-soft text-critical',
  info: 'border-info/20 bg-info-soft text-info',
  graphite: 'border-graphite/15 bg-graphite text-[#f8f6f0]',
}

export function Badge({
  tone = 'neutral',
  dot = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] whitespace-nowrap',
        TONES[tone],
        className
      )}
      {...props}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

const SEVERITY_TONE: Record<string, Tone> = {
  LOW: 'success',
  MODERATE: 'warning',
  HIGH: 'critical',
  CRITICAL: 'critical',
  UNKNOWN: 'neutral',
}

const SEVERITY_DOT: Record<string, string> = {
  LOW: 'bg-success',
  MODERATE: 'bg-warning',
  HIGH: 'bg-primary',
  CRITICAL: 'bg-critical',
  UNKNOWN: 'bg-muted',
}

export function SeverityBadge({
  level,
  className,
}: {
  level: string | null | undefined
  className?: string
}) {
  const normalized = (level || 'UNKNOWN').toUpperCase()
  const tone = SEVERITY_TONE[normalized] || 'neutral'
  return (
    <Badge tone={tone} className={cn('gap-1.5', className)}>
      <span className={cn('size-1.5 rounded-full', SEVERITY_DOT[normalized] || 'bg-muted')} />
      {humanize(normalized)}
    </Badge>
  )
}

const STATUS_TONE: Record<string, Tone> = {
  reported: 'info',
  verified: 'success',
  scheduled: 'info',
  in_progress: 'warning',
  repaired: 'success',
  closed: 'neutral',
  rejected: 'critical',
  review_required: 'warning',
  attached_new: 'info',
  attached_existing: 'success',
  received: 'neutral',
  completed: 'success',
  processing: 'info',
  pending: 'neutral',
  failed: 'critical',
  needs_model: 'warning',
  rejected_upload: 'critical',
}

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const normalized = (status || 'unknown').toLowerCase()
  return (
    <Badge tone={STATUS_TONE[normalized] || 'neutral'} dot className={className}>
      {humanize(normalized)}
    </Badge>
  )
}

const DECISION_TONE: Record<string, Tone> = {
  MATCH: 'success',
  NO_MATCH: 'info',
  UNCERTAIN: 'warning',
  SKIPPED: 'neutral',
}

export function DecisionBadge({ decision, className }: { decision: string | null | undefined; className?: string }) {
  const normalized = (decision || 'SKIPPED').toUpperCase()
  return (
    <Badge tone={DECISION_TONE[normalized] || 'neutral'} dot className={cn('tracking-[0.12em]', className)}>
      {normalized.replace(/_/g, ' ')}
    </Badge>
  )
}
