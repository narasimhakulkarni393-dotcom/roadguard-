'use client'

import React, { useMemo } from 'react'

export interface MapPothole {
  pothole_id: string
  code: string
  latitude: number | null
  longitude: number | null
  severity: string | null
  status: string
  report_count: number
}

const SEVERITY_FILL: Record<string, string> = {
  CRITICAL: '#EF4444',
  HIGH: '#FB923C',
  MODERATE: '#FACC15',
  LOW: '#34D399',
}

const PAD = 0.12
const VIEW_W = 820
const VIEW_H = 440
const MARGIN = 40

/**
 * Offline coordinate plot. Deliberately avoids external tile servers: the app
 * makes no third-party network calls to render reported locations.
 */
export function PotholeMap({
  potholes,
  selectedId,
  onSelect,
}: {
  potholes: MapPothole[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const points = useMemo(
    () =>
      potholes.filter(
        (p): p is MapPothole & { latitude: number; longitude: number } =>
          typeof p.latitude === 'number' && typeof p.longitude === 'number'
      ),
    [potholes]
  )

  const bounds = useMemo(() => {
    if (points.length === 0) {
      return { minLat: -1, maxLat: 1, minLon: -1, maxLon: 1 }
    }
    const lats = points.map((p) => p.latitude)
    const lons = points.map((p) => p.longitude)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLon = Math.min(...lons)
    const maxLon = Math.max(...lons)
    const latSpan = Math.max(maxLat - minLat, 0.002)
    const lonSpan = Math.max(maxLon - minLon, 0.002)
    return {
      minLat: minLat - latSpan * PAD,
      maxLat: maxLat + latSpan * PAD,
      minLon: minLon - lonSpan * PAD,
      maxLon: maxLon + lonSpan * PAD,
    }
  }, [points])

  const project = (lat: number, lon: number) => {
    const x =
      MARGIN +
      ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * (VIEW_W - MARGIN * 2)
    const y =
      VIEW_H -
      MARGIN -
      ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * (VIEW_H - MARGIN * 2)
    return { x, y }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0E1726] p-3">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-auto w-full" role="img" aria-label="Offline pothole coordinate plot">
        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="#0B1220" rx={12} />
        {[0, 1, 2, 3, 4].map((i) => {
          const x = MARGIN + ((VIEW_W - MARGIN * 2) / 4) * i
          const y = MARGIN + ((VIEW_H - MARGIN * 2) / 4) * i
          return (
            <g key={i} stroke="#1E293B" strokeWidth={1}>
              <line x1={x} y1={MARGIN} x2={x} y2={VIEW_H - MARGIN} />
              <line x1={MARGIN} y1={y} x2={VIEW_W - MARGIN} y2={y} />
            </g>
          )
        })}

        {points.length === 0 && (
          <text x={VIEW_W / 2} y={VIEW_H / 2} textAnchor="middle" fill="#64748B" fontSize={13}>
            No geolocated potholes recorded yet.
          </text>
        )}

        {points.map((pothole) => {
          const { x, y } = project(pothole.latitude, pothole.longitude)
          const isSelected = selectedId === pothole.pothole_id
          const fill = SEVERITY_FILL[pothole.severity || ''] || '#22D3EE'
          return (
            <g
              key={pothole.pothole_id}
              onClick={() => onSelect(pothole.pothole_id)}
              className="cursor-pointer"
            >
              <circle cx={x} cy={y} r={isSelected ? 11 : 7} fill={fill} fillOpacity={0.3} />
              <circle
                cx={x}
                cy={y}
                r={isSelected ? 6 : 4}
                fill={fill}
                stroke={isSelected ? '#FFFFFF' : fill}
                strokeWidth={isSelected ? 2 : 1}
              />
              <text x={x + 9} y={y - 8} fill="#CBD5E1" fontSize={10} fontFamily="monospace">
                {pothole.code}
              </text>
            </g>
          )
        })}

        <text x={MARGIN} y={VIEW_H - 14} fill="#475569" fontSize={10} fontFamily="monospace">
          lon {bounds.minLon.toFixed(5)} → {bounds.maxLon.toFixed(5)}
        </text>
        <text x={VIEW_W - MARGIN} y={VIEW_H - 14} textAnchor="end" fill="#475569" fontSize={10} fontFamily="monospace">
          lat {bounds.minLat.toFixed(5)} → {bounds.maxLat.toFixed(5)}
        </text>
      </svg>
      <p className="px-2 pb-1 pt-2 text-[10px] text-slate-500">
        Offline coordinate plot. No external map tiles are requested; only stored, verified coordinates are drawn.
      </p>
    </div>
  )
}
