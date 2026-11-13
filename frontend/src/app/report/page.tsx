'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useDropzone } from 'react-dropzone'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Crosshair,
  ExternalLink,
  Image as ImageIcon,
  Info,
  Layers,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  ShieldQuestion,
  UploadCloud,
  X,
} from 'lucide-react'
import {
  PageHeader,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  SeverityBadge,
  StatusBadge,
  DecisionBadge,
  Progress,
  Field,
  Input,
  Textarea,
  SectionLabel,
  EmptyState,
  useToast,
} from '@/components/ui'
import type { PotholeReport } from '@/types/pitscout'
import { clientApi } from '@/lib/client-api'
import { classLabel, coordinate, formatDateTime, formatPercent } from '@/lib/format'

const DECISION_COPY: Record<string, { title: string; body: string; tone: 'success' | 'warning' | 'info' | 'neutral' }> = {
  MATCH: {
    title: 'Linked to an existing canonical pothole',
    body: 'The duplicate engine found an existing record whose visual and shape signals cleared the policy thresholds. This report stays preserved and is linked to that record.',
    tone: 'success',
  },
  UNCERTAIN: {
    title: 'Uncertain — human review required',
    body: 'The signals were not strong enough to confirm a duplicate. This report is queued for review and is not attached to any canonical record until a person confirms it.',
    tone: 'warning',
  },
  NO_MATCH: {
    title: 'No duplicate found',
    body: 'No nearby record cleared the visual and shape thresholds. This submission is preserved as its own report.',
    tone: 'info',
  },
  SKIPPED: {
    title: 'Duplicate matching did not run',
    body: 'The report was stored, but the duplicate engine recorded no decision. Review it in the duplicate centre before treating it as unique.',
    tone: 'neutral',
  },
}

function errorMessage(err: any, fallback: string) {
  const detail = err?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') return detail.detail || detail.error || fallback
  return err?.message || fallback
}

