'use client'

import React from 'react'
import {
  Ruler,
  HelpCircle,
  Wrench,
  CheckCircle2,
  Info,
  Layers,
  Flame,
  X,
  ScanLine,
} from 'lucide-react'
import { SeverityBadge, Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { classLabel } from '@/lib/format'

interface DamageDetailPanelProps {
  detection: any
  onClose?: () => void
}

export const DamageDetailPanel: React.FC<DamageDetailPanelProps> = ({ detection, onClose }) => {
  if (!detection) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-card border border-dashed border-line bg-card p-6 text-center">
        <span className="mb-3 flex size-11 items-center justify-center rounded-xl border border-line bg-[#fbf9f3] text-muted">
          <Layers className="size-5" />
        </span>
        <h3 className="font-display text-sm font-semibold text-ink">No defect selected</h3>
        <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-secondary">
          Select a bounding box on the image or a defect from the list to inspect its measurements,
          severity evidence and recommended actions.
        </p>
      </div>
    )
  }

  const bbox = detection.bbox
  const x1 = Array.isArray(bbox) ? bbox[0] : (bbox?.x1 ?? 0)
  const y1 = Array.isArray(bbox) ? bbox[1] : (bbox?.y1 ?? 0)
  const x2 = Array.isArray(bbox) ? bbox[2] : (bbox?.x2 ?? 0)
  const y2 = Array.isArray(bbox) ? bbox[3] : (bbox?.y2 ?? 0)
  const calcW = Math.max(1, Math.abs(x2 - x1))
  const calcH = Math.max(1, Math.abs(y2 - y1))

  const widthPixels = detection.measurements?.width_pixels || calcW
  const heightPixels = detection.measurements?.height_pixels || calcH
  const areaPixels = detection.measurements?.area_pixels || widthPixels * heightPixels
  const relativeArea = detection.measurements?.relative_area || areaPixels / (1280 * 720)

  const causesList: any[] = detection.probable_causes || detection.possible_causes || []
  const actions: string[] = detection.recommended_actions || []
  const factors: any[] = detection.severity?.factors || []
  const score = typeof detection.severity?.score === 'number' ? detection.severity.score : null
  const level = detection.severity?.level || detection.severity || 'UNKNOWN'

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-line bg-card shadow-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 pt-5 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-primary-hover">
              {detection.detection_id || 'DEF-01'}
            </span>
            <SeverityBadge level={String(level)} />
          </div>
          <h3 className="mt-1.5 font-display text-lg font-semibold capitalize leading-tight text-ink">
            {detection.class_name ? classLabel(detection.class_name) : 'Detected defect'}
          </h3>
        </div>
        {onClose ? (
          <Button variant="ghost" size="iconSm" onClick={onClose} aria-label="Close details">
            <X />
          </Button>
        ) : (
          <div className="shrink-0 text-right">
            <span className="label-mono block">Confidence</span>
            <span className="font-mono text-sm font-semibold tabular text-ink">
              {((detection.confidence || 0) * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 p-5">
        {/* Severity evidence */}
        <section className="rounded-xl border border-line bg-[#fbf9f3] p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-graphite">
              <Flame className="size-4 text-primary" />
              Severity evidence
            </span>
            <span className="font-mono text-xs font-semibold tabular text-ink">
              {score != null ? `${score} / 100` : 'Not scored'}
            </span>
          </div>
          <div className="mt-2.5">
            <Progress
              value={score ?? 0}
              tone={level === 'CRITICAL' || level === 'HIGH' ? 'critical' : level === 'MODERATE' ? 'warning' : 'success'}
              height="md"
            />
          </div>
          {factors.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {factors.map((factor: any, idx: number) => (
                <span
                  key={idx}
                  className="rounded border border-line bg-card px-2 py-0.5 font-mono text-[10px] text-secondary"
                >
                  {typeof factor === 'string'
                    ? factor
                    : typeof factor.contribution === 'number'
                      ? `${factor.name || 'factor'} +${Math.round(factor.contribution)} pts`
                      : factor.name || 'factor'}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              No explicit scoring factors were returned with this detection.
            </p>
          )}
        </section>

        {/* Measurements */}
        <section className="rounded-xl border border-line p-4">
          <div className="flex items-center gap-1.5 border-b border-line pb-2 text-xs font-semibold text-graphite">
            <Ruler className="size-3.5 text-info" />
            Geometric measurements
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
            <Measure label="Width" value={`${Math.round(widthPixels)} px`} />
            <Measure label="Height" value={`${Math.round(heightPixels)} px`} />
            <Measure label="Box area" value={`${Math.round(areaPixels).toLocaleString()} px²`} />
            <Measure label="Relative area" value={`${(relativeArea * 100).toFixed(2)}%`} tone="info" />
          </dl>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/20 bg-warning-soft p-2.5 text-[11px] leading-relaxed text-warning">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {detection.measurements?.limitation ||
                'Physical units (cm / m) require camera calibration or an on-road metric reference. Pixel measurements are not a substitute for a field measurement.'}
            </span>
          </div>
        </section>

        {/* Cause hypotheses */}
        <section className="rounded-xl border border-line p-4">
          <div className="flex items-center gap-1.5 border-b border-line pb-2 text-xs font-semibold text-graphite">
            <HelpCircle className="size-3.5 text-info" />
            Contributing cause hypotheses
          </div>
          <div className="mt-2.5 flex flex-col gap-2">
            {causesList.length > 0 ? (
              causesList.map((cause: any, idx: number) => (
                <div key={idx} className="rounded-lg border border-line bg-[#fbf9f3] p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium capitalize text-ink">
                      {typeof cause === 'string' ? cause.replace(/_/g, ' ') : cause.cause || 'Cause'}
                    </span>
                    {typeof cause === 'object' && typeof cause.confidence === 'number' && (
                      <span className="font-mono text-[10px] text-info">
                        {Math.round(cause.confidence * 100)}% conf
                      </span>
                    )}
                    {typeof cause === 'object' && cause.likelihood && (
                      <span className="font-mono text-[10px] uppercase text-info">{cause.likelihood}</span>
                    )}
                  </div>
                  {typeof cause === 'object' && cause.recommended_inspection && (
                    <p className="mt-1 text-[11px] leading-relaxed text-secondary">
                      Check: {cause.recommended_inspection}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <p className="text-[11px] leading-relaxed text-muted">
                No cause hypotheses were returned for this detection. This is a diagnostic aid, not a
                structural assessment.
              </p>
            )}
          </div>
        </section>

        {/* Recommended actions */}
        <section className="rounded-xl border border-line p-4">
          <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-graphite">
              <Wrench className="size-3.5 text-primary" />
              Recommended actions
            </span>
            <Badge tone="neutral">{actions.length}</Badge>
          </div>
          <ul className="mt-2.5 flex flex-col gap-2 text-xs text-graphite">
            {actions.length > 0 ? (
              actions.map((action, idx) => (
                <li key={idx} className="flex items-start gap-2 leading-relaxed">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                  <span>{action}</span>
                </li>
              ))
            ) : (
              <li className="text-[11px] leading-relaxed text-muted">
                No remediation actions were generated for this detection.
              </li>
            )}
          </ul>
        </section>

        <p className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-muted">
          <ScanLine className="mt-0.5 size-3 shrink-0" />
          Automated assessment. Verify on site before scheduling physical repairs.
        </p>
      </div>
    </div>
  )
}

function Measure({ label, value, tone }: { label: string; value: string; tone?: 'info' }) {
  return (
    <div>
      <dt className="label-mono mb-0.5">{label}</dt>
      <dd className={`font-mono text-[13px] font-semibold tabular ${tone === 'info' ? 'text-info' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  )
}
