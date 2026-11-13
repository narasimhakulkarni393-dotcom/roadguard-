import { cn } from '@/lib/utils'

export function Logo({ className, markOnly = false }: { className?: string; markOnly?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-primary shadow-brand">
        <span className="absolute -right-2 -top-2 size-5 rounded-full border border-white/25" />
        <svg viewBox="0 0 32 32" className="size-6 text-white" fill="none" aria-hidden="true">
          <path d="M10 25 14.2 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M22 25 17.8 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M13.4 17.6h5.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
          <circle cx="16.6" cy="12.4" r="1.35" fill="currentColor" />
        </svg>
      </span>
      {!markOnly && (
        <span className="min-w-0">
          <span className="block font-display text-[17px] font-semibold leading-none tracking-[-0.03em] text-ink">
            PitScout
          </span>
          <span className="mt-1 block font-mono text-[8.5px] uppercase tracking-[0.18em] text-muted">
            Road intelligence
          </span>
        </span>
      )}
    </span>
  )
}
