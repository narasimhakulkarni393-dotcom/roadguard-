'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  MapPin,
  RefreshCw,
  AlertCircle,
  Loader2,
  Layers,
  History,
  ListChecks,
} from 'lucide-react'
import { PotholeMap, type MapPothole } from '@/components/PotholeMap'

interface PotholeListItem {
  pothole_id: string
  code: string
  status: string
  severity: string | null
  latitude: number | null
  longitude: number | null
  location_accuracy_m: number | null
  report_count: number
  first_reported_at: string | null
  last_reported_at: string | null
}

interface PotholeDetail extends PotholeListItem {
  created_at: string | null
  reports: any[]
  locations: any[]
  status_history: { from: string; to: string; reason: string | null; actor: string | null; at: string | null }[]
}

const NEXT_STATUS: Record<string, string[]> = {
  reported: ['verified', 'rejected'],
  verified: ['scheduled', 'rejected'],
  scheduled: ['in_progress', 'verified'],
  in_progress: ['repaired', 'scheduled'],
  repaired: ['closed', 'verified'],
  closed: ['verified'],
  rejected: [],
}

const STATUS_STYLE: Record<string, string> = {
  reported: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  verified: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  scheduled: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  in_progress: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  repaired: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  closed: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  rejected: 'bg-red-500/15 text-red-300 border-red-500/30',
}

export default function PotholesPage() {
  const [items, setItems] = useState<PotholeListItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<PotholeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)
  const [reason, setReason] = useState('')

  const loadList = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/potholes?page_size=200')
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`)
      setItems(json.items || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load potholes.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/potholes/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`)
      setDetail(json)
    } catch (err: any) {
      setError(err.message || 'Failed to load pothole details.')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  useEffect(() => {
    if (selectedId) loadDetail(selectedId)
    else setDetail(null)
  }, [selectedId, loadDetail])

  const changeStatus = async (toStatus: string) => {
    if (!detail) return
    setStatusBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/potholes/${detail.pothole_id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: toStatus, reason: reason.trim() || null, actor: 'dashboard-operator' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(typeof json.detail === 'string' ? json.detail : `HTTP ${res.status}`)
      setDetail(json)
      setReason('')
      loadList()
    } catch (err: any) {
      setError(err.message || 'Status transition failed.')
    } finally {
      setStatusBusy(false)
    }
  }

  const mapItems: MapPothole[] = items.map((item) => ({
    pothole_id: item.pothole_id,
    code: item.code,
    latitude: item.latitude,
    longitude: item.longitude,
    severity: item.severity,
    status: item.status,
    report_count: item.report_count,
  }))

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-2">
            <MapPin className="h-7 w-7 text-cyan-400" />
            Pothole Registry
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Canonical potholes with verified coordinates, merged reports and an auditable status history.
          </p>
        </div>
        <button
          onClick={loadList}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 flex flex-col gap-4">
          <PotholeMap potholes={mapItems} selectedId={selectedId} onSelect={setSelectedId} />

          <div className="rounded-2xl border border-white/10 bg-[#111C2E] p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-3 flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5" /> Canonical Records ({items.length})
            </h3>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-400" /> Loading registry...
              </div>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                No canonical potholes yet. Verified reports create canonical records automatically.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/10 font-mono text-slate-400">
                    <tr>
                      <th className="py-2 px-2">Code</th>
                      <th className="py-2 px-2">Status</th>
                      <th className="py-2 px-2">Severity</th>
                      <th className="py-2 px-2">Reports</th>
                      <th className="py-2 px-2">Last Reported</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {items.map((item) => (
                      <tr
                        key={item.pothole_id}
                        onClick={() => setSelectedId(item.pothole_id)}
                        className={`cursor-pointer ${
                          selectedId === item.pothole_id ? 'bg-cyan-500/10' : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2.5 px-2 font-mono text-cyan-400">{item.code}</td>
                        <td className="py-2.5 px-2">
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                              STATUS_STYLE[item.status] || 'border-slate-500/30 bg-slate-500/15 text-slate-300'
                            }`}
                          >
                            {item.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-white">{item.severity || '—'}</td>
                        <td className="py-2.5 px-2 font-mono text-slate-300">{item.report_count}</td>
                        <td className="py-2.5 px-2 font-mono text-slate-400">
                          {item.last_reported_at ? new Date(item.last_reported_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5">
          {!selectedId ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#111C2E] p-6 text-center text-slate-500">
              <Layers className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-xs">Select a point or a table row to inspect the merged reports.</p>
            </div>
          ) : detailLoading || !detail ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-white/10 bg-[#111C2E] text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border border-white/10 bg-[#111C2E] p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-slate-400">Canonical Pothole</span>
                    <h2 className="font-mono text-lg font-bold text-white">{detail.code}</h2>
                  </div>
                  <span
                    className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${
                      STATUS_STYLE[detail.status] || 'border-slate-500/30 bg-slate-500/15 text-slate-300'
                    }`}
                  >
                    {detail.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Info label="Severity" value={detail.severity || '—'} />
                  <Info label="Reports merged" value={String(detail.report_count)} />
                  <Info
                    label="Coordinates"
                    value={
                      detail.latitude != null && detail.longitude != null
                        ? `${detail.latitude}, ${detail.longitude}`
                        : 'None'
                    }
                  />
                  <Info
                    label="Location accuracy"
                    value={detail.location_accuracy_m != null ? `±${detail.location_accuracy_m} m` : '—'}
                  />
                </div>

                {NEXT_STATUS[detail.status]?.length > 0 && (
                  <div className="mt-4 border-t border-white/10 pt-3">
                    <span className="text-[11px] font-semibold text-slate-300">Advance status</span>
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason (optional, recorded in history)"
                      className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900 p-2 text-xs text-white placeholder:text-slate-500"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {NEXT_STATUS[detail.status].map((next) => (
                        <button
                          key={next}
                          onClick={() => changeStatus(next)}
                          disabled={statusBusy}
                          className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-semibold uppercase text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50"
                        >
                          {next.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#111C2E] p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-3">
                  Merged Reports ({detail.reports.length})
                </h3>
                <div className="flex flex-col gap-2">
                  {detail.reports.map((report) => (
                    <div key={report.report_id} className="rounded-xl border border-white/5 bg-slate-900/60 p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-cyan-400">{report.report_id.slice(0, 8)}…</span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">
                          {String(report.status).replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-[10px] text-slate-400">
                        <span>{report.detection?.class || 'no detection'}</span>
                        <span>
                          match: {report.match?.decision} {report.match?.score != null ? `(${report.match.score.toFixed(3)})` : ''}
                        </span>
                        <span>{report.created_at ? new Date(report.created_at).toLocaleString() : '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#111C2E] p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-3 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" /> Status History
                </h3>
                {detail.status_history.length === 0 ? (
                  <p className="text-xs text-slate-500">No transitions recorded.</p>
                ) : (
                  <ol className="flex flex-col gap-2 text-[11px]">
                    {detail.status_history.map((entry, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                        <div>
                          <span className="text-slate-200">
                            {entry.from} → <b>{entry.to}</b>
                          </span>
                          {entry.reason && <p className="text-slate-400">{entry.reason}</p>}
                          <span className="font-mono text-[10px] text-slate-500">
                            {entry.at ? new Date(entry.at).toLocaleString() : ''} {entry.actor ? `· ${entry.actor}` : ''}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-slate-900/60 p-2">
      <span className="block text-[9px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className="font-mono text-[11px] text-white break-all">{value}</span>
    </div>
  )
}
