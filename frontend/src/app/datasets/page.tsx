'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Database,
  ExternalLink,
  FileCheck2,
  FolderSearch,
  Info,
  Layers,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react'
import {
  PageHeader,
  StatCard,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  EmptyState,
  CardSkeleton,
  SectionLabel,
} from '@/components/ui'
import type { DatasetStatus } from '@/types/pitscout'
import { clientApi } from '@/lib/client-api'
import { formatNumber } from '@/lib/format'

interface ActionResult {
  tone: 'success' | 'warning' | 'error'
  title: string
  message: string
  details?: string[]
}

function errorMessage(err: any, fallback: string) {
  const detail = err?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') return detail.detail || detail.error || fallback
  return err?.message || fallback
}

export default function DatasetsPage() {
  const [data, setData] = useState<DatasetStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<ActionResult | null>(null)
  const [busy, setBusy] = useState<{ id: string; kind: 'validate' | 'prepare' } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await clientApi.datasets())
    } catch (err: any) {
      setError(errorMessage(err, 'Dataset status could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const validate = async (id: string) => {
    setBusy({ id, kind: 'validate' })
    setAction(null)
    try {
      const result = await clientApi.validateDataset(id)
      setAction({
        tone: result.valid ? 'success' : 'warning',
        title: result.valid ? 'Dataset images decoded successfully' : 'Dataset needs attention',
        message: result.message || 'Validation completed without a message.',
        details: result.corruption_details,
      })
    } catch (err: any) {
      setAction({
        tone: 'error',
        title: 'Validation request failed',
        message: errorMessage(err, 'The validation endpoint could not be reached.'),
      })
    } finally {
      setBusy(null)
    }
  }

  const prepare = async (id: string) => {
    setBusy({ id, kind: 'prepare' })
    setAction(null)
    try {
      const result = await clientApi.prepareDataset(id)
      setAction({
        tone: 'success',
        title: 'Preparation accepted',
        message: result.message || result.detail || 'The backend accepted the preparation request.',
      })
    } catch (err: any) {
      setAction({
        tone: 'error',
        title: 'Preparation is not available',
        message: errorMessage(err, 'The backend answered with an error.'),
      })
    } finally {
      setBusy(null)
    }
  }

  const datasets = data?.datasets || []
  const ready = datasets.filter((dataset) => dataset.status === 'ready').length
  const rawTotal = data?.summary?.total_raw_files ?? datasets.reduce((sum, item) => sum + item.raw_files, 0)
  const processedTotal =
    data?.summary?.total_processed_files ?? datasets.reduce((sum, item) => sum + item.processed_files, 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="System"
        title="Datasets & provenance"
        description="Read-only inspection of the road-damage corpora declared by the backend. Counts come from a filesystem scan — no dataset is bundled with this deployment."
        actions={
          <Button variant="secondary" onClick={() => void load()} loading={loading}>
            <RefreshCw />
            Refresh status
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Declared datasets" value={datasets.length} hint="from the backend manifest" icon={Database} tone="primary" />
        <StatCard label="Ready" value={ready} hint="processed files present" icon={ShieldCheck} tone={ready > 0 ? 'success' : 'neutral'} />
        <StatCard label="Raw files" value={formatNumber(rawTotal)} hint="scanned under datasets/raw" icon={FolderSearch} tone="info" />
        <StatCard label="Processed files" value={formatNumber(processedTotal)} hint="scanned under datasets/processed" icon={Layers} tone={processedTotal > 0 ? 'success' : 'neutral'} />
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-info/20 bg-info-soft p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <div className="text-[11.5px] leading-relaxed text-info">
          <p className="font-semibold">Validation decodes images; preparation is deliberately unimplemented</p>
          <p className="mt-0.5 opacity-90">
            <span className="font-medium">Validate</span> opens every image under the declared source path and reports
            decode failures. <span className="font-medium">Prepare</span> currently returns HTTP 501 from the backend, because
            annotation conversion and train/val splitting are not implemented. Supply a YOLO-format dataset and{' '}
            <span className="font-mono">data.yaml</span> instead.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-critical/20 bg-critical-soft p-3.5 text-[12px] text-critical">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {action && (
        <div
          className={`rounded-xl border p-4 ${
            action.tone === 'success'
              ? 'border-success/20 bg-success-soft'
              : action.tone === 'warning'
                ? 'border-warning/25 bg-warning-soft'
                : 'border-critical/20 bg-critical-soft'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {action.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            ) : action.tone === 'warning' ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-critical" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={`text-[12.5px] font-semibold ${
                  action.tone === 'success' ? 'text-success' : action.tone === 'warning' ? 'text-warning' : 'text-critical'
                }`}
              >
                {action.title}
              </p>
              <p className="mt-1 whitespace-pre-line text-[11.5px] leading-relaxed text-secondary">{action.message}</p>
              {action.details && action.details.length > 0 && (
                <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-line bg-card p-2 font-mono text-[10px] text-secondary">
                  {action.details.map((detail, index) => (
                    <li key={index} className="break-all">
                      {detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={() => setAction(null)}
              className="rounded p-0.5 text-muted transition hover:text-ink"
              aria-label="Dismiss dataset result"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : datasets.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Database}
              title="No datasets declared"
              description="The backend manifest returned no datasets. Check the API health diagnostic in Settings."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {datasets.map((dataset) => {
            const isReady = dataset.status === 'ready'
            return (
              <Card key={dataset.id} className="flex flex-col">
                <CardHeader>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <SectionLabel>{dataset.id}</SectionLabel>
                      <Badge tone={isReady ? 'success' : 'warning'} dot>
                        {isReady ? 'Ready' : dataset.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <CardTitle className="mt-1.5">{dataset.name}</CardTitle>
                    <CardDescription>
                      Licence: <span className="font-medium text-graphite">{dataset.licence}</span>
                    </CardDescription>
                  </div>
                  <Button variant="secondary" size="sm" asChild>
                    <a href={dataset.source} target="_blank" rel="noreferrer">
                      Source
                      <ExternalLink />
                    </a>
                  </Button>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-lg border border-line bg-[#fbf9f3] p-3">
                      <p className="label-mono text-[9px]">Raw files</p>
                      <p className="mt-1 font-display text-xl font-semibold text-ink tabular">
                        {formatNumber(dataset.raw_files)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-line bg-[#fbf9f3] p-3">
                      <p className="label-mono text-[9px]">Processed files</p>
                      <p className="mt-1 font-display text-xl font-semibold text-ink tabular">
                        {formatNumber(dataset.processed_files)}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="label-mono text-[9px]">Declared classes</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {dataset.classes.map((name) => (
                        <span
                          key={name}
                          className="rounded-md border border-line bg-card px-2 py-0.5 font-mono text-[10px] text-secondary"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {dataset.raw_files === 0 && (
                    <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                      No raw files were found for this dataset. Validation will report zero checked images until the corpus
                      is placed under the source path.
                    </p>
                  )}

                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void validate(dataset.id)}
                      disabled={busy != null}
                    >
                      {busy?.id === dataset.id && busy.kind === 'validate' ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <FileCheck2 />
                      )}
                      Validate images
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void prepare(dataset.id)}
                      disabled={busy != null}
                      title="The backend currently answers HTTP 501 for this request."
                    >
                      {busy?.id === dataset.id && busy.kind === 'prepare' ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Layers />
                      )}
                      Prepare for training
                    </Button>
                    <span className="ml-auto font-mono text-[9.5px] text-muted">prepare → 501</span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <p className="flex items-start gap-2 border-t border-line pt-4 text-[10.5px] leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        Licence terms are reported exactly as declared by the backend manifest. Raw and processed corpora are ignored by
        version control and are not redistributed with this application.
      </p>
    </div>
  )
}
