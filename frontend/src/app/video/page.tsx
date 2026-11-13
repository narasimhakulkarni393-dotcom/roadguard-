'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion } from 'framer-motion'
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
  Film,
  Play,
  ShieldCheck,
  Gauge,
  Activity,
} from 'lucide-react'
import {
  PageHeader,
  StatCard,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  SeverityBadge,
  StatusBadge,
  EmptyState,
  Progress,
} from '@/components/ui'
import { clientApi } from '@/lib/client-api'
import type { VideoJob, VideoResult, VideoTrack } from '@/types/pitscout'
import { classLabel, formatBytes, formatDateTime, formatNumber, humanize, timeAgo } from '@/lib/format'

const VIDEO_ACCEPT = {
  'video/*': ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v'],
}

const ACTIVE_STATUSES = new Set(['pending', 'processing', 'queued'])

function errorMessage(err: any, fallback: string) {
  const detail = err?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') {
    return detail.error || detail.detail || fallback
  }
  return err?.message || fallback
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

export default function VideoPage() {
  const [file, setFile] = useState<File | null>(null)
  const [videoId, setVideoId] = useState<string | null>(null)
  const [status, setStatus] = useState<VideoJob | null>(null)
  const [result, setResult] = useState<VideoResult | null>(null)
  const [recent, setRecent] = useState<VideoJob[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollInFlight = useRef(false)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const loadRecent = useCallback(async () => {
    try {
      const data = await clientApi.videos(1, 6)
      setRecent(data.items)
    } catch {
      // The work area already surfaces connectivity problems; keep the list quiet.
    }
  }, [])

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  const loadResult = useCallback(async (id: string) => {
    const payload = await clientApi.videoResult(id)
    setResult(payload)
    setIsProcessing(false)
    setUploadProgress(100)
    void loadRecent()
  }, [loadRecent])

  const pollStatus = useCallback(
    async (id: string) => {
      if (pollInFlight.current) return
      pollInFlight.current = true
      try {
        const job = await clientApi.video(id)
        setStatus(job)
        setUploadProgress(job.progress || 0)

        if (job.status === 'completed') {
          stopPolling()
          try {
            await loadResult(id)
          } catch (err: any) {
            setError(errorMessage(err, 'The completed result could not be loaded.'))
            setIsProcessing(false)
          }
        } else if (!ACTIVE_STATUSES.has(job.status)) {
          stopPolling()
          setIsProcessing(false)
          setError(job.error_message || `Video analysis ended with status "${job.status}".`)
          void loadRecent()
        }
      } catch (err: any) {
        stopPolling()
        setIsProcessing(false)
        setError(errorMessage(err, 'Failed to read the video job status.'))
      } finally {
        pollInFlight.current = false
      }
    },
    [loadRecent, loadResult, stopPolling]
  )

  const startPolling = useCallback(
    (id: string) => {
      stopPolling()
      void pollStatus(id)
      pollRef.current = setInterval(() => {
        void pollStatus(id)
      }, 1800)
    },
    [pollStatus, stopPolling]
  )

  const onDrop = useCallback((accepted: File[]) => {
    if (!accepted.length) return
    setFile(accepted[0])
    setResult(null)
    setStatus(null)
    setVideoId(null)
    setError(null)
    setUploadProgress(0)
    setIsProcessing(false)
  }, [])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    onDropRejected: (rejections) => {
      const reason = rejections[0]?.errors?.[0]?.code
      setError(
        reason === 'file-too-large'
          ? 'That video exceeds the 200 MB upload limit for this workspace.'
          : reason === 'file-invalid-type'
            ? 'Unsupported video type. Use MP4, MOV, AVI, WEBM, MKV or M4V.'
            : 'The video could not be accepted. Check the file and try again.'
      )
    },
    accept: VIDEO_ACCEPT,
    maxSize: 200 * 1024 * 1024,
    multiple: false,
  })

  const upload = async () => {
    if (!file || isProcessing) return
    stopPolling()
    setIsProcessing(true)
    setError(null)
    setResult(null)
    setStatus(null)
    setUploadProgress(0)
    try {
      const job = await clientApi.uploadVideo(file, (percent) => setUploadProgress(percent))
      setVideoId(job.video_id)
      startPolling(job.video_id)
    } catch (err: any) {
      setIsProcessing(false)
      setError(errorMessage(err, 'The video could not be uploaded.'))
    }
  }

  const loadJob = useCallback(
    async (job: VideoJob) => {
      stopPolling()
      setError(null)
      setResult(null)
      setFile(null)
      setVideoId(job.video_id)
      setStatus(job)
      setUploadProgress(job.progress || 0)

      if (job.status === 'completed') {
        setIsProcessing(false)
        try {
          await loadResult(job.video_id)
        } catch (err: any) {
          setError(errorMessage(err, 'The stored result could not be loaded.'))
        }
        return
      }
      if (ACTIVE_STATUSES.has(job.status)) {
        setIsProcessing(true)
        startPolling(job.video_id)
        return
      }
      setIsProcessing(false)
      setError(job.error_message || `This job ended with status "${job.status}".`)
    },
    [loadResult, startPolling, stopPolling]
  )

  const resetView = useCallback(() => {
    stopPolling()
    setFile(null)
    setVideoId(null)
    setStatus(null)
    setResult(null)
    setError(null)
    setUploadProgress(0)
    setIsProcessing(false)
  }, [stopPolling])

  const deleteJob = async () => {
    if (!videoId) return
    const confirmed = window.confirm(
      'Delete this video job, its stored upload and its keyframe crops? This cannot be undone.'
    )
    if (!confirmed) return
    stopPolling()
    try {
      await clientApi.deleteVideo(videoId)
      resetView()
      void loadRecent()
    } catch (err: any) {
      setError(errorMessage(err, 'The video record could not be deleted.'))
    }
  }

  const progress = Math.max(0, Math.min(100, Math.round(uploadProgress)))
  const framesLabel =
    status?.processed_frames != null && status?.sampled_frames != null
      ? `${status.processed_frames} / ${status.sampled_frames}`
      : '—'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Temporal intelligence"
        title="Video detection"
        description="Upload survey footage for sampled-frame defect detection and IoU/centroid tracking. Each track keeps its first and last timestamp and its best keyframe."
        actions={
          result ? (
            <>
              <Button variant="secondary" onClick={resetView}>
                <RefreshCw />
                New analysis
              </Button>
              <Button variant="danger" onClick={deleteJob}>
                <Trash2 />
                Delete job
              </Button>
            </>
          ) : videoId ? (
            <Button variant="danger" onClick={deleteJob}>
              <Trash2 />
              Delete job
            </Button>
          ) : (
            <Badge tone="info" dot>
              Sampled-frame tracking
            </Badge>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Input column */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <Card>
            <CardContent className="p-4">
              <div
                {...getRootProps()}
                className={`flex min-h-[210px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center transition-colors ${
                  isDragActive
                    ? 'border-primary bg-soft'
                    : 'border-line-strong bg-[#fbf9f3] hover:border-primary/50 hover:bg-[#fdf7ee]'
                }`}
              >
                <input {...getInputProps()} />
                <span className="flex size-12 items-center justify-center rounded-xl border border-primary/20 bg-soft text-primary-hover">
                  {file ? <Film className="size-6" /> : <UploadCloud className="size-6" />}
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {file ? file.name : 'Drop a survey video here'}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-secondary">
                    {file
                      ? `${formatBytes(file.size)} · ready to analyse`
                      : 'MP4, MOV, AVI, WEBM, MKV or M4V. Frames are sampled; the backend does not decode every frame.'}
                  </p>
                </div>
                {!file && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation()
                      open()
                    }}
                  >
                    Select video
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={upload} disabled={!file || isProcessing} loading={isProcessing} size="lg">
              {!isProcessing && <Video />}
              {isProcessing ? 'Processing video' : 'Analyze video'}
            </Button>
            {file && !isProcessing && (
              <Button variant="ghost" size="lg" onClick={() => setFile(null)}>
                Clear file
              </Button>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-critical/20 bg-critical-soft p-3.5 text-xs leading-relaxed text-critical">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {status && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Job progress</CardTitle>
                  <p className="mt-1 font-mono text-[10.5px] text-muted">
                    {status.video_id}
                  </p>
                </div>
                <StatusBadge status={status.status} />
              </CardHeader>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-secondary">{humanize(status.pipeline_stage)}</span>
                  <span className="font-mono font-semibold tabular text-ink">{progress}%</span>
                </div>
                <div className="mt-2">
                  <Progress value={progress} tone={status.status === 'failed' ? 'critical' : 'primary'} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                  <StatusFact label="Frames" value={framesLabel} />
                  <StatusFact label="Duration" value={formatDuration(status.duration_seconds)} />
                  <StatusFact label="FPS" value={status.fps != null ? String(status.fps) : '—'} />
                  <StatusFact label="Uploaded" value={timeAgo(status.created_at)} />
                </dl>
                {isProcessing && (
                  <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-[10.5px] text-muted">
                    <Loader2 className="size-3 animate-spin text-primary" />
                    Polling the server every 1.8 s. Progress is reported by the video job.
                  </p>
                )}
                {status.error_message && (
                  <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-critical">
                    {status.error_message}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Recent video analyses</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => void loadRecent()}>
                <RefreshCw />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="pt-3">
              {recent.length === 0 ? (
                <p className="py-3 text-center text-[11px] text-muted">
                  No stored video jobs yet. Upload footage to create the first one.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {recent.map((job) => {
                    const active = job.video_id === videoId
                    return (
                      <li key={job.video_id}>
                        <button
                          type="button"
                          onClick={() => void loadJob(job)}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition ${
                            active
                              ? 'border-primary/40 bg-soft'
                              : 'border-line bg-[#fbf9f3] hover:border-line-strong'
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium text-ink">
                              {job.original_filename}
                            </span>
                            <span className="mt-0.5 block font-mono text-[10px] text-muted">
                              {job.sampled_frames != null ? `${job.sampled_frames} frames · ` : ''}
                              {timeAgo(job.created_at)}
                            </span>
                          </span>
                          <StatusBadge status={job.status} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Result column */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          {!result ? (
            <div className="flex min-h-[420px] items-center justify-center">
              <EmptyState
                icon={isProcessing ? Loader2 : Play}
                title={isProcessing ? 'Analysis in progress' : stagesTitle(status)}
                description={
                  isProcessing
                    ? 'The job is sampling frames, detecting defects and tracking identities. Results appear here when the backend marks the job complete.'
                    : 'Upload survey footage to populate tracked defects, severity labels and keyframe evidence. Tracked identity is not a road asset register.'
                }
                className="w-full"
              />
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-4"
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Unique defects"
                  value={result.summary.unique_defects}
                  icon={Layers}
                  tone={result.summary.unique_defects > 0 ? 'primary' : 'neutral'}
                  hint={`${result.summary.filtered_candidates} of ${result.summary.raw_candidates} candidates kept`}
                />
                <StatCard
                  label="Highest severity"
                  value={result.summary.highest_severity || 'None'}
                  icon={Activity}
                  tone={
                    result.summary.highest_severity === 'CRITICAL'
                      ? 'critical'
                      : result.summary.highest_severity === 'HIGH'
                        ? 'critical'
                        : result.summary.highest_severity === 'MODERATE'
                          ? 'warning'
                          : 'success'
                  }
                  hint="Across retained tracks"
                />
                <StatCard
                  label="Frames processed"
                  value={`${result.video.processed_frames}/${result.video.sampled_frames}`}
                  icon={Gauge}
                  tone="info"
                  hint={`Every ${result.video.frame_stride}${result.video.frame_stride === 1 ? ' frame' : 'th frame'}`}
                />
                <StatCard
                  label="Footage"
                  value={formatDuration(result.video.duration_seconds)}
                  icon={Clock}
                  tone="neutral"
                  hint={`${result.video.width} × ${result.video.height} px · ${formatNumber(result.video.fps)} fps`}
                />
              </div>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Tracked defects</CardTitle>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted">
                      Identity is tracked across sampled frames. A track is not a confirmed physical asset.
                    </p>
                  </div>
                  <Badge tone="neutral">{result.tracks.length}</Badge>
                </CardHeader>
                <CardContent className="pt-4">
                  {result.tracks.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-[#fbf9f3] py-10 text-center">
                      <CheckCircle2 className="size-5 text-muted" />
                      <p className="text-xs font-medium text-ink">No tracks passed the filter</p>
                      <p className="max-w-sm text-[11px] leading-relaxed text-secondary">
                        No sampled-frame detections were retained for this video. This does not certify the
                        road as defect-free; lighting, motion blur and model readiness can suppress tracks.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {result.tracks.map((track) => (
                        <TrackCard
                          key={track.track_id}
                          track={track}
                          videoId={result.video_id}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Frame-level signals</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2.5 pt-3">
                    <SignalRow
                      icon={MapPin}
                      label="Road classification"
                      value={
                        result.pipeline.road_classification.label
                          ? `${classLabel(result.pipeline.road_classification.label)} · ${Math.round(
                              (result.pipeline.road_classification.confidence || 0) * 100
                            )}%`
                          : 'Not reported'
                      }
                    />
                    <SignalRow
                      icon={ShieldCheck}
                      label="Authenticity screen"
                      value={
                        result.pipeline.authenticity.label
                          ? `${classLabel(result.pipeline.authenticity.label)} · ${Math.round(
                              (result.pipeline.authenticity.confidence || 0) * 100
                            )}%`
                          : 'Not reported'
                      }
                    />
                    <SignalRow
                      icon={Layers}
                      label="Tracked classes"
                      value={
                        Object.entries(result.summary.by_class).length > 0
                          ? Object.entries(result.summary.by_class)
                              .map(([name, count]) => `${classLabel(name)} ${count}`)
                              .join(' · ')
                          : 'None retained'
                      }
                    />
                    <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
                      These are frame-level heuristics for this footage, not a road-wide survey.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Known limitations</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-3">
                    {result.limitations.length > 0 ? (
                      <ul className="flex flex-col gap-2 text-[11px] leading-relaxed text-secondary">
                        {result.limitations.map((line) => (
                          <li key={line} className="flex items-start gap-2">
                            <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-muted">No limitation notes were returned.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-[11px] text-muted">
        <MapPin className="size-3.5 shrink-0" />
        <span>
          Video tracking assigns identity over time, not location. PitScout never infers GPS coordinates
          from footage.
        </span>
        <span className="ml-auto font-mono">{formatDateTime(status?.completed_at)}</span>
      </div>
    </div>
  )
}

function stagesTitle(status: VideoJob | null) {
  if (!status) return 'No completed video analysis'
  if (status.status === 'failed') return 'Video analysis failed'
  return 'Waiting for results'
}

function StatusFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label-mono">{label}</dt>
      <dd className="mt-0.5 font-mono text-[11.5px] font-medium tabular text-ink">{value}</dd>
    </div>
  )
}

function SignalRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-line bg-[#fbf9f3] px-3 py-2">
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-secondary">
        <Icon className="size-3.5 text-primary" />
        {label}
      </span>
      <span className="text-right text-[11px] font-medium text-ink">{value}</span>
    </div>
  )
}

function TrackCard({ track, videoId }: { track: VideoTrack; videoId: string }) {
  const keyframe =
    track.keyframe_url || `/api/v1/videos/${videoId}/keyframes/${track.track_id}`

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="relative h-32 bg-[#1e1f1b]">
        <img
          src={keyframe}
          alt={`Keyframe for track ${track.track_id}`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute left-2 top-2">
          <Badge tone="graphite" className="backdrop-blur">
            Track #{track.track_id}
          </Badge>
        </div>
        <div className="absolute right-2 top-2">
          <SeverityBadge level={track.severity.level} />
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-semibold capitalize text-ink">
            {classLabel(track.class)}
          </p>
          <span className="shrink-0 font-mono text-[10px] text-muted">
            {track.severity.score}/100
          </span>
        </div>
        <div className="mt-1.5 flex flex-col gap-1 font-mono text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {track.first_timestamp_s}s → {track.last_timestamp_s}s · {track.frames_seen} hits
          </span>
          <span>
            best {Math.round(track.best_confidence * 100)}% · mean{' '}
            {Math.round(track.mean_confidence * 100)}%
          </span>
        </div>
        {track.primary_cause && (
          <p className="mt-2 border-t border-line pt-2 text-[10.5px] leading-relaxed text-secondary">
            Hypothesis: {classLabel(track.primary_cause)}
          </p>
        )}
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
          Priority: {humanize(track.severity.priority)}
        </p>
      </div>
    </div>
  )
}