function parseNumber(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export default function ReportPotholePage() {
  const { toast } = useToast()
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
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<PotholeReport | null>(null)
  const [relocateAccuracy, setRelocateAccuracy] = useState('')
  const [relocateBusy, setRelocateBusy] = useState(false)
  const previewRef = useRef<string | null>(null)

  useEffect(() => {
    setIdempotencyKey(
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `report-${Date.now()}-${Math.random().toString(16).slice(2)}`
    )
  }, [file])

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, [])

  const selectFile = useCallback((selected: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    const nextPreview = selected ? URL.createObjectURL(selected) : null
    previewRef.current = nextPreview
    setPreviewUrl(nextPreview)
    setFile(selected)
    setReport(null)
    setError(null)
    setUploadProgress(0)
  }, [])

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) selectFile(accepted[0])
    },
    [selectFile]
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    onDropRejected: (rejections) => {
      const reason = rejections[0]?.errors?.[0]?.code
      setError(
        reason === 'file-too-large'
          ? 'That image is larger than 50 MB. Resize it and try again.'
          : reason === 'file-invalid-type'
            ? 'Unsupported file type. Use JPEG, PNG, WEBP or BMP.'
            : 'The image could not be accepted. Check the file and try again.'
      )
    },
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.bmp'] },
    maxSize: 50 * 1024 * 1024,
    multiple: false,
    noClick: Boolean(previewUrl),
    noDrag: Boolean(previewUrl),
  })

  const captureLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsState('unavailable')
      setGpsMessage(
        'This browser does not expose the Geolocation API. The report will stay pending location verification until coordinates are added.'
      )
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
            : 'Location captured in-browser. The device did not report an accuracy radius.'
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

  const clearLocation = () => {
    setLatitude('')
    setLongitude('')
    setAccuracy('')
    setGpsState('unknown')
    setGpsMessage(null)
  }

  const validateCoordinates = () => {
    const lat = parseNumber(latitude)
    const lon = parseNumber(longitude)
    const acc = parseNumber(accuracy)
    if ((lat == null) !== (lon == null)) {
      return 'Enter both latitude and longitude, or leave both blank to keep the report pending location verification.'
    }
    if (lat != null && (lat < -90 || lat > 90)) return 'Latitude must be between -90 and 90.'
    if (lon != null && (lon < -180 || lon > 180)) return 'Longitude must be between -180 and 180.'
    if (acc != null && acc < 0) return 'Accuracy must be a positive number of metres.'
    return null
  }

  const submit = async () => {
    if (!file) {
      setError('Select a photo of the pothole first.')
      return
    }
    const coordinateError = validateCoordinates()
    if (coordinateError) {
      setError(coordinateError)
      return
    }
    setIsSubmitting(true)
    setUploadProgress(0)
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

      const result = await clientApi.submitReport(formData, idempotencyKey, setUploadProgress)
      setReport(result)
      toast({
        tone: result.location.status === 'verified' ? 'success' : 'info',
        title: result.idempotent_replay ? 'Original report returned' : 'Report stored',
        description:
          result.location.status === 'verified'
            ? 'Coordinates were accepted and the duplicate decision is ready.'
            : 'No verified coordinates were supplied, so the report stays pending location verification.',
      })
    } catch (err: any) {
      setError(errorMessage(err, 'Report submission failed.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const relocate = async () => {
    if (!report) return
    const lat = parseNumber(latitude)
    const lon = parseNumber(longitude)
    const acc = parseNumber(relocateAccuracy)
    if (lat == null || lon == null) {
      setError('Enter a latitude and longitude before saving a corrected location.')
      return
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setError('Latitude must be within ±90 and longitude within ±180.')
      return
    }
    setRelocateBusy(true)
    setError(null)
    try {
      const updated = await clientApi.relocateReport(report.report_id, {
        latitude: lat,
        longitude: lon,
        accuracy_m: acc != null && acc >= 0 ? acc : null,
      })
      setReport(updated)
      toast({
        tone: 'success',
        title: 'Location updated',
        description: 'The corrected coordinates were accepted for this report.',
      })
    } catch (err: any) {
      setError(errorMessage(err, 'Location update failed.'))
    } finally {
      setRelocateBusy(false)
    }
  }

  const copyReportId = async () => {
    if (!report) return
    try {
      await navigator.clipboard?.writeText(report.report_id)
      toast({ tone: 'success', title: 'Report ID copied' })
    } catch {
      toast({ tone: 'error', title: 'Clipboard unavailable', description: 'Select the ID manually and copy it.' })
    }
  }

  const resetForm = () => {
    selectFile(null)
    setDescription('')
    setReporterId('')
    clearLocation()
    setRelocateAccuracy('')
    setReport(null)
    setError(null)
  }

  const lat = parseNumber(latitude)
  const lon = parseNumber(longitude)
  const acc = parseNumber(accuracy)
  const hasCoordinates = lat != null && lon != null
  const decision = (report?.match.decision || 'SKIPPED').toUpperCase()
  const decisionCopy = DECISION_COPY[decision] || DECISION_COPY.SKIPPED
  const audit = report?.match.signals || null
  const metrics = audit?.signals || null
  const policy = audit?.policy || null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Field capture"
        title="Report a pothole"
        description="Submit photographic evidence from the road. Coordinates come only from your device or explicit manual entry — if neither is available the report stays pending location verification."
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link href="/duplicates">
                Duplicate centre
                <ArrowRight />
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/reports">
                Submission log
                <ArrowRight />
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-7">
          <Card>
            <CardHeader>
              <div>
                <SectionLabel>01 · Evidence</SectionLabel>
                <CardTitle className="mt-1.5">Photograph the defect</CardTitle>
                <CardDescription>
                  One image per report. The original file, its dimensions and its SHA-256 hash are preserved.
                </CardDescription>
              </div>
              <Badge tone={file ? 'success' : 'neutral'} dot>
                {file ? 'Photo ready' : 'No photo'}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {previewUrl ? (
                <div className="overflow-hidden rounded-panel border border-line bg-[#fbf9f3]">
                  <img src={previewUrl} alt="Pothole evidence preview" className="max-h-[320px] w-full object-contain" />
                  <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-ink">{file?.name}</p>
                      <p className="font-mono text-[10.5px] text-muted">
                        {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button variant="secondary" size="sm" onClick={open}>
                        <RefreshCw />
                        Replace
                      </Button>
                      <Button variant="ghost" size="iconSm" onClick={() => selectFile(null)} aria-label="Remove photo">
                        <X />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  {...getRootProps()}
                  className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-panel border-2 border-dashed px-6 py-10 text-center transition-colors ${
                    isDragActive
                      ? 'border-primary/60 bg-soft'
                      : 'border-line bg-[#fbf9f3] hover:border-primary/40 hover:bg-[#fdf8f0]'
                  }`}
                >
                  <input {...getInputProps()} />
                  <span className="flex size-12 items-center justify-center rounded-xl border border-line bg-card text-primary shadow-[0_1px_2px_rgba(37,39,32,0.05)]">
                    <UploadCloud className="size-5" />
                  </span>
                  <div>
                    <p className="font-display text-sm font-semibold text-ink">
                      {isDragActive ? 'Drop the photo here' : 'Drag a photo here, or browse'}
                    </p>
                    <p className="mt-1 text-[11.5px] text-muted">JPEG, PNG, WEBP or BMP · up to 50 MB</p>
                  </div>
                </div>
              )}

              <Field
                label="Description (optional)"
                htmlFor="report-description"
                hint="Lane, direction, approximate size and nearby landmarks. Do not guess what the detector will find."
              >
                <Textarea
                  id="report-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="Right-hand lane heading north, roughly 40 cm wide, beside the school gate."
                />
              </Field>

              <Field label="Reporter ID (optional)" htmlFor="report-reporter" hint="Free-text identifier; no account is created.">
                <Input
                  id="report-reporter"
                  value={reporterId}
                  onChange={(event) => setReporterId(event.target.value)}
                  maxLength={64}
                  placeholder="surveyor-07"
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <SectionLabel>02 · Location</SectionLabel>
                <CardTitle className="mt-1.5">Attach coordinates you actually have</CardTitle>
                <CardDescription>
                  Use the device GPS, type surveyed coordinates, or leave this blank. A blank location is stored as{' '}
                  <span className="font-medium text-graphite">pending location verification</span>.
                </CardDescription>
              </div>
              <Badge tone={hasCoordinates ? 'success' : 'warning'} dot>
                {hasCoordinates ? 'Coordinates ready' : 'Pending location'}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="soft" onClick={captureLocation} disabled={gpsState === 'acquiring'}>
                  {gpsState === 'acquiring' ? <Loader2 className="animate-spin" /> : <Crosshair />}
                  {gpsState === 'acquiring' ? 'Requesting device GPS…' : 'Use device GPS'}
                </Button>
                {(latitude || longitude || accuracy) && (
                  <Button variant="ghost" onClick={clearLocation}>
                    Clear coordinates
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Latitude" htmlFor="report-latitude">
                  <Input
                    id="report-latitude"
                    value={latitude}
                    onChange={(event) => setLatitude(event.target.value)}
                    inputMode="decimal"
                    placeholder="—"
                    className="font-mono"
                  />
                </Field>
                <Field label="Longitude" htmlFor="report-longitude">
                  <Input
                    id="report-longitude"
                    value={longitude}
                    onChange={(event) => setLongitude(event.target.value)}
                    inputMode="decimal"
                    placeholder="—"
                    className="font-mono"
                  />
                </Field>
                <Field label="Accuracy (m)" htmlFor="report-accuracy">
                  <Input
                    id="report-accuracy"
                    value={accuracy}
                    onChange={(event) => setAccuracy(event.target.value)}
                    inputMode="decimal"
                    placeholder="—"
                    className="font-mono"
                  />
                </Field>
              </div>

              <div
                className={`rounded-xl border p-3 text-[11.5px] leading-relaxed ${
                  hasCoordinates
                    ? 'border-success/20 bg-success-soft text-success'
                    : 'border-warning/25 bg-warning-soft text-warning'
                }`}
              >
                <div className="flex items-start gap-2">
                  {hasCoordinates ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
                  <div>
                    <p className="font-semibold">
                      {hasCoordinates ? coordinate(lat, lon) : 'No coordinates will be attached'}
                    </p>
                    <p className="mt-0.5 opacity-90">
                      {hasCoordinates
                        ? acc != null
                          ? `Accuracy from this source: ±${acc} m.`
                          : 'No accuracy radius was supplied for these coordinates.'
                        : 'The server does not infer a location from the photo. You can add coordinates later from this screen.'}
                    </p>
                  </div>
                </div>
              </div>

              {gpsMessage && (
                <div
                  className={`flex items-start gap-2 rounded-xl border p-3 text-[11.5px] leading-relaxed ${
                    gpsState === 'acquired'
                      ? 'border-success/20 bg-success-soft text-success'
                      : 'border-warning/25 bg-warning-soft text-warning'
                  }`}
                >
                  {gpsState === 'acquired' ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  )}
                  <span>{gpsMessage}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-[#fbf9f3] text-muted">
                  <MapPin className="size-4" />
                </span>
                <div className="min-w-0">
                  <SectionLabel>03 · Submit</SectionLabel>
                  <p className="mt-1 text-[12px] leading-relaxed text-secondary">
                    The submission is protected by a per-photo idempotency key. Retrying after a network error returns the
                    original report instead of creating a duplicate.
                  </p>
                  <p className="mt-2 truncate font-mono text-[10.5px] text-muted">
                    key: {idempotencyKey || 'generating…'}
                  </p>
                </div>
              </div>

              <Button className="w-full" size="lg" onClick={submit} loading={isSubmitting} disabled={!file}>
                {isSubmitting ? 'Storing report…' : 'Submit pothole report'}
                {!isSubmitting && <ArrowRight />}
              </Button>

              {isSubmitting && (
                <Progress value={uploadProgress} label="Upload progress" height="sm" />
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-critical/20 bg-critical-soft p-3.5 text-[11.5px] leading-relaxed text-critical">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-start gap-2 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
                <ShieldQuestion className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Submitting does not verify the defect on site, merge records, or change a canonical status. Those are
                  separate, reviewable decisions.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-5 lg:col-span-5">
          {!report ? (
            <>
              <Card>
                <CardHeader>
                  <div>
                    <SectionLabel>Pipeline</SectionLabel>
                    <CardTitle className="mt-1.5">What happens after you submit</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    {
                      icon: ImageIcon,
                      title: 'Evidence is preserved',
                      body: 'The original image is stored with its SHA-256 hash and pixel dimensions, then the detector reads it.',
                    },
                    {
                      icon: Layers,
                      title: 'Duplicate decision is audited',
                      body: 'Distance, visual similarity and shape similarity are scored against nearby canonical records. Proximity alone never merges anything.',
                    },
                    {
                      icon: MapPin,
                      title: 'Location status is reported honestly',
                      body: 'Verified coordinates are kept. Missing coordinates leave the report pending, never silently filled in.',
                    },
                  ].map((step, index) => {
                    const Icon = step.icon
                    return (
                      <div key={step.title} className="flex gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-[#fbf9f3] font-mono text-[10px] text-muted">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                            <Icon className="size-3.5 text-primary" />
                            {step.title}
                          </p>
                          <p className="mt-0.5 text-[11.5px] leading-relaxed text-secondary">{step.body}</p>
                        </div>
                      </div>
                    )
                  })}
                  <div className="rounded-xl border border-line bg-[#fbf9f3] p-3 text-[11px] leading-relaxed text-secondary">
                    <span className="font-semibold text-graphite">Policy reminders.</span> MATCH requires a combined score
                    above the policy threshold and a visual score above the minimum. UNCERTAIN is routed to human review and
                    is never presented as a confirmed duplicate.
                  </div>
                </CardContent>
              </Card>

              <EmptyState
                icon={ShieldQuestion}
                title="No report submitted yet"
                description="After submission this panel shows the report ID, detector output, the duplicate decision with its signals, and the location verification state."
              />
            </>
          ) : (
            <>
              <Card className="overflow-hidden">
                <div className="flex items-start justify-between gap-3 border-b border-line bg-success-soft px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                      <CheckCircle2 className="size-5" />
                    </span>
                    <div>
                      <p className="font-display text-[15px] font-semibold text-ink">
                        {report.idempotent_replay ? 'Original report returned' : 'Report stored'}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-secondary">
                        {formatDateTime(report.created_at)} · {report.idempotent_replay ? 'idempotent replay' : 'new submission'}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={report.status} />
                </div>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <SectionLabel>Report ID</SectionLabel>
                      <p className="mt-1 break-all font-mono text-[13px] text-ink">{report.report_id}</p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={copyReportId}>
                      <Copy />
                      Copy
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-lg border border-line bg-[#fbf9f3] p-2.5">
                      <p className="label-mono text-[9px]">Canonical pothole</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-ink">{report.pothole_id || 'Not linked'}</p>
                    </div>
                    <div className="rounded-lg border border-line bg-[#fbf9f3] p-2.5">
                      <p className="label-mono text-[9px]">Detected class</p>
                      <p className="mt-1 text-[11.5px] font-medium text-ink">
                        {report.detection.class ? classLabel(report.detection.class) : 'Not detected'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-line bg-[#fbf9f3] p-2.5">
                      <p className="label-mono text-[9px]">Confidence</p>
                      <p className="mt-1 font-mono text-[11.5px] text-ink">
                        {report.detection.confidence != null ? formatPercent(report.detection.confidence, 1) : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-line bg-[#fbf9f3] p-2.5">
                      <p className="label-mono text-[9px]">Severity</p>
                      <div className="mt-1">
                        <SeverityBadge level={report.detection.severity} />
                      </div>
                    </div>
                  </div>

                  {report.idempotent_replay && (
                    <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info-soft p-2.5 text-[11px] leading-relaxed text-info">
                      <Info className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        This submission reused an existing idempotency key, so the original report was returned rather than
                        creating a second record.
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" asChild>
                      <Link href={`/duplicates?focus=${encodeURIComponent(report.report_id)}`}>
                        Duplicate centre
                        <ExternalLink />
                      </Link>
                    </Button>
                    {report.pothole_id && (
                      <Button variant="secondary" size="sm" asChild>
                        <Link href={`/map?focus=${encodeURIComponent(report.pothole_id)}`}>
                          Canonical record
                          <ExternalLink />
                        </Link>
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={resetForm}>
                      File another report
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card
                className={
                  decisionCopy.tone === 'success'
                    ? 'border-success/25'
                    : decisionCopy.tone === 'warning'
                      ? 'border-warning/30'
                      : decisionCopy.tone === 'info'
                        ? 'border-info/25'
                        : undefined
                }
              >
                <CardHeader>
                  <div>
                    <SectionLabel>Duplicate decision</SectionLabel>
                    <CardTitle className="mt-1.5 flex items-center gap-2">
                      <DecisionBadge decision={decision} />
                      {report.match.score != null && (
                        <span className="font-mono text-[11px] font-normal text-muted">
                          score {report.match.score.toFixed(3)}
                        </span>
                      )}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div
                    className={`rounded-xl border p-3 text-[11.5px] leading-relaxed ${
                      decisionCopy.tone === 'success'
                        ? 'border-success/20 bg-success-soft text-success'
                        : decisionCopy.tone === 'warning'
                          ? 'border-warning/25 bg-warning-soft text-warning'
                          : decisionCopy.tone === 'info'
                            ? 'border-info/20 bg-info-soft text-info'
                            : 'border-line bg-[#fbf9f3] text-secondary'
                    }`}
                  >
                    <p className="font-semibold">{decisionCopy.title}</p>
                    <p className="mt-1 opacity-90">{decisionCopy.body}</p>
                    {report.match.reason && <p className="mt-2 opacity-90">Engine note: {report.match.reason}</p>}
                  </div>

                  {metrics ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: 'Distance', value: metrics.distance_m, suffix: ' m' },
                          { label: 'Search radius', value: metrics.radius_m, suffix: ' m' },
                          { label: 'Visual', value: metrics.visual_similarity, percent: true },
                          { label: 'Shape', value: metrics.shape_similarity, percent: true },
                        ].map((row) => (
                          <div key={row.label} className="rounded-lg border border-line bg-[#fbf9f3] p-2.5">
                            <p className="label-mono text-[9px]">{row.label}</p>
                            <p className="mt-1 font-mono text-[12px] text-ink">
                              {row.value == null
                                ? '—'
                                : row.percent
                                  ? formatPercent(row.value, 1)
                                  : `${row.value}${row.suffix || ''}`}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-[11px]">
                          <span className="text-secondary">Combined score</span>
                          <span className="font-mono text-ink">{formatPercent(metrics.combined_score, 3)}</span>
                        </div>
                        <Progress
                          value={(metrics.combined_score || 0) * 100}
                          tone={decision === 'MATCH' ? 'success' : decision === 'UNCERTAIN' ? 'warning' : 'info'}
                          height="sm"
                        />
                        {policy && (
                          <p className="mt-1.5 font-mono text-[10px] text-muted">
                            thresholds · match ≥ {formatPercent(policy.match_threshold, 2)} · review ≥{' '}
                            {formatPercent(policy.review_threshold, 2)} · visual ≥{' '}
                            {formatPercent(policy.min_visual_similarity, 2)}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11.5px] leading-relaxed text-muted">
                      No signal breakdown was recorded for this report. The decision above is shown exactly as returned, with
                      no reconstructed scores.
                    </p>
                  )}

                  <p className="border-t border-line pt-3 text-[10.5px] leading-relaxed text-muted">
                    This screen never merges records. A MATCH links the report to an existing canonical record; an UNCERTAIN
                    report waits for a person in the duplicate centre.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <SectionLabel>Location</SectionLabel>
                    <CardTitle className="mt-1.5 flex items-center gap-2">
                      <Navigation className="size-4 text-primary" />
                      {report.location.status.replace(/_/g, ' ')}
                    </CardTitle>
                  </div>
                  <Badge tone={report.location.status === 'verified' ? 'success' : 'warning'} dot>
                    {report.location.status === 'verified' ? 'Verified' : 'Pending verification'}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-line bg-[#fbf9f3] p-2.5">
                      <p className="label-mono text-[9px]">Latitude</p>
                      <p className="mt-1 font-mono text-[11px] text-ink">{report.location.latitude ?? '—'}</p>
                    </div>
                    <div className="rounded-lg border border-line bg-[#fbf9f3] p-2.5">
                      <p className="label-mono text-[9px]">Longitude</p>
                      <p className="mt-1 font-mono text-[11px] text-ink">{report.location.longitude ?? '—'}</p>
                    </div>
                    <div className="rounded-lg border border-line bg-[#fbf9f3] p-2.5">
                      <p className="label-mono text-[9px]">Accuracy</p>
                      <p className="mt-1 font-mono text-[11px] text-ink">
                        {report.location.accuracy_m != null ? `±${report.location.accuracy_m} m` : '—'}
                      </p>
                    </div>
                  </div>

                  {report.location.note && (
                    <p className="text-[11.5px] leading-relaxed text-secondary">{report.location.note}</p>
                  )}

                  {report.location.status !== 'verified' && !report.pothole_id ? (
                    <div className="space-y-3 border-t border-line pt-3">
                      <div>
                        <p className="text-[12.5px] font-semibold text-ink">Attach verified coordinates</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                          Enter coordinates you have confirmed. Saving them updates this report only.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <Field label="Latitude" htmlFor="relocate-latitude">
                          <Input
                            id="relocate-latitude"
                            value={latitude}
                            onChange={(event) => setLatitude(event.target.value)}
                            inputMode="decimal"
                            placeholder="—"
                            className="font-mono"
                          />
                        </Field>
                        <Field label="Longitude" htmlFor="relocate-longitude">
                          <Input
                            id="relocate-longitude"
                            value={longitude}
                            onChange={(event) => setLongitude(event.target.value)}
                            inputMode="decimal"
                            placeholder="—"
                            className="font-mono"
                          />
                        </Field>
                        <Field label="Accuracy (m)" htmlFor="relocate-accuracy">
                          <Input
                            id="relocate-accuracy"
                            value={relocateAccuracy}
                            onChange={(event) => setRelocateAccuracy(event.target.value)}
                            inputMode="decimal"
                            placeholder="—"
                            className="font-mono"
                          />
                        </Field>
                      </div>
                      <Button variant="secondary" size="sm" onClick={relocate} loading={relocateBusy}>
                        <Navigation />
                        Save corrected location
                      </Button>
                    </div>
                  ) : (
                    <p className="border-t border-line pt-3 text-[10.5px] leading-relaxed text-muted">
                      {report.pothole_id
                        ? 'This report is linked to a canonical record; its coordinates are managed with that record.'
                        : 'These coordinates are already verified for this report.'}
                    </p>
                  )}
                </CardContent>
              </Card>

              {report.evidence.length > 0 && (
                <Card>
                  <CardHeader>
                    <div>
                      <SectionLabel>Preserved evidence</SectionLabel>
                      <CardTitle className="mt-1.5">Original submission</CardTitle>
                    </div>
                    <Badge tone="neutral">{report.evidence.length} file{report.evidence.length === 1 ? '' : 's'}</Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {report.evidence.map((evidence) => (
                        <div key={evidence.evidence_id} className="overflow-hidden rounded-xl border border-line bg-[#fbf9f3]">
                          <img
                            src={evidence.url}
                            alt="Preserved report evidence"
                            className="h-40 w-full object-cover"
                          />
                          <div className="space-y-0.5 border-t border-line p-2.5 font-mono text-[10px] text-muted">
                            <p>
                              {evidence.width ?? '—'} × {evidence.height ?? '—'} px
                            </p>
                            <p className="truncate" title={evidence.sha256}>
                              sha256: {evidence.sha256}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
