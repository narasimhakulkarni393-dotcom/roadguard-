'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Video,
  UploadCloud,
  Loader2,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Clock,
  Layers,
  Trash2,
  RefreshCw,
} from 'lucide-react'

interface VideoStatus {
  video_id: string
  status: string
  pipeline_stage: string
  progress: number
  original_filename: string
  file_size: number | null
  duration_seconds: number | null
  fps: number | null
  total_frames: number | null
  sampled_frames: number | null
  processed_frames: number | null
  error_message: string | null
  created_at: string | null
  started_at: string | null
  completed_at: string | null
}

interface VideoTrack {
  track_id: number
  class: string
  best_confidence: number
  mean_confidence: number
  frames_seen: number
  first_timestamp_s: number
  last_timestamp_s: number
  severity: { level: string; score: number; priority: string; factors: string[] }
  primary_cause?: string
  keyframe_url: string | null
}

interface VideoResult {
  video_id: string
  status: string
  original_filename: string
  video: {
    width: number
    height: number
    fps: number
    total_frames: number
    duration_seconds: number | null
    sampled_frames: number
    processed_frames: number
    frame_stride: number
  }
  pipeline: {
    road_classification: { label: string | null; confidence: number | null }
    authenticity: { label: string | null; confidence: number | null }
  }
  summary: {
    unique_defects: number
    raw_candidates: number
    filtered_candidates: number
    by_class: Record<string, number>
    highest_severity: string | null
  }
  tracks: VideoTrack[]
  tracking: Record<string, unknown>
  limitations: string[]
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-500/20 text-red-400',
  HIGH: 'bg-orange-500/20 text-orange-400',
  MODERATE: 'bg-yellow-500/20 text-yellow-300',
  LOW: 'bg-emerald-500/20 text-emerald-400',
}

