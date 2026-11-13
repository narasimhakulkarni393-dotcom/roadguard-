'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ScanEye,
  BarChart3,
  Database,
  Cpu,
  Video,
  MapPin,
  Map,
  Menu,
  X,
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Inspect', href: '/inspect', icon: ScanEye },
  { label: 'Video', href: '/video', icon: Video },
  { label: 'Report', href: '/report', icon: MapPin },
  { label: 'Registry', href: '/potholes', icon: Map },
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
  { label: 'Datasets', href: '/datasets', icon: Database },
  { label: 'Training', href: '/training', icon: Cpu },
]

export const Navigation = () => {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(`${href}/`))

  return (
    <>
      <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-white/10 bg-[#0B1220]/90 px-4 md:px-6 backdrop-blur-md">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-teal-500 to-cyan-400 text-slate-950 shadow-[0_0_15px_rgba(34,211,238,0.35)]">
            <MapPin className="h-6 w-6" />
          </div>
          <div>
            <span className="flex items-center gap-1.5 text-lg font-bold tracking-tight text-white">
              Pit<span className="text-cyan-400">Scout</span>
            </span>
            <span className="block text-[10px] tracking-wider text-slate-400 uppercase -mt-1 font-mono">
              Road Intelligence
            </span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all ${
                  active
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-cyan-400' : 'text-slate-400'}`} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="hidden xl:flex items-center gap-3">
          <Link
            href="/report"
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-md transition hover:opacity-95 hover:shadow-cyan-500/25"
          >
            <MapPin className="h-3.5 w-3.5" />
            New Report
          </Link>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
          aria-label="Toggle Navigation"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-x-0 top-16 z-40 border-b border-white/10 bg-[#0B1220] p-4 shadow-2xl md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium ${
                    active
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="h-5 w-5 text-cyan-400" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      )}
    </>
  )
}
