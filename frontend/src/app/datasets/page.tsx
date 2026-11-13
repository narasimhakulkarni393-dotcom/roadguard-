'use client'

import React, { useState, useEffect } from 'react'
import {
  Database,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  FileCheck2,
} from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

export default function DatasetsPage() {
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const fetchStatus = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/datasets/status`)
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
    fetchStatus()
  }, [])

  const handleValidate = async (datasetName: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/datasets/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_name: datasetName }),
      })
      const json = await res.json()
      setActionMessage(json.detail || json.message || `Dataset validation returned HTTP ${res.status}`)
    } catch (e: any) {
      setActionMessage(`Error: ${e.message}`)
    }
  }

  const handlePrepare = async (datasetName: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/datasets/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_name: datasetName }),
      })
      const json = await res.json()
      setActionMessage(json.detail || json.message || `Dataset preparation returned HTTP ${res.status}`)
    } catch (e: any) {
      setActionMessage(`Error: ${e.message}`)
    }
  }

  return (
    <div className="flex flex-col gap-8 py-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-2">
            <Database className="h-7 w-7 text-cyan-400" />
            Dataset Repositories &amp; Provenance
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Official multi-national road damage corpora and AI-generation benchmarks with license verification.
          </p>
        </div>

        <button
          onClick={fetchStatus}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Status
        </button>
      </div>

      {actionMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3.5 text-xs text-cyan-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-400" />
          <span>{actionMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin text-cyan-400" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {data?.datasets?.map((ds: any) => (
            <div
              key={ds.id}
              className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#111C2E] p-6 shadow-xl"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-mono uppercase text-cyan-400 font-bold">
                      {ds.id}
                    </span>
                    <h3 className="text-lg font-bold text-white mt-1">{ds.name}</h3>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                      ds.status === 'ready'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {ds.status.toUpperCase()}
                  </span>
                </div>

                <div className="mt-4 flex flex-col gap-2 text-xs text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">License:</span>
                    <span className="font-mono text-cyan-300 font-bold">{ds.licence}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Official Source:</span>
                    <a
                      href={ds.source}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-cyan-400 hover:underline"
                    >
                      Repository <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Raw Files Found:</span>
                    <span className="font-mono text-white">{ds.raw_files}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Processed Files:</span>
                    <span className="font-mono text-white">{ds.processed_files}</span>
                  </div>
                </div>

                <div className="mt-4 border-t border-white/5 pt-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Target Classes:
                  </span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ds.classes?.map((c: string, idx: number) => (
                      <span
                        key={idx}
                        className="rounded bg-slate-900 border border-white/5 px-2 py-0.5 text-[10px] font-mono text-slate-300"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-4">
                <button
                  onClick={() => handleValidate(ds.id)}
                  className="flex-1 rounded-lg border border-white/10 bg-slate-800 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                >
                  Validate Dataset
                </button>
                <button
                  onClick={() => handlePrepare(ds.id)}
                  className="flex-1 rounded-lg bg-cyan-500/20 border border-cyan-500/30 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/30"
                >
                  Prepare for Training
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
