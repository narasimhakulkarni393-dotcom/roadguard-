'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ScanEye,
  ShieldAlert,
  AlertTriangle,
  Flame,
  Clock,
  ArrowRight,
  TrendingUp,
  Cpu,
  RefreshCw,
  Layers,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

const SEV_COLORS: Record<string, string> = {
  LOW: '#10B981',
  MODERATE: '#F59E0B',
  HIGH: '#FB923C',
  CRITICAL: '#EF4444',
}

export default function DashboardPage() {
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/v1/analytics/overview`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (err: any) {
      setError(err.message || 'Failed to connect to backend analytics.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  return (
    <div className="flex flex-col gap-8 py-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-2">
            <TrendingUp className="h-7 w-7 text-cyan-400" />
            Infrastructure Intelligence Dashboard
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Real-time telemetry and defect aggregation across inspected road segments.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <Link
            href="/inspect"
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-teal-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-cyan-500/20"
          >
            <ScanEye className="h-3.5 w-3.5" />
            New Inspection
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-white/10 bg-[#111C2E] p-8 text-slate-400">
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="h-6 w-6 animate-spin text-cyan-400" />
            <span className="text-xs">Loading live telemetry...</span>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-300">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-400 mb-2" />
          <p className="text-sm font-semibold">{error}</p>
          <button
            onClick={fetchData}
            className="mt-3 rounded-lg bg-red-500/20 px-3 py-1 text-xs text-red-200 border border-red-500/30"
          >
            Try Again
          </button>
        </div>
      ) : (
        <>
          {/* Key Metric Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-[#111C2E] p-5 shadow-lg">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Total Inspections
              </span>
              <div className="text-3xl font-extrabold text-white mt-2">
                {data?.total_inspections ?? 0}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {data?.completed_analyses ?? 0} completed successfully
              </span>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#111C2E] p-5 shadow-lg">
              <span className="text-xs font-mono text-cyan-400 uppercase tracking-wider">
                Total Defects
              </span>
              <div className="text-3xl font-extrabold text-cyan-400 mt-2">
                {data?.total_detections ?? 0}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">All registered damages</span>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#111C2E] p-5 shadow-lg">
              <span className="text-xs font-mono text-red-400 uppercase tracking-wider">
                Potholes Detected
              </span>
              <div className="text-3xl font-extrabold text-red-400 mt-2">
                {data?.potholes_detected ?? 0}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">CRDDC Class D40</span>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#111C2E] p-5 shadow-lg">
              <span className="text-xs font-mono text-orange-400 uppercase tracking-wider">
                High Priority Defects
              </span>
              <div className="text-3xl font-extrabold text-orange-400 mt-2">
                {data?.high_priority_defects ?? 0}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">High &amp; Critical severity</span>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Defect Distribution Bar Chart */}
            <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#111C2E] p-6 shadow-xl">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider text-cyan-400 mb-4">
                Defects by Category
              </h3>
              {data?.damage_distribution && data.damage_distribution.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.damage_distribution}>
                      <XAxis dataKey="name" stroke="#64748B" fontSize={11} />
                      <YAxis stroke="#64748B" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0B1220',
                          borderColor: 'rgba(255,255,255,0.1)',
                          borderRadius: '8px',
                          color: '#fff',
                        }}
                      />
                      <Bar dataKey="count" fill="#22D3EE" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-64 flex-col items-center justify-center text-center text-slate-500">
                  <Layers className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-xs">No defects recorded yet.</p>
                  <Link href="/inspect" className="text-xs text-cyan-400 mt-1 hover:underline">
                    Run an inspection to populate telemetry
                  </Link>
                </div>
              )}
            </div>

            {/* Severity Distribution Pie Chart */}
            <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#111C2E] p-6 shadow-xl">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider text-cyan-400 mb-4">
                Severity Breakdown
              </h3>
              {data?.severity_distribution && data.severity_distribution.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.severity_distribution}
                        dataKey="count"
                        nameKey="level"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label
                      >
                        {data.severity_distribution.map((entry: any, index: number) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={SEV_COLORS[entry.level] || '#22D3EE'}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0B1220',
                          borderColor: 'rgba(255,255,255,0.1)',
                          borderRadius: '8px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-64 flex-col items-center justify-center text-center text-slate-500">
                  <Flame className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-xs">No severity metrics recorded yet.</p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Inspections Table */}
          <div className="rounded-2xl border border-white/10 bg-[#111C2E] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider text-cyan-400">
                Recent Road Inspections
              </h3>
              <Link href="/inspect" className="text-xs text-cyan-400 hover:underline">
                Upload New Image &rarr;
              </Link>
            </div>

            {data?.recent_inspections && data.recent_inspections.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/10 text-slate-400 font-mono">
                    <tr>
                      <th className="py-2.5 px-3">Inspection ID</th>
                      <th className="py-2.5 px-3">Filename</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.recent_inspections.map((insp: any) => (
                      <tr key={insp.id} className="hover:bg-slate-800/40">
                        <td className="py-3 px-3 font-mono text-cyan-400">
                          {insp.id.substring(0, 8)}...
                        </td>
                        <td className="py-3 px-3 text-white font-medium">
                          {insp.filename || 'road_sample.jpg'}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                              insp.status === 'completed'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-cyan-500/20 text-cyan-300'
                            }`}
                          >
                            {insp.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-400 font-mono">
                          {insp.created_at ? new Date(insp.created_at).toLocaleString() : 'N/A'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Link
                            href={`/reports/${insp.id}`}
                            className="rounded bg-slate-800 px-2.5 py-1 text-slate-300 hover:bg-slate-700"
                          >
                            Report
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 text-xs">
                No inspection history in the database. Upload a road photograph to create the first record.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
