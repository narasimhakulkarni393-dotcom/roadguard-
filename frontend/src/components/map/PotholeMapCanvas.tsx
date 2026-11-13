'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { CircleMarker, MapContainer, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { Maximize2 } from 'lucide-react'
import { classLabel } from '@/lib/format'

export interface MapPoint {
  id: string
  code: string
  latitude: number
  longitude: number
  severity: string | null
  status: string
  reportCount: number
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#d94343',
  HIGH: '#f08a42',
  MODERATE: '#b7791f',
  LOW: '#16865c',
  UNKNOWN: '#96958b',
}

const FALLBACK_CENTER: [number, number] = [20, 0]

function colorFor(severity: string | null | undefined) {
  return SEVERITY_COLOR[(severity || 'UNKNOWN').toUpperCase()] || SEVERITY_COLOR.UNKNOWN
}

function metersBetween(aLat: number, aLon: number, bLat: number, bLon: number) {
  const radius = 6371000
  const toRad = Math.PI / 180
  const dLat = (bLat - aLat) * toRad
  const dLon = (bLon - aLon) * toRad
  const lat1 = aLat * toRad
  const lat2 = bLat * toRad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)))
}

function clusterIcon(count: number, selected: boolean) {
  return L.divIcon({
    className: 'pitscout-cluster',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:999px;background:#f08a42;border:2px solid ${
      selected ? '#252720' : '#ffffff'
    };box-shadow:0 8px 20px -8px rgba(37,39,32,.55);color:#fff;font-family:JetBrains Mono,monospace;font-size:11px;font-weight:600;">${count}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  })
}

export function PotholeMapCanvas({
  points,
  selectedId,
  onSelect,
  className,
}: {
  points: MapPoint[]
  selectedId: string | null
  onSelect: (id: string) => void
  className?: string
}) {
  const [zoom, setZoom] = useState(points.length ? 12 : 4)
  const [map, setMap] = useState<L.Map | null>(null)
  const initialCenter = useRef<[number, number]>(
    points.length ? [points[0].latitude, points[0].longitude] : FALLBACK_CENTER
  ).current

  const clusters = useMemo(() => {
    const radius = zoom >= 17 ? 0 : Math.max(12, 60000 / Math.pow(2, Math.max(0, zoom - 4)))
    const groups: { latitude: number; longitude: number; members: MapPoint[] }[] = []
    for (const point of points) {
      const group = groups.find(
        (candidate) =>
          metersBetween(candidate.latitude, candidate.longitude, point.latitude, point.longitude) <=
          radius
      )
      if (group) {
        group.members.push(point)
        const count = group.members.length
        group.latitude += (point.latitude - group.latitude) / count
        group.longitude += (point.longitude - group.longitude) / count
      } else {
        groups.push({
          latitude: point.latitude,
          longitude: point.longitude,
          members: [point],
        })
      }
    }
    return groups
  }, [points, zoom])

  const fitAll = () => {
    if (!map || points.length === 0) return
    const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude] as [number, number]))
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [56, 56], maxZoom: 15 })
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border border-line ${className || ''}`}>
      <MapContainer
        center={initialCenter}
        zoom={zoom}
        scrollWheelZoom
        attributionControl={false}
        className="pitscout-map h-[560px] w-full"
      >
        <MapBridge onReady={setMap} />
        <ZoomWatcher onChange={setZoom} />
        <FitOnLoad points={points} />
        <FocusOnSelect points={points} selectedId={selectedId} />

        {clusters.map((cluster) => {
          const selected = cluster.members.some((member) => member.id === selectedId)
          if (cluster.members.length > 1) {
            return (
              <Marker
                key={`cluster-${cluster.latitude.toFixed(5)}-${cluster.longitude.toFixed(5)}-${cluster.members.length}`}
                position={[cluster.latitude, cluster.longitude]}
                icon={clusterIcon(cluster.members.length, selected)}
                eventHandlers={{
                  click: () => {
                    if (!map) return
                    const bounds = L.latLngBounds(
                      cluster.members.map(
                        (member) => [member.latitude, member.longitude] as [number, number]
                      )
                    )
                    map.fitBounds(bounds, { padding: [70, 70], maxZoom: 18 })
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -18]} className="pitscout-tooltip">
                  {cluster.members.length} potholes · select to expand
                </Tooltip>
              </Marker>
            )
          }

          const point = cluster.members[0]
          const color = colorFor(point.severity)
          const isSelected = point.id === selectedId
          return (
            <React.Fragment key={point.id}>
              {isSelected && (
                <CircleMarker
                  center={[point.latitude, point.longitude]}
                  radius={14}
                  pathOptions={{
                    color: '#252720',
                    weight: 1,
                    opacity: 0.35,
                    fillColor: color,
                    fillOpacity: 0.12,
                  }}
                  interactive={false}
                />
              )}
              <CircleMarker
                center={[point.latitude, point.longitude]}
                radius={isSelected ? 9 : 6}
                pathOptions={{
                  color: isSelected ? '#252720' : '#ffffff',
                  weight: isSelected ? 2.5 : 1.5,
                  fillColor: color,
                  fillOpacity: 0.95,
                }}
                eventHandlers={{ click: () => onSelect(point.id) }}
              >
                <Tooltip direction="top" offset={[0, -8]} className="pitscout-tooltip">
                  <span style={{ fontWeight: 600 }}>{point.code}</span>
                  <br />
                  {classLabel(point.severity || 'unknown')} · {classLabel(point.status)}
                  <br />
                  {point.reportCount} report{point.reportCount === 1 ? '' : 's'}
                </Tooltip>
              </CircleMarker>
            </React.Fragment>
          )
        })}
      </MapContainer>

      {map && points.length > 0 && (
        <button
          type="button"
          onClick={fitAll}
          title="Fit all mapped potholes"
          className="absolute right-3 top-3 z-[1000] inline-flex items-center gap-1.5 rounded-lg border border-line bg-card/95 px-2.5 py-1.5 text-[11px] font-medium text-secondary shadow-card backdrop-blur transition hover:text-ink"
        >
          <Maximize2 className="size-3.5" />
          Fit markers
        </button>
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg border border-line bg-card/95 px-3 py-2 shadow-card backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {Object.entries(SEVERITY_COLOR).map(([severity, color]) => (
            <span key={severity} className="flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-wide text-secondary">
              <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
              {severity}
            </span>
          ))}
        </div>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
          Offline coordinate grid · no external tiles
        </p>
      </div>

      {points.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[900] flex items-center justify-center bg-[#efebe1]/40">
          <div className="rounded-xl border border-line bg-card px-5 py-4 text-center shadow-float">
            <p className="text-sm font-semibold text-ink">No potholes match the current filters</p>
            <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-secondary">
              Only canonical potholes with stored coordinates can be plotted. Clear a filter or verify a
              pending report location.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function MapBridge({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap()
  useEffect(() => {
    onReady(map)
    const timer = window.setTimeout(() => map.invalidateSize(), 150)
    return () => window.clearTimeout(timer)
  }, [map, onReady])
  return null
}

function ZoomWatcher({ onChange }: { onChange: (zoom: number) => void }) {
  const map = useMap()
  useMapEvents({
    zoomend: () => onChange(map.getZoom()),
  })
  return null
}

function FitOnLoad({ points }: { points: MapPoint[] }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || points.length === 0) return
    fitted.current = true
    const bounds = L.latLngBounds(
      points.map((point) => [point.latitude, point.longitude] as [number, number])
    )
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [56, 56], maxZoom: 15 })
  }, [map, points])
  return null
}

function FocusOnSelect({
  points,
  selectedId,
}: {
  points: MapPoint[]
  selectedId: string | null
}) {
  const map = useMap()
  useEffect(() => {
    if (!selectedId) return
    const point = points.find((candidate) => candidate.id === selectedId)
    if (!point) return
    map.flyTo([point.latitude, point.longitude], Math.max(map.getZoom(), 15), {
      duration: 0.45,
    })
  }, [map, points, selectedId])
  return null
}
