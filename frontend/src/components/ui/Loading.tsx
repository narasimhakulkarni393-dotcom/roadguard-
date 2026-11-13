import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-primary', className)} />
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('shimmer rounded-md', className)} {...props} />
}

export function LoadingPanel({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex min-h-[220px] items-center justify-center gap-2.5 rounded-card border border-line bg-card', className)}>
      <Spinner />
      <span className="text-xs text-secondary">{label}</span>
    </div>
  )
}

export function TableSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-card border border-line bg-card', className)}>
      <div className="border-b border-line bg-[#faf8f2] px-4 py-3">
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 px-4 py-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-card border border-line bg-card p-5', className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-32" />
      <Skeleton className="mt-3 h-3 w-40" />
    </div>
  )
}
