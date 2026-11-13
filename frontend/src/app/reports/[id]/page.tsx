'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  FileText,
  Printer,
  ArrowLeft,
  ShieldCheck,
  Flame,
  AlertTriangle,
  Info,
  Calendar,
  Layers,
  Ruler,
} from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

function ReportContent() {
  const params = useParams()
  const id = params?.id as string

  const [report, setReport] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const fetchReport = async () => {
      setLoading(true)
      try {
        const res = await fetch(`${API_BASE}/api/v1/reports/${id}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setReport(data)
      } catch (err: any) {
        setError(err.message || 'Report not found or still processing.')
      } finally {
        setLoading(false)
      }
    }
    fetchReport()
  }, [id])

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-slate-400">
        Loading inspection report...
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <h2 className="text-lg font-bold text-white">Report Not Found</h2>
        <p className="text-xs text-slate-400 max-w-sm">
          {error || 'Unable to load report details for this inspection ID.'}
        </p>
        <Link
          href="/dashboard"
          className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
        >
          Return to Dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 py-6 print:p-0">
      {/* Top Controls (Hidden on print) */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4 print:hidden">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </Link>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30 px-3.5 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/30"
        >
          <Printer className="h-3.5 w-3.5" />
          Print / Export PDF
        </button>
      </div>

      {/* Main Printable Document Card */}
      <div className="rounded-2xl border border-white/10 bg-[#111C2E] p-8 shadow-2xl print:border-none print:bg-white print:text-black">
        {/* Document Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between border-b border-white/10 pb-6 gap-4 print:border-black">
          <div>
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400 print:text-blue-600">
              Official Assessment Dossier
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white mt-1 print:text-black">
              RoadGuard AI &mdash; Pavement Inspection Report
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-2 font-mono print:text-gray-600">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-cyan-400 print:text-black" />
                Date: {report.created_at ? new Date(report.created_at).toLocaleString() : 'N/A'}
              </span>
              <span>&bull;</span>
              <span>Analysis ID: {report.analysis_id}</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-900 p-4 text-right print:bg-gray-100 print:border-gray-300">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono print:text-gray-500">
              Overall Severity Rating
            </span>
            <span
              className={`text-xl font-extrabold ${
                report.summary?.overall_severity === 'CRITICAL'
                  ? 'text-red-400 print:text-red-600'
                  : report.summary?.overall_severity === 'HIGH'
                  ? 'text-orange-400 print:text-orange-600'
                  : 'text-emerald-400 print:text-green-600'
              }`}
            >
              {report.summary?.overall_severity || 'LOW'} ({report.summary?.overall_severity_score || 0}/100)
            </span>
          </div>
        </div>

        {/* Executive Summary */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/5 bg-slate-900/40 p-4 print:bg-gray-50 print:border-gray-200">
            <span className="text-[10px] uppercase font-mono text-slate-400 print:text-gray-500">Defects Identified</span>
            <div className="text-xl font-bold text-white mt-1 print:text-black">
              {report.detections?.length || 0} region(s)
            </div>
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-900/40 p-4 print:bg-gray-50 print:border-gray-200">
            <span className="text-[10px] uppercase font-mono text-slate-400 print:text-gray-500">Authenticity Verification</span>
            <div className="text-xl font-bold capitalize text-cyan-400 mt-1 print:text-blue-600">
              {report.authenticity?.verdict || 'Natural'}
            </div>
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-900/40 p-4 print:bg-gray-50 print:border-gray-200">
            <span className="text-[10px] uppercase font-mono text-slate-400 print:text-gray-500">Action Recommendation</span>
            <div className="text-xl font-bold capitalize text-amber-400 mt-1 print:text-yellow-600">
              {report.summary?.immediate_action_required ? 'Immediate Repair' : 'Routine Monitoring'}
            </div>
          </div>
        </div>

        {/* Images Comparison */}
        <div className="mt-8">
          <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400 mb-3 print:text-blue-600">
            Visual Evidence &amp; Spatial Localization
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-slate-400 font-mono print:text-gray-600">Original Image</span>
              <img
                src={`${API_BASE}/api/v1/analysis/${report.analysis_id}/original-image`}
                alt="Original Road"
                className="rounded-xl border border-white/10 max-h-72 object-contain bg-slate-950 w-full print:border-gray-300"
              />
            </div>
            {report.annotated_image_url && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400 font-mono print:text-gray-600">Computer Vision Localization</span>
                <img
                  src={`${API_BASE}${report.annotated_image_url}`}
                  alt="Annotated Road"
                  className="rounded-xl border border-white/10 max-h-72 object-contain bg-slate-950 w-full print:border-gray-300"
                />
              </div>
            )}
          </div>
        </div>

        {/* Defects Details Table */}
        <div className="mt-8">
          <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400 mb-3 print:text-blue-600">
            Defect Breakdown &amp; Engineering Measurements
          </h3>
          {report.detections && report.detections.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-white/10 print:border-gray-300">
                <thead className="bg-slate-900 border-b border-white/10 text-slate-400 font-mono print:bg-gray-100 print:text-black">
                  <tr>
                    <th className="py-2.5 px-3">Defect ID</th>
                    <th className="py-2.5 px-3">Class</th>
                    <th className="py-2.5 px-3">Confidence</th>
                    <th className="py-2.5 px-3">Severity</th>
                    <th className="py-2.5 px-3">Area (Pixels)</th>
                    <th className="py-2.5 px-3">Primary Hypothesis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 print:divide-gray-200">
                  {report.detections.map((d: any) => (
                    <tr key={d.detection_id} className="print:text-black">
                      <td className="py-2.5 px-3 font-mono text-cyan-400 print:text-blue-600">
                        {d.detection_id}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white print:text-black">
                        {d.class_name}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {Math.round(d.confidence * 100)}%
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold">{d.severity?.level} ({d.severity?.score}/100)</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {Math.round(d.measurements?.area_pixels || 0).toLocaleString()} px²
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 print:text-gray-700">
                        {d.possible_causes?.[0]?.cause || 'Under investigation'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-xs text-slate-400 italic">No defects identified in this inspection.</div>
          )}
        </div>

        {/* Engineering Limitations */}
        <div className="mt-8 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-200 print:border-gray-300 print:bg-gray-50 print:text-gray-700">
          <div className="flex items-center gap-2 font-bold mb-1">
            <Info className="h-4 w-4 text-amber-400 print:text-black" />
            Computer Vision Engineering Limitations
          </div>
          <p className="leading-relaxed text-[11px] opacity-90">
            Analysis conducted via 2D monocular RGB visual sensing. Real-world physical dimensions (meters/centimeters) and pavement cavity depth require calibrated stereo-vision or field survey verification. Hypotheses generated by the diagnostic engine are probabilistic and intended to guide civil engineering inspection priority rather than replace on-site geotechnical core sampling.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function ReportDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading report...</div>}>
      <ReportContent />
    </Suspense>
  )
}
