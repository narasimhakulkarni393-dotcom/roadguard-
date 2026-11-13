'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronRight,
  Menu,
  Search,
  ShieldCheck,
  X,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { clientApi } from '@/lib/client-api'
import type { HealthStatus } from '@/types/pitscout'
import { ToastProvider } from '@/components/ui/Toast'
import { Logo } from './Logo'
import { NAV_ITEMS, resolvePage, type NavItem } from './nav-config'
import { SearchPalette } from './SearchPalette'
import { NotificationsMenu } from './NotificationsMenu'
import { ProfileMenu } from './ProfileMenu'

const GROUPS: { id: NavItem['group']; label: string }[] = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'system', label: 'System' },
]

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function SidebarNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-5 px-3">
      {GROUPS.map((group) => {
        const items = NAV_ITEMS.filter((item) => item.group === group.id)
        return (
          <div key={group.id}>
            <p className="mb-1.5 px-2.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {items.map((item) => {
                const Icon = item.icon
                const active = isActivePath(pathname, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'group relative flex items-center gap-2.5 rounded-[10px] border px-2.5 py-2 text-[12.5px] font-medium transition-all duration-150',
                      active
                        ? 'border-line bg-card text-ink shadow-[0_1px_2px_rgba(37,39,32,0.05)]'
                        : 'border-transparent text-secondary hover:bg-[#f7f4ec] hover:text-ink'
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    {active && (
                      <span className="absolute -left-3 top-1/2 h-4.5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                    )}
                    <Icon
                      className={cn(
                        'size-4 shrink-0 transition-colors',
                        active ? 'text-primary' : 'text-muted group-hover:text-secondary'
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                    {item.href === '/map' && (
                      <span className="ml-auto flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.1em] text-success">
                        <span className="size-1 rounded-full bg-success" />
                        Live
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })}
    </nav>
  )
}

function SystemStatus({ health, failed }: { health: HealthStatus | null; failed: boolean }) {
  const state = health ? (health.status === 'healthy' ? 'ok' : 'warn') : failed ? 'down' : 'loading'
  return (
    <div className="rounded-xl border border-line bg-card/80 p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'relative flex size-2',
            state === 'ok' && 'text-success',
            state === 'warn' && 'text-warning',
            state === 'down' && 'text-critical',
            state === 'loading' && 'text-muted'
          )}
        >
          {state === 'ok' && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50" />}
          <span className="relative inline-flex size-2 rounded-full bg-current" />
        </span>
        <span className="text-[11px] font-medium text-ink">
          {state === 'ok' && 'API connected'}
          {state === 'warn' && 'API degraded'}
          {state === 'down' && 'API unreachable'}
          {state === 'loading' && 'Checking API'}
        </span>
        {health?.version && (
          <span className="ml-auto rounded border border-line bg-[#f6f3ec] px-1 py-0.5 font-mono text-[8.5px] text-muted">
            v{health.version}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[10px]">
        <span className="flex items-center gap-1 text-muted">
          <Activity className="size-3" /> Detection model
        </span>
        <span
          className={cn(
            'font-mono text-[9px] uppercase tracking-wide',
            health?.detection_model_ready ? 'text-success' : 'text-warning'
          )}
        >
          {health ? (health.detection_model_ready ? 'Ready' : 'Pending') : '—'}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px]">
        <span className="flex items-center gap-1 text-muted">
          <ShieldCheck className="size-3" /> Authenticity model
        </span>
        <span
          className={cn(
            'font-mono text-[9px] uppercase tracking-wide',
            health?.authenticity_model_ready ? 'text-success' : 'text-warning'
          )}
        >
          {health ? (health.authenticity_model_ready ? 'Ready' : 'Pending') : '—'}
        </span>
      </div>
      <p className="mt-2 border-t border-line pt-2 font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted">
        {health?.database ? `${health.database} · server-side key` : 'local deployment'}
      </p>
    </div>
  )
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/dashboard'
  const page = resolvePage(pathname)
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [health, setHealth] = React.useState<HealthStatus | null>(null)
  const [healthFailed, setHealthFailed] = React.useState(false)

  React.useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const status = await clientApi.health()
        if (!cancelled) {
          setHealth(status)
          setHealthFailed(false)
        }
      } catch {
        if (!cancelled) setHealthFailed(true)
      }
    }
    load()
    const timer = window.setInterval(load, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  React.useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const sidebarContent = (onNavigate?: () => void) => (
    <>
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
        <Link href="/dashboard" onClick={onNavigate} aria-label="PitScout dashboard">
          <Logo />
        </Link>
        {onNavigate && (
          <button onClick={onNavigate} className="rounded-lg p-1.5 text-muted hover:bg-card hover:text-ink" aria-label="Close navigation">
            <X className="size-4.5" />
          </button>
        )}
      </div>

      <div className="mt-4 flex-1 overflow-y-auto pb-4">
        <SidebarNav pathname={pathname} onNavigate={onNavigate} />
      </div>

      <div className="shrink-0 space-y-2 border-t border-line p-3">
        <SystemStatus health={health} failed={healthFailed} />
        <Link
          href="/settings"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] text-muted transition hover:text-ink"
        >
          <span className="size-1.5 rounded-full bg-line-strong" />
          Local workspace · SQLite
          <ChevronRight className="ml-auto size-3" />
        </Link>
      </div>
    </>
  )

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-200 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:shadow-float"
      >
        Skip to content
      </a>

      <aside className="app-sidebar fixed inset-y-0 left-0 z-50 hidden w-[264px] flex-col border-r border-line bg-sidebar lg:flex">
        {sidebarContent()}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-90 lg:hidden">
          <div className="absolute inset-0 bg-graphite/30 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-line bg-sidebar shadow-float animate-rise">
            {sidebarContent(() => setMobileOpen(false))}
          </aside>
        </div>
      )}

      <div className="lg:pl-[264px]">
        <header className="app-topbar sticky top-0 z-40 border-b border-line bg-app/85 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 md:px-7">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex size-9 items-center justify-center rounded-[10px] border border-line bg-card text-secondary lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-4.5" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                <span>{page.section}</span>
                <ChevronRight className="size-2.5" />
                <span className="text-secondary">{page.title}</span>
              </div>
              <p className="truncate font-display text-[14px] font-semibold leading-tight text-ink">{page.title}</p>
            </div>

            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => setSearchOpen(true)}
                className="hidden h-9 w-52 items-center gap-2 rounded-[10px] border border-line bg-card px-3 text-[11.5px] text-muted transition hover:border-line-strong hover:text-secondary sm:flex xl:w-64"
              >
                <Search className="size-3.5" />
                <span className="truncate">Search workspace…</span>
                <kbd className="ml-auto rounded border border-line bg-[#f6f3ec] px-1 py-0.5 font-mono text-[8.5px] text-muted">
                  Ctrl K
                </kbd>
              </button>
              <button
                onClick={() => setSearchOpen(true)}
                className="flex size-9 items-center justify-center rounded-[10px] border border-transparent text-secondary transition hover:border-line hover:bg-card hover:text-ink sm:hidden"
                aria-label="Search workspace"
              >
                <Search className="size-4.5" />
              </button>

              <NotificationsMenu />
              <span className="mx-0.5 hidden h-6 w-px bg-line sm:block" />
              <ProfileMenu />
            </div>
          </div>
        </header>

        <main id="main" className="app-main mx-auto w-full max-w-[1560px] px-4 py-6 md:px-7 md:py-7">
          {children}
        </main>
      </div>

      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ShellInner>{children}</ShellInner>
    </ToastProvider>
  )
}
