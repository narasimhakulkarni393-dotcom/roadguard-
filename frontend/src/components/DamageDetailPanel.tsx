'use client'

import React from 'react'
import {
  AlertTriangle,
  Ruler,
  HelpCircle,
  Wrench,
  CheckCircle,
  Info,
  Layers,
  Activity,
  Flame,
} from 'lucide-react'

interface DamageDetailPanelProps {
  detection: any
  onClose?: () => void
}

const SEVERITY_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  LOW: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  MODERATE: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  HIGH: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  CRITICAL: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/40' },
}

export const DamageDetailPanel: React.FC<DamageDetailPanelProps> = ({ detection, onClose }) => {
  if (!detection) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#0E1726] p-6 text-center text-slate-500">
        <Layers className="h-10 w-10 text-slate-600 mb-3" />
        <h3 className="text-sm font-semibold text-slate-400">No Defect Selected</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">
          Click any bounding box on the image or choose a defect from the list to view engineering measurements and diagnostics.
        </p>
      </div>
    )
  }

  const sevStyle = SEVERITY_BADGES[detection.severity?.level] || SEVERITY_BADGES.LOW

  const x1 = Array.isArray(detection.bbox) ? detection.bbox[0] : (detection.bbox?.x1 ?? 0)
  const y1 = Array.isArray(detection.bbox) ? detection.bbox[1] : (detection.bbox?.y1 ?? 0)
  const x2 = Array.isArray(detection.bbox) ? detection.bbox[2] : (detection.bbox?.x2 ?? 0)
  const y2 = Array.isArray(detection.bbox) ? detection.bbox[3] : (detection.bbox?.y2 ?? 0)
  const calcW = Math.max(1, Math.abs(x2 - x1))
  const calcH = Math.max(1, Math.abs(y2 - y1))

  const widthPixels = detection.measurements?.width_pixels || calcW
  const heightPixels = detection.measurements?.height_pixels || calcH
  const areaPixels = detection.measurements?.area_pixels || (widthPixels * heightPixels)
  const relativeArea = detection.measurements?.relative_area || (areaPixels / (1280 * 720))

  const causesList = detection.probable_causes || detection.possible_causes || []

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0E1726] p-5 shadow-xl text-slate-200">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-white/10 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-cyan-400">
              ID: {detection.detection_id || 'DEF-01'}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${sevStyle.bg} ${sevStyle.text} ${sevStyle.border}`}>
              {detection.severity?.level || 'LOW'} SEVERITY
            </span>
          </div>
          <h3 className="text-lg font-bold text-white mt-1">
            {detection.class_name || 'Detected Defect'}
          </h3>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Confidence</span>
          <span className="font-mono text-base font-bold text-cyan-400">
            {Math.round((detection.confidence || 0) * 100)}%
          </span>
        </div>
      </div>

      {/* Severity Score Meter */}
      <div className="rounded-xl border border-white/5 bg-slate-900/60 p-3.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-slate-300">
            <Flame className="h-4 w-4 text-orange-400" />
            Severity Score
          </span>
          <span className="font-mono font-bold text-white">
            {detection.severity?.score || 0} / 100
          </span>
        </div>
        <div className="w-full bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-400 via-amber-400 to-red-500 transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(5, detection.severity?.score || 0))}%` }}
          />
        </div>
        {detection.severity?.factors && detection.severity.factors.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {detection.severity.factors.map((f: any, idx: number) => (
              <span
                key={idx}
                className="text-[10px] font-mono bg-white/5 border border-white/5 text-slate-300 px-2 py-0.5 rounded"
              >
                {f.name}: +{Math.round(f.contribution || 0)} pts
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Dimensional Measurements */}
      <div className="rounded-xl border border-white/5 bg-slate-900/60 p-3.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 border-b border-white/5 pb-2">
          <Ruler className="h-3.5 w-3.5 text-cyan-400" />
          Geometric Measurements
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2.5 text-xs font-mono">
          <div>
            <span className="text-slate-500 block text-[10px]">Width (Pixels)</span>
            <span className="text-white font-semibold">
              {Math.round(widthPixels)} px
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">Height (Pixels)</span>
            <span className="text-white font-semibold">
              {Math.round(heightPixels)} px
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">Area Bounding Box</span>
            <span className="text-white font-semibold">
              {Math.round(areaPixels).toLocaleString()} px²
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">Relative Road Area</span>
            <span className="text-cyan-400 font-semibold">
              {(relativeArea * 100).toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Physical calibration disclaimer */}
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-[11px] text-amber-300">
          <Info className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <span>
            {detection.measurements?.limitation ||
              'Real-world physical units (cm/m) require camera intrinsic calibration or an on-road metric reference.'}
          </span>
        </div>
      </div>

      {/* Possible Causes (Hypotheses) */}
      <div className="rounded-xl border border-white/5 bg-slate-900/60 p-3.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 border-b border-white/5 pb-2">
          <HelpCircle className="h-3.5 w-3.5 text-teal-400" />
          Possible Contributing Causes (Hypotheses)
        </div>
        <div className="mt-2.5 flex flex-col gap-2">
          {causesList.length > 0 ? (
            causesList.map((c: any, idx: number) => (
              <div key={idx} className="rounded-lg bg-slate-950/40 p-2 text-xs border border-white/5">
                <div className="flex items-center justify-between font-medium text-white">
                  <span className="capitalize">{c.cause || c}</span>
                  {c.confidence && (
                    <span className="text-[10px] font-mono text-cyan-400">
                      {Math.round(c.confidence * 100)}% conf
                    </span>
                  )}
                  {c.likelihood && (
                    <span className="text-[10px] font-mono text-cyan-400 uppercase">
                      {c.likelihood}
                    </span>
                  )}
                </div>
                {c.recommended_inspection && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Check: {c.recommended_inspection}
                  </p>
                )}
              </div>
            ))
          ) : (
            <span className="text-xs text-slate-500">No specific causes identified.</span>
          )}
        </div>
      </div>

      {/* Recommended Next Actions */}
      <div className="rounded-xl border border-white/5 bg-slate-900/60 p-3.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 border-b border-white/5 pb-2">
          <Wrench className="h-3.5 w-3.5 text-cyan-400" />
          Recommended Actions
        </div>
        <ul className="mt-2.5 flex flex-col gap-1.5 text-xs text-slate-300">
          {detection.recommended_actions && detection.recommended_actions.length > 0 ? (
            detection.recommended_actions.map((act: string, idx: number) => (
              <li key={idx} className="flex items-start gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <span>{act}</span>
              </li>
            ))
          ) : (
            <li className="text-slate-500">Perform standard visual monitoring.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
