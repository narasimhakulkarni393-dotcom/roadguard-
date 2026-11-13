'use client'

import React, { useState, useEffect } from 'react'
import {
  BarChart3,
  TrendingUp,
  PieChart as PieIcon,
  Filter,
  RefreshCw,
  AlertCircle,
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
  Legend,
} from 'recharts'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

const SEV_COLORS: Record<string, string> = {
  LOW: '#10B981',
  MODERATE: '#F59E0B',
  HIGH: '#FB923C',
  CRITICAL: '#EF4444',
}

export default function AnalyticsPage() {
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('30d')

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/analytics/overview`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [])

  return (
    <div className="flex flex-col gap-8 py-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-cyan-400" />
            Road Damage Analytics &amp; Trends
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Aggregated statistical insights, defect proportions, and structural severity trends.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
          <button
            onClick={fetchAnalytics}
            className="rounded-lg border border-white/10 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin text-cyan-400" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Main Defect Frequency Chart */}
          <div className="lg:col-span-8 rounded-2xl border border-white/10 bg-[#111C2E] p-6 shadow-xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-cyan-400 mb-4">
              Defect Distribution by Type
            </h3>
            {data?.damage_distribution && data.damage_distribution.length > 0 ? (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.damage_distribution}>
                    <XAxis dataKey="name" stroke="#64748B" fontSize={11} />
                    <YAxis stroke="#64748B" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0B1220',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="count" fill="#22D3EE" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-72 flex-col items-center justify-center text-slate-500 text-xs">
                <Layers className="h-8 w-8 mb-2 opacity-50" />
                No defect data available for this range.
              </div>
            )}
          </div>

          {/* Severity Proportion Pie Chart */}
          <div className="lg:col-span-4 rounded-2xl border border-white/10 bg-[#111C2E] p-6 shadow-xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-cyan-400 mb-4">
              Severity Hierarchy
            </h3>
            {data?.severity_distribution && data.severity_distribution.length > 0 ? (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.severity_distribution}
                      dataKey="count"
                      nameKey="level"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
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
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-72 flex-col items-center justify-center text-slate-500 text-xs">
                No severity records.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
