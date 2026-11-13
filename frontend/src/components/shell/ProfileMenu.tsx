'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronDown, Settings, ShieldCheck, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/format'
import { DEFAULT_PROFILE, PROFILE_EVENT, readProfile, type OperatorProfile } from '@/lib/preferences'

export function ProfileMenu() {
  const [open, setOpen] = React.useState(false)
  const [profile, setProfile] = React.useState<OperatorProfile>(DEFAULT_PROFILE)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setProfile(readProfile())
    const sync = () => setProfile(readProfile())
    window.addEventListener(PROFILE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(PROFILE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex items-center gap-2 rounded-[10px] border border-transparent py-1 pl-1 pr-2 transition hover:border-line hover:bg-card',
          open && 'border-line bg-card'
        )}
        aria-expanded={open}
        aria-label="Open profile menu"
      >
        <span className="flex size-7.5 items-center justify-center rounded-lg bg-graphite font-display text-[10px] font-semibold text-[#f8f6f0]">
          {initials(profile.name) || 'OD'}
        </span>
        <span className="hidden text-left xl:block">
          <span className="block text-[11.5px] font-semibold leading-tight text-ink">{profile.name}</span>
          <span className="block text-[9.5px] text-muted">{profile.team}</span>
        </span>
        <ChevronDown className={cn('size-3.5 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-70 w-64 overflow-hidden rounded-card border border-line bg-card shadow-float animate-rise">
          <div className="border-b border-line px-4 py-3">
            <p className="font-display text-[13px] font-semibold text-ink">{profile.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted">
              <ShieldCheck className="size-3 text-success" />
              Server-side API key active
            </p>
          </div>
          <div className="p-1.5">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] text-secondary transition hover:bg-[#faf8f2] hover:text-ink"
            >
              <Settings className="size-3.5 text-muted" />
              Workspace settings
            </Link>
            <Link
              href="/users"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] text-secondary transition hover:bg-[#faf8f2] hover:text-ink"
            >
              <Users className="size-3.5 text-muted" />
              Team directory
            </Link>
          </div>
          <div className="border-t border-line bg-[#fbf9f3] px-4 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
              Single-operator local workspace
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
