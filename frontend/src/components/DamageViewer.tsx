'use client'

import * as React from 'react'
import {
  Eye,
  EyeOff,
  ImageOff,
  Layers,
  Maximize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider'
import { cn } from '@/lib/utils'
import { Segmented } from '@/components/ui'

interface BoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface ViewerDetection {
  detection_id: string
  class_name: string
  confidence: number
  bbox: BoundingBox
  severity?: { level?: string; score?: number | null }
  [key: string]: unknown
}

interface DamageViewerProps {
  originalImageUrl: string
  annotatedImageUrl?: string | null
  imageWidth: number
  imageHeight: number
  detections: ViewerDetection[]
  selectedDetectionId?: string | null
  onSelectDetection?: (id: string | null) => void
}

const CLASS_STYLES: Record<string, { stroke: string; fill: string; text: string }> = {
  pothole: { stroke: '#D94343', fill: 'rgba(217, 67, 67, 0.28)', text: '#F6C6C6' },
  D40: { stroke: '#D94343', fill: 'rgba(217, 67, 67, 0.28)', text: '#F6C6C6' },
  alligator_crack: { stroke: '#F08A42', fill: 'rgba(240, 138, 66, 0.24)', text: '#FBD8BD' },
  D20: { stroke: '#F08A42', fill: 'rgba(240, 138, 66, 0.24)', text: '#FBD8BD' },
  longitudinal_crack: { stroke: '#5FA8E8', fill: 'rgba(95, 168, 232, 0.22)', text: '#BFE0FF' },
  D00: { stroke: '#5FA8E8', fill: 'rgba(95, 168, 232, 0.22)', text: '#BFE0FF' },
  transverse_crack: { stroke: '#E8C15A', fill: 'rgba(232, 193, 90, 0.22)', text: '#F7E8B8' },
  D10: { stroke: '#E8C15A', fill: 'rgba(232, 193, 90, 0.22)', text: '#F7E8B8' },
  manhole_cover: { stroke: '#A78BFA', fill: 'rgba(167, 139, 250, 0.22)', text: '#DDD3FF' },
  sewage_hole: { stroke: '#E879A6', fill: 'rgba(232, 121, 166, 0.22)', text: '#F8C9DD' },
}

function styleFor(className: string) {
  const key = Object.keys(CLASS_STYLES).find(
    (candidate) =>
      candidate.toLowerCase() === className.toLowerCase() ||
      className.toLowerCase().includes(candidate.toLowerCase())
  )
  if (key) return CLASS_STYLES[key]
  return { stroke: '#F08A42', fill: 'rgba(240, 138, 66, 0.2)', text: '#FBD8BD' }
}

export function DamageViewer({
  originalImageUrl,
  annotatedImageUrl,
  imageWidth,
  imageHeight,
  detections,
  selectedDetectionId,
  onSelectDetection,
}: DamageViewerProps) {
  const [mode, setMode] = React.useState<'overlay' | 'compare'>('overlay')
  const [showBoxes, setShowBoxes] = React.useState(true)
  const [showLabels, setShowLabels] = React.useState(true)
  const [zoom, setZoom] = React.useState(1)
  const [hiddenClasses, setHiddenClasses] = React.useState<Record<string, boolean>>({})
  const [imageFailed, setImageFailed] = React.useState(false)

  React.useEffect(() => {
    setImageFailed(false)
    setZoom(1)
  }, [originalImageUrl])

  const classes = React.useMemo(() => {
    const map = new Map<string, { count: number; style: ReturnType<typeof styleFor> }>()
    detections.forEach((detection) => {
      const entry = map.get(detection.class_name) || { count: 0, style: styleFor(detection.class_name) }
      entry.count += 1
      map.set(detection.class_name, entry)
    })
    return Array.from(map.entries())
  }, [detections])

  return (
    <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'overlay', label: 'Interactive overlay' },
            ...(annotatedImageUrl ? [{ value: 'compare' as const, label: 'Compare slider' }] : []),
          ]}
        />
        <div className="flex items-center gap-1">
          {mode === 'overlay' && (
            <>
              <button
                onClick={() => setShowBoxes((current) => !current)}
                className={cn(
                  'flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] font-medium transition',
                  showBoxes ? 'border-primary/25 bg-soft text-primary-hover' : 'border-line bg-card text-muted'
                )}
              >
                {showBoxes ? <Eye className="size-3" /> : <EyeOff className="size-3" />} Boxes
              </button>
              <button
                onClick={() => setShowLabels((current) => !current)}
                className={cn(
                  'flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] font-medium transition',
                  showLabels ? 'border-primary/25 bg-soft text-primary-hover' : 'border-line bg-card text-muted'
                )}
              >
                Labels
              </button>
            </>
          )}
          <div className="ml-1 flex items-center gap-0.5 border-l border-line pl-1.5">
            <button
              onClick={() => setZoom((current) => Math.max(0.75, current - 0.25))}
              className="rounded p-1 text-muted transition hover:bg-[#f3f0e8] hover:text-ink"
              aria-label="Zoom out"
            >
              <ZoomOut className="size-3.5" />
            </button>
            <span className="w-9 text-center font-mono text-[9.5px] text-secondary">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((current) => Math.min(3, current + 0.25))}
              className="rounded p-1 text-muted transition hover:bg-[#f3f0e8] hover:text-ink"
              aria-label="Zoom in"
            >
              <ZoomIn className="size-3.5" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="rounded p-1 text-muted transition hover:bg-[#f3f0e8] hover:text-ink"
              aria-label="Reset zoom"
            >
              <RotateCcw className="size-3" />
            </button>
          </div>
        </div>
      </div>

      {classes.length > 0 && mode === 'overlay' && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3.5 py-2">
          <span className="mr-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Classes</span>
          {classes.map(([className, entry]) => {
            const hidden = hiddenClasses[className]
            return (
              <button
                key={className}
                onClick={() => setHiddenClasses((current) => ({ ...current, [className]: !current[className] }))}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition',
                  hidden ? 'border-line bg-[#f4f1e9] text-muted line-through' : 'border-line bg-card text-secondary'
                )}
              >
                <span className="size-1.5 rounded-full" style={{ background: hidden ? '#96958B' : entry.style.stroke }} />
                {className}
                <span className="font-mono text-[8.5px] text-muted">{entry.count}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex min-h-[420px] max-h-[680px] items-center justify-center overflow-auto bg-[#1E1F1B] p-2.5">
        {mode === 'compare' && annotatedImageUrl ? (
          <div className="flex h-full w-full items-center justify-center">
            <ReactCompareSlider
              itemOne={<ReactCompareSliderImage src={originalImageUrl} alt="Original road image" />}
              itemTwo={<ReactCompareSliderImage src={annotatedImageUrl} alt="Model-annotated road image" />}
              className="max-h-[640px] w-full rounded-lg"
            />
          </div>
        ) : imageFailed ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <ImageOff className="size-8 text-[#8b8a7f]" />
            <p className="text-[12px] font-medium text-[#d8d5c8]">Original image unavailable</p>
            <p className="max-w-xs text-[10.5px] leading-relaxed text-[#8b8a7f]">
              The stored source image could not be loaded. Detection metadata is still available in the results panel.
            </p>
          </div>
        ) : (
          <div
            className="relative origin-center transition-transform duration-150 ease-out"
            style={{ transform: `scale(${zoom})` }}
          >
            <img
              src={originalImageUrl}
              alt="Road inspection"
              onError={() => setImageFailed(true)}
              className="max-h-[640px] w-auto select-none rounded-md object-contain"
            />

            {showBoxes && imageWidth > 0 && imageHeight > 0 && (
              <svg
                viewBox={`0 0 ${imageWidth} ${imageHeight}`}
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-label="Detection bounding boxes"
              >
                <defs>
                  <filter id="viewerGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#F08A42" floodOpacity="0.85" />
                  </filter>
                </defs>
                {detections.map((detection) => {
                  if (hiddenClasses[detection.class_name]) return null
                  const { x1, y1, x2, y2 } = detection.bbox
                  const width = Math.max(10, Math.abs(x2 - x1))
                  const height = Math.max(10, Math.abs(y2 - y1))
                  const style = styleFor(detection.class_name)
                  const selected = selectedDetectionId === detection.detection_id
                  const corner = Math.min(18, Math.min(width, height) / 3)
                  const labelWidth = Math.max(128, (detection.class_name.length + 8) * 7.4)
                  return (
                    <g
                      key={detection.detection_id}
                      className="pointer-events-auto cursor-pointer"
                      filter={selected ? 'url(#viewerGlow)' : undefined}
                      onClick={() => onSelectDetection?.(detection.detection_id)}
                    >
                      <rect
                        x={x1}
                        y={y1}
                        width={width}
                        height={height}
                        rx={4}
                        fill={selected ? style.fill.replace('0.2', '0.4').replace('0.28', '0.45').replace('0.24', '0.42').replace('0.22', '0.4') : 'rgba(0,0,0,0.08)'}
                        stroke={style.stroke}
                        strokeWidth={selected ? 3.5 : 2.5}
                        strokeDasharray={selected ? '7 3' : undefined}
                      />
                      {selected && (
                        <g stroke="#FFFFFF" strokeWidth={2.5} fill="none">
                          <path d={`M ${x1} ${y1 + corner} L ${x1} ${y1} L ${x1 + corner} ${y1}`} />
                          <path d={`M ${x1 + width - corner} ${y1} L ${x1 + width} ${y1} L ${x1 + width} ${y1 + corner}`} />
                          <path d={`M ${x1} ${y1 + height - corner} L ${x1} ${y1 + height} L ${x1 + corner} ${y1 + height}`} />
                          <path d={`M ${x1 + width - corner} ${y1 + height} L ${x1 + width} ${y1 + height} L ${x1 + width} ${y1 + height - corner}`} />
                        </g>
                      )}
                      {showLabels && (
                        <g transform={`translate(${x1}, ${Math.max(22, y1 - 6)})`}>
                          <rect x={0} y={-17} width={labelWidth} height={19} rx={4} fill="#252720" stroke={style.stroke} strokeWidth={1.2} />
                          <text x={6} y={-3.5} fill={style.text} fontSize={10.5} fontFamily="JetBrains Mono" fontWeight="500">
                            {detection.class_name.toUpperCase()} · {Math.round(detection.confidence * 100)}%
                          </text>
                        </g>
                      )}
                    </g>
                  )
                })}
              </svg>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3.5 py-2 font-mono text-[9.5px] text-muted">
        <span className="flex items-center gap-1.5">
          <Maximize2 className="size-3" />
          {imageWidth > 0 && imageHeight > 0 ? `${imageWidth} × ${imageHeight} px` : 'Resolution unknown'}
        </span>
        <span className="flex items-center gap-1.5">
          <Layers className="size-3" />
          {detections.length} defect{detections.length === 1 ? '' : 's'} · {classes.length} class
          {classes.length === 1 ? '' : 'es'}
        </span>
      </div>
    </div>
  )
}
