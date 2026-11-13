import * as React from 'react'
import { cn } from '@/lib/utils'

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-[13px]" {...props} />
    </div>
  )
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-[#faf8f2]', className)} {...props} />
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-line', className)} {...props} />
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors hover:bg-[#fcfaf5]', className)} {...props} />
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'whitespace-nowrap border-b border-line px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted',
        className
      )}
      {...props}
    />
  )
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3 align-middle text-secondary', className)} {...props} />
}

export function SortHeader({
  active,
  direction,
  onClick,
  children,
  className,
}: {
  active: boolean
  direction: 'asc' | 'desc'
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <th
      className={cn(
        'whitespace-nowrap border-b border-line px-4 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.12em]',
        active ? 'text-ink' : 'text-muted',
        className
      )}
    >
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover:text-ink">
        {children}
        <span className="font-mono text-[9px]">{active ? (direction === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}