export default function VideoPage() {
  const [file, setFile] = useState<File | null>(null)
  const [videoId, setVideoId] = useState<string | null>(null)
  const [status, setStatus] = useState<VideoStatus | null>(null)
  const [result, setResult] = useState<VideoResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  const pollStatus = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/v1/videos/${id}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`)
        setStatus(json)

        if (json.status === 'completed') {
          stopPolling()
          const resultRes = await fetch(`/api/v1/videos/${id}/result`)
          const resultJson = await resultRes.json()
          if (!resultRes.ok) throw new Error(resultJson.detail || `HTTP ${resultRes.status}`)
          setResult(resultJson)
          setIsUploading(false)
        } else if (['failed', 'rejected', 'needs_model'].includes(json.status)) {
          stopPolling()
          setIsUploading(false)
          setError(json.error_message || `Video analysis ended with status "${json.status}".`)
        }
      } catch (err: any) {
        stopPolling()
        setIsUploading(false)
        setError(err.message || 'Failed to read video job status.')
      }
    },
    [stopPolling]
  )

  const startPolling = useCallback(
    (id: string) => {
      stopPolling()
      pollStatus(id)
      pollRef.current = setInterval(() => pollStatus(id), 1800)
    },
    [pollStatus, stopPolling]
  )

  const upload = async () => {
    if (!file) return
    setIsUploading(true)
    setError(null)
    setResult(null)
    setStatus(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/v1/videos', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`)
      setVideoId(json.video_id)
      startPolling(json.video_id)
    } catch (err: any) {
      setIsUploading(false)
      setError(err.message || 'Upload failed.')
    }
  }

  const deleteJob = async () => {
    if (!videoId) return
    stopPolling()
    try {
      await fetch(`/api/v1/videos/${videoId}`, { method: 'DELETE' })
    } finally {
      setVideoId(null)
      setStatus(null)
      setResult(null)
      setFile(null)
      setError(null)
    }
  }

  return (
    <div className="flex flex-col gap-8 py-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-2">
            <Video className="h-7 w-7 text-cyan-400" />
            Video Road Survey
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Sampled-frame defect detection with IoU/centroid tracking. Every tracked defect keeps its first and last timestamp.
          </p>
        </div>
        {videoId && (
          <button
            onClick={deleteJob}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Video Record
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5 flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#111C2E] p-6 shadow-xl">
          <label
            htmlFor="video-file"
            className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-white/15 bg-[#0E1726]/60 p-6 text-center transition hover:border-cyan-500/40"
          >
            <UploadCloud className="h-9 w-9 text-cyan-400" />
            <span className="text-sm font-bold text-white">
              {file ? file.name : 'Select a survey video'}
            </span>
            <span className="text-[11px] text-slate-400">
              MP4, MOV, AVI, MKV or WEBM up to 200 MB. Analysis samples frames, it does not decode every frame.
            </span>
            <input
              id="video-file"
              type="file"
              accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null)
                setResult(null)
                setStatus(null)
                setError(null)
              }}
            />
          </label>

          <button
            onClick={upload}
            disabled={!file || isUploading}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 py-3 text-sm font-bold text-slate-950 shadow-md shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-50"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            {isUploading ? 'Processing Video...' : 'Analyze Video'}
          </button>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {status && (
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono uppercase text-cyan-400">{status.status}</span>
                <span className="font-mono text-slate-400">{status.progress}%</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-teal-400 transition-all"
                  style={{ width: `${Math.max(2, status.progress)}%` }}
                />
              </div>
              <div className="mt-2 flex flex-col gap-1 text-[11px] text-slate-400">
                <span>Stage: {status.pipeline_stage}</span>
                <span>
                  Frames: {status.processed_frames ?? 0} processed / {status.sampled_frames ?? 0} sampled
                </span>
                {status.duration_seconds != null && <span>Duration: {status.duration_seconds}s</span>}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-7 flex flex-col gap-4">
          {!result ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#111C2E] p-8 text-center text-slate-500">
              <Layers className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-xs max-w-sm">
                No completed video analysis yet. Upload footage to populate tracked defects, severity labels and keyframe crops.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Unique Defects" value={String(result.summary.unique_defects)} />
                <Metric label="Highest Severity" value={result.summary.highest_severity || 'NONE'} />
                <Metric
                  label="Sampled Frames"
                  value={`${result.video.processed_frames} / ${result.video.sampled_frames}`}
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#111C2E] p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-3">
                  Tracked Defects
                </h3>
                {result.tracks.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">
                    No confirmed tracks passed the filter in this video.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {result.tracks.map((track) => (
                      <div
                        key={track.track_id}
                        className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/60"
                      >
                        {track.keyframe_url ? (
                          <img
                            src={track.keyframe_url}
                            alt={`Track ${track.track_id} keyframe`}
                            className="h-32 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-32 items-center justify-center text-[11px] text-slate-500">
                            Keyframe unavailable
                          </div>
                        )}
                        <div className="p-3 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold capitalize text-white">
                              {track.class.replace(/_/g, ' ')}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                SEVERITY_COLOR[track.severity.level] || 'bg-slate-700 text-slate-300'
                              }`}
                            >
                              {track.severity.level}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-col gap-1 font-mono text-[10px] text-slate-400">
                            <span>ID #{track.track_id} · {track.frames_seen} hits</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {track.first_timestamp_s}s → {track.last_timestamp_s}s
                            </span>
                            <span>Best confidence: {Math.round(track.best_confidence * 100)}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-[11px] text-amber-200">
                <div className="flex items-center gap-2 font-bold">
                  <AlertCircle className="h-4 w-4 text-amber-400" />
                  Pipeline Limitations
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {result.limitations.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <MapPin className="h-3.5 w-3.5" />
        Video tracking assigns identity over time, not location. No GPS coordinates are inferred from footage.
        <RefreshCw className="ml-auto h-3.5 w-3.5" />
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#111C2E] p-4">
      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{label}</span>
      <div className="mt-1 text-xl font-extrabold text-white">{value}</div>
    </div>
  )
}
