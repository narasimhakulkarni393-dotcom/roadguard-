import * as React from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-4 md:flex-row md:items-end md:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="label-mono mb-2">{eyebrow}</p>}
        <h1 className="font-display text-[26px] font-semibold leading-[1.12] tracking-[-0.025em] text-ink md:text-[30px]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-secondary">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
