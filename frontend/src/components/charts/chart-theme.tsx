import * as React from 'react'

export const CHART = {
  primary: '#F08A42',
  primarySoft: '#F8C49E',
  success: '#16865C',
  warning: '#B7791F',
  critical: '#D94343',
  info: '#3478B9',
  graphite: '#34332E',
  muted: '#96958B',
  line: '#E8E3D9',
  grid: '#EFEBE2',
  ink: '#252720',
  secondary: '#68685F',
}

export const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: CHART.critical,
  HIGH: CHART.primary,
  MODERATE: CHART.warning,
  LOW: CHART.success,
  UNKNOWN: CHART.muted,
}

export const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MODERATE', 'LOW']

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 shadow-float">
      {label != null && (
        <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">{label}</p>
      )}
      {payload.map((entry: any, index: number) => (
        <p key={index} className="flex items-center gap-1.5 text-[11px] text-secondary">
          <span className="size-1.5 rounded-full" style={{ background: entry.color || entry.payload?.fill }} />
          <span className="capitalize">{entry.name}</span>
          <span className="ml-2 font-mono font-medium text-ink tabular">{entry.value}</span>
        </p>
      ))}
    </div>
  )
}

export const AXIS_PROPS = {
  stroke: CHART.muted,
  tick: { fill: CHART.muted, fontSize: 10, fontFamily: 'JetBrains Mono' },
  tickLine: false,
  axisLine: false,
} as const
