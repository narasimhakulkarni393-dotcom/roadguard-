'use client'

import React, { useEffect, useState } from 'react'
import {
  MapPin,
  UploadCloud,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldQuestion,
  Crosshair,
  Copy,
  Layers,
  Navigation,
} from 'lucide-react'

interface PotholeReport {
  report_id: string
  pothole_id: string | null
  status: string
  match: {
    decision: string
    score: number | null
    reason: string | null
    signals: any
  }
  location: {
    latitude: number | null
    longitude: number | null
    accuracy_m: number | null
    status: string
    note: string | null
  }
  detection: { class: string | null; confidence: number | null; severity: string | null }
  captured_at: string | null
  created_at: string | null
  description: string | null
  evidence: { evidence_id: string; kind: string; sha256: string; width: number; height: number; url: string }[]
  idempotent_replay?: boolean
}

const DECISION_STYLE: Record<string, string> = {
  MATCH: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  UNCERTAIN: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  NO_MATCH: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  SKIPPED: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
}

export default function ReportPotholePage() {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [reporterId, setReporterId] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [accuracy, setAccuracy] = useState('')
  const [gpsState, setGpsState] = useState<'unknown' | 'acquiring' | 'acquired' | 'unavailable'>('unknown')
  const [gpsMessage, setGpsMessage] = useState<string | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<PotholeReport | null>(null)
  const [relocateAccuracy, setRelocateAccuracy] = useState('')
  const [relocateBusy, setRelocateBusy] = useState(false)

  useEffect(() => {
    setIdempotencyKey(
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `report-${Date.now()}-${Math.random().toString(16).slice(2)}`
    )
  }, [file])

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setGpsState('unavailable')
      setGpsMessage('This browser does not expose the Geolocation API. The report will stay pending location verification.')
      return
    }
    setGpsState('acquiring')
    setGpsMessage(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(7))
        setLongitude(position.coords.longitude.toFixed(7))
        setAccuracy(position.coords.accuracy ? String(Math.round(position.coords.accuracy)) : '')
        setGpsState('acquired')
        setGpsMessage(
          position.coords.accuracy
            ? `Location captured in-browser with ±${Math.round(position.coords.accuracy)} m reported accuracy.`
            : 'Location captured in-browser. Accuracy was not reported by the device.'
        )
      },
      (geoError) => {
        setGpsState('unavailable')
        setGpsMessage(
          `Location unavailable (${geoError.message}). The report will be saved as pending location verification; no coordinates will be invented.`
        )
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  const submit = async () => {
    if (!file) {
      setError('Select a photo of the pothole first.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (description.trim()) formData.append('description', description.trim())
      if (reporterId.trim()) formData.append('reporter_id', reporterId.trim())
      if (latitude.trim()) formData.append('latitude', latitude.trim())
      if (longitude.trim()) formData.append('longitude', longitude.trim())
      if (accuracy.trim()) formData.append('accuracy_m', accuracy.trim())
      formData.append('captured_at', new Date().toISOString())

      const res = await fetch('/api/v1/pothole-reports', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: formData,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`)
      setReport(json)
    } catch (err: any) {
      setError(err.message || 'Report submission failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const relocate = async () => {
    if (!report) return
    if (!latitude.trim() || !longitude.trim()) {
      setError('Enter a latitude and longitude before relocating the report.')
      return
    }
    setRelocateBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/pothole-reports/${report.report_id}/location`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: Number(latitude),
          longitude: Number(longitude),
          accuracy_m: relocateAccuracy.trim() ? Number(relocateAccuracy) : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`)
      setReport(json)
    } catch (err: any) {
      setError(err.message || 'Location update failed.')
    } finally {
      setRelocateBusy(false)
    }
  }

  const matchSignals = report?.match.signals?.signals ?? report?.match.signals ?? null

  return (
    <div className="flex flex-col gap-8 py-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-2">
            <MapPin className="h-7 w-7 text-cyan-400" />
            Report a Pothole
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Submit geotagged evidence. Coordinates come only from your device or explicit manual entry; the server never invents a location.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-6 flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#111C2E] p-6 shadow-xl">
          <label
            htmlFor="pothole-photo"
            className="flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 p-4 text-center transition hover:border-cyan-500/40"
          >
            {previewUrl ? (
              <img src={previewUrl} alt="Pothole preview" className="max-h-52 rounded-lg object-contain" />
            ) : (
              <>
                <UploadCloud className="h-9 w-9 text-cyan-400" />
                <span className="text-sm font-bold text-white">Add pothole photograph</span>
                <span className="text-[11px] text-slate-400">JPEG, PNG, WEBP or BMP up to 50 MB.</span>
              </>
            )}
            <input
              id="pothole-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/bmp"
              className="hidden"
              onChange={(e) => {
                const selected = e.target.files?.[0] || null
                setFile(selected)
                setPreviewUrl(selected ? URL.createObjectURL(selected) : null)
                setReport(null)
                setError(null)
              }}
            />
          </label>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Lane, direction, approximate size, nearby landmarks."
              className="w-full rounded-lg border border-white/10 bg-slate-900 p-2.5 text-xs text-white placeholder:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Reporter ID (optional)</label>
              <input
                value={reporterId}
                onChange={(e) => setReporterId(e.target.value)}
                maxLength={64}
                className="w-full rounded-lg border border-white/10 bg-slate-900 p-2.5 text-xs text-white"
                placeholder="surveyor-07"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={captureLocation}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20"
              >
                {gpsState === 'acquiring' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Crosshair className="h-4 w-4" />
                )}
                Use Device GPS
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Latitude" value={latitude} onChange={setLatitude} />
            <NumberField label="Longitude" value={longitude} onChange={setLongitude} />
            <NumberField label="Accuracy (m)" value={accuracy} onChange={setAccuracy} />
          </div>

          {gpsMessage && (
            <div
              className={`flex items-start gap-2 rounded-xl border p-3 text-[11px] ${
                gpsState === 'acquired'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              }`}
            >
              {gpsState === 'acquired' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
              )}
              <span>{gpsMessage}</span>
            </div>
          )}

          <button
            onClick={submit}
            disabled={isSubmitting}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 py-3 text-sm font-bold text-slate-950 shadow-md shadow-cyan-500/20 hover:brightness-110 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            {isSubmitting ? 'Submitting Report...' : 'Submit Pothole Report'}
          </button>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="lg:col-span-6 flex flex-col gap-4">
          {!report ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#111C2E] p-8 text-center text-slate-500">
              <ShieldQuestion className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-xs max-w-sm">
                After submission you will see the detector result, the duplicate-matching decision with its score and signals,
                and the GPS verification status of this report.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-white/10 bg-[#111C2E] p-5">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-slate-400">Report</span>
                    <div className="font-mono text-sm text-cyan-400 flex items-center gap-1.5">
                      {report.report_id}
                      <button
                        onClick={() => navigator.clipboard?.writeText(report.report_id)}
                        className="text-slate-500 hover:text-white"
                        title="Copy report ID"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-cyan-300">
                    {report.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <Field label="Canonical pothole" value={report.pothole_id || 'Not linked'} mono />
                  <Field
                    label="Detected class"
                    value={report.detection.class ? report.detection.class.replace(/_/g, ' ') : 'Not detected'}
                  />
                  <Field
                    label="Detector confidence"
                    value={
                      report.detection.confidence != null
                        ? `${Math.round(report.detection.confidence * 100)}%`
                        : '—'
                    }
                  />
                  <Field label="Severity" value={report.detection.severity || '—'} />
                </div>

                {report.idempotent_replay && (
                  <p className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-2 text-[11px] text-cyan-200">
                    This submission reused an idempotency key; the original report was returned instead of creating a duplicate.
                  </p>
                )}
              </div>

              <div className={`rounded-2xl border p-5 ${DECISION_STYLE[report.match.decision] || DECISION_STYLE.SKIPPED}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider">
                    Duplicate Decision: {report.match.decision.replace(/_/g, ' ')}
                  </h3>
                  {report.match.score != null && (
                    <span className="font-mono text-xs">score {report.match.score.toFixed(3)}</span>
                  )}
                </div>
                <p className="mt-2 text-[11px] opacity-90">{report.match.reason || 'No matching decision recorded.'}</p>
                {matchSignals && (
                  <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[10px] opacity-90">
                    <span>distance: {matchSignals.distance_m ?? '—'} m</span>
                    <span>radius: {matchSignals.radius_m ?? '—'} m</span>
                    <span>visual: {matchSignals.visual_similarity ?? '—'}</span>
                    <span>shape: {matchSignals.shape_similarity ?? '—'}</span>
                  </div>
                )}
                <p className="mt-3 text-[10px] opacity-75">
                  Proximity alone never merges records. A merge requires the visual and shape signals to clear policy thresholds.
                </p>
              </div>

              <div
                className={`rounded-2xl border p-5 ${
                  report.location.status === 'verified'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                  <Navigation className="h-4 w-4" />
                  Location: {report.location.status.replace(/_/g, ' ')}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[11px]">
                  <span>lat: {report.location.latitude ?? '—'}</span>
                  <span>lon: {report.location.longitude ?? '—'}</span>
                  <span>±{report.location.accuracy_m ?? '—'} m</span>
                </div>
                {report.location.note && <p className="mt-2 text-[11px] opacity-90">{report.location.note}</p>}

                {report.location.status !== 'verified' && !report.pothole_id && (
                  <div className="mt-4 border-t border-white/10 pt-3">
                    <span className="text-[11px] font-semibold">Attach verified coordinates</span>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <NumberField label="Latitude" value={latitude} onChange={setLatitude} />
                      <NumberField label="Longitude" value={longitude} onChange={setLongitude} />
                      <NumberField label="Accuracy (m)" value={relocateAccuracy} onChange={setRelocateAccuracy} />
                    </div>
                    <button
                      onClick={relocate}
                      disabled={relocateBusy}
                      className="mt-2 flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                    >
                      {relocateBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                      Save corrected location
                    </button>
                  </div>
                )}
              </div>

              {report.evidence.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-[#111C2E] p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-3 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" /> Preserved Evidence
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {report.evidence.map((evidence) => (
                      <div key={evidence.evidence_id} className="rounded-xl border border-white/10 overflow-hidden bg-slate-900/60">
                        <img src={evidence.url} alt="Report evidence" className="w-full h-36 object-cover" />
                        <div className="p-2 font-mono text-[10px] text-slate-400">
                          <div>{evidence.width} × {evidence.height}px</div>
                          <div className="truncate">sha256: {evidence.sha256}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="w-full rounded-lg border border-white/10 bg-slate-900 p-2 text-xs text-white font-mono"
        placeholder="—"
      />
    </div>
  )
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-900/60 border border-white/5 p-2">
      <span className="block text-[9px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`text-white ${mono ? 'font-mono text-[11px] break-all' : 'capitalize'}`}>{value}</span>
    </div>
  )
}
