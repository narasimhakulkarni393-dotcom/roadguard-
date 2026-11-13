import * as React from 'react'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-[#fbf9f3] px-6 text-center',
        compact ? 'py-8' : 'py-14',
        className
      )}
    >
      {Icon && (
        <span className="mb-3 flex size-11 items-center justify-center rounded-xl border border-line bg-card text-muted shadow-[0_1px_2px_rgba(37,39,32,0.05)]">
          <Icon className="size-5" />
        </span>
      )}
      <p className="font-display text-sm font-semibold text-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-secondary">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
