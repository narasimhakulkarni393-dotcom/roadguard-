'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TabItem {
  id: string
  label: string
  count?: number
  icon?: React.ComponentType<{ className?: string }>
}

export function Tabs({
  value,
  onChange,
  items,
  className,
}: {
  value: string
  onChange: (id: string) => void
  items: TabItem[]
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-1 border-b border-line', className)} role="tablist">
      {items.map((item) => {
        const Icon = item.icon
        const active = item.id === value
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-[12.5px] font-medium transition-colors',
              active ? 'text-ink' : 'text-muted hover:text-secondary'
            )}
          >
            {Icon && <Icon className="size-3.5" />}
            {item.label}
            {item.count != null && (
              <span
                className={cn(
                  'rounded px-1.5 py-px font-mono text-[10px]',
                  active ? 'bg-soft text-primary-hover' : 'bg-[#f1eee6] text-muted'
                )}
              >
                {item.count}
              </span>
            )}
            {active && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-primary" />}
          </button>
        )
      })}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: React.ReactNode }[]
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-[10px] border border-line bg-[#f4f1e9] p-0.5',
        className
      )}
      role="group"
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg font-medium transition-all',
              size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
              active ? 'bg-card text-ink shadow-[0_1px_3px_rgba(37,39,32,0.12)]' : 'text-muted hover:text-secondary'
            )}
            aria-pressed={active}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
