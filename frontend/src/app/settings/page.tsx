'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Database,
  Info,
  KeyRound,
  RefreshCw,
  Save,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
  UserRound,
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
  Field,
  Input,
  SectionLabel,
  LoadingPanel,
  useToast,
} from '@/components/ui'
import type { HealthStatus } from '@/types/pitscout'
import { clientApi } from '@/lib/client-api'
import { formatDateTime, initials } from '@/lib/format'
import {
  DEFAULT_APPEARANCE,
  DEFAULT_PROFILE,
  DIRECTORY_STORAGE_KEY,
  APPEARANCE_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
  applyAppearance,
  clearLocalWorkspaceData,
  readAppearance,
  readProfile,
  writeAppearance,
  writeProfile,
  type AppearancePrefs,
  type OperatorProfile,
} from '@/lib/preferences'

function errorMessage(err: any, fallback: string) {
  const detail = err?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') return detail.detail || detail.error || fallback
  return err?.message || fallback
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-[#fbf9f3] p-3.5">
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-secondary">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 flex h-5.5 w-10 shrink-0 items-center rounded-full border transition-colors ${
          checked ? 'border-primary/30 bg-primary' : 'border-line-strong bg-[#e6e1d5]'
        }`}
      >
        <span
          className={`absolute size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(37,39,32,0.25)] transition-transform ${
            checked ? 'translate-x-[19px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </div>
  )
}

export default function SettingsPage() {
  const { toast } = useToast()
  const [profile, setProfile] = useState<OperatorProfile>(DEFAULT_PROFILE)
  const [draft, setDraft] = useState<OperatorProfile>(DEFAULT_PROFILE)
  const [appearance, setAppearance] = useState<AppearancePrefs>(DEFAULT_APPEARANCE)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState<string | null>(null)
  const [directoryCount, setDirectoryCount] = useState(0)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [confirmReset, setConfirmReset] = useState(false)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    const storedProfile = readProfile()
    setProfile(storedProfile)
    setDraft(storedProfile)
    setAppearance(readAppearance())
    setOrigin(window.location.origin)
    try {
      const raw = window.localStorage.getItem(DIRECTORY_STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      setDirectoryCount(Array.isArray(parsed) ? parsed.length : 0)
      window.localStorage.setItem('pitscout.storage-probe', '1')
      window.localStorage.removeItem('pitscout.storage-probe')
    } catch {
      setStorageAvailable(false)
    }
  }, [])

  const loadHealth = useCallback(async () => {
    setHealthLoading(true)
    setHealthError(null)
    try {
      const status = await clientApi.health()
      setHealth(status)
      setLastChecked(new Date().toISOString())
    } catch (err: any) {
      setHealth(null)
      setHealthError(errorMessage(err, 'The API health endpoint could not be reached.'))
      setLastChecked(new Date().toISOString())
    } finally {
      setHealthLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHealth()
  }, [loadHealth])

  const saveProfile = () => {
    const name = draft.name.trim()
    const team = draft.team.trim()
    if (!name) {
      toast({ tone: 'error', title: 'Name required', description: 'Enter the display name for this workspace.' })
      return
    }
    const next: OperatorProfile = { name, team: team || DEFAULT_PROFILE.team }
    writeProfile(next)
    setProfile(next)
    setDraft(next)
    toast({ tone: 'success', title: 'Operator profile saved', description: 'The topbar profile menu now uses this label.' })
  }

  const toggleMotion = (reduceMotion: boolean) => {
    const next = { reduceMotion }
    setAppearance(next)
    writeAppearance(next)
    toast({
      tone: 'info',
      title: reduceMotion ? 'Reduced motion enabled' : 'Reduced motion disabled',
      description: 'The preference is stored in this browser and applied immediately.',
    })
  }

  const resetLocal = () => {
    clearLocalWorkspaceData()
    setProfile(DEFAULT_PROFILE)
    setDraft(DEFAULT_PROFILE)
    setAppearance(DEFAULT_APPEARANCE)
    applyAppearance(DEFAULT_APPEARANCE)
    setDirectoryCount(0)
    setConfirmReset(false)
    toast({
      tone: 'info',
      title: 'Local workspace data cleared',
      description: 'Profile, appearance and directory entries were removed. Server records were untouched.',
    })
  }

  const healthTone = health
    ? health.status === 'healthy'
      ? 'success'
      : 'warning'
    : healthError
      ? 'critical'
      : 'neutral'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Workspace identity, local preferences and honest diagnostics for the API this frontend proxies to."
        actions={
          <Button variant="secondary" onClick={() => void loadHealth()} loading={healthLoading}>
            <RefreshCw />
            Recheck API
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-7">
          <Card>
            <CardHeader>
              <div>
                <SectionLabel>Identity</SectionLabel>
                <CardTitle className="mt-1.5">Operator profile</CardTitle>
                <CardDescription>
                  A local display label for the topbar. No account, password or session is created.
                </CardDescription>
              </div>
              <Badge tone="neutral">Local only</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-line bg-[#fbf9f3] p-3.5">
                <span className="flex size-11 items-center justify-center rounded-xl bg-graphite font-display text-[13px] font-semibold text-[#f8f6f0]">
                  {initials(draft.name || profile.name) || 'OD'}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{draft.name || profile.name}</p>
                  <p className="truncate text-[11px] text-muted">{draft.team || profile.team}</p>
                </div>
                <Badge tone={storageAvailable ? 'success' : 'warning'} dot className="ml-auto">
                  {storageAvailable ? 'Storage ready' : 'Storage blocked'}
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Display name" htmlFor="profile-name" hint="Shown in the profile menu.">
                  <Input
                    id="profile-name"
                    value={draft.name}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    maxLength={60}
                    placeholder="Operations Desk"
                  />
                </Field>
                <Field label="Team or role" htmlFor="profile-team" hint="A short subtitle under the name.">
                  <Input
                    id="profile-team"
                    value={draft.team}
                    onChange={(event) => setDraft((current) => ({ ...current, team: event.target.value }))}
                    maxLength={60}
                    placeholder="Road intelligence"
                  />
                </Field>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={saveProfile} disabled={!storageAvailable}>
                  <Save />
                  Save profile
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setDraft(profile)}
                  disabled={draft.name === profile.name && draft.team === profile.team}
                >
                  Revert
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <SectionLabel>Appearance</SectionLabel>
                <CardTitle className="mt-1.5">Motion preference</CardTitle>
                <CardDescription>
                  PitScout uses subtle transitions for navigation and panels. Turning them off removes non-essential motion
                  across the app.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Toggle
                checked={appearance.reduceMotion}
                onChange={toggleMotion}
                label="Reduce motion"
                description="Disables animations and transitions except where they communicate progress."
              />
              <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
                Your operating system setting is still respected. This toggle is stored in{' '}
                <span className="font-mono">localStorage</span> and applies immediately.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <SectionLabel>Local data</SectionLabel>
                <CardTitle className="mt-1.5">What this browser stores</CardTitle>
                <CardDescription>
                  Only preferences and the descriptive team directory live in this browser. Operational records stay in the
                  backend database.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="divide-y divide-line rounded-xl border border-line">
                {[
                  { key: PROFILE_STORAGE_KEY, label: 'Operator profile', detail: `${profile.name} · ${profile.team}` },
                  {
                    key: APPEARANCE_STORAGE_KEY,
                    label: 'Appearance preference',
                    detail: appearance.reduceMotion ? 'Reduced motion enabled' : 'Default motion',
                  },
                  {
                    key: DIRECTORY_STORAGE_KEY,
                    label: 'Team directory',
                    detail: `${directoryCount} local entr${directoryCount === 1 ? 'y' : 'ies'}`,
                  },
                ].map((item) => (
                  <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-ink">{item.label}</p>
                      <p className="truncate font-mono text-[10px] text-muted">{item.key}</p>
                    </div>
                    <span className="text-[11px] text-secondary">{item.detail}</span>
                  </li>
                ))}
              </ul>

              {confirmReset ? (
                <div className="rounded-xl border border-critical/20 bg-critical-soft p-3">
                  <p className="text-[11.5px] leading-relaxed text-critical">
                    This clears the local profile, appearance preference and team directory in this browser. Backend
                    inspections, reports and potholes are not touched.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button variant="danger" size="sm" onClick={resetLocal}>
                      <Trash2 />
                      Clear local data
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
                  <Trash2 />
                  Reset local workspace data
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-5 lg:col-span-5">
          <Card>
            <CardHeader>
              <div>
                <SectionLabel>Diagnostics</SectionLabel>
                <CardTitle className="mt-1.5 flex items-center gap-2">
                  <Activity className="size-4 text-primary" />
                  API health
                </CardTitle>
              </div>
              <Badge tone={healthTone} dot>
                {health ? health.status : healthError ? 'unreachable' : 'checking'}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {healthLoading && !health ? (
                <LoadingPanel label="Checking the backend…" className="min-h-[160px] border-0 bg-transparent" />
              ) : health ? (
                <>
                  <dl className="divide-y divide-line rounded-xl border border-line bg-[#fbf9f3]">
                    <DiagnosticRow label="Application" value={`${health.app} v${health.version}`} />
                    <DiagnosticRow label="Database" value={health.database} />
                    <DiagnosticRow
                      label="Detection model"
                      value={health.detection_model_ready ? 'Ready' : 'Checkpoint pending'}
                      tone={health.detection_model_ready ? 'success' : 'warning'}
                    />
                    <DiagnosticRow
                      label="Authenticity model"
                      value={health.authenticity_model_ready ? 'Ready' : 'Checkpoint pending'}
                      tone={health.authenticity_model_ready ? 'success' : 'warning'}
                    />
                    <DiagnosticRow label="Server time" value={formatDateTime(health.timestamp)} />
                  </dl>
                  {!health.detection_model_ready && (
                    <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft p-2.5 text-[11px] leading-relaxed text-warning">
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        Image and video runs still perform validation and pipeline stages, but no damage detections are
                        produced until the detection checkpoint is installed.
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-critical/20 bg-critical-soft p-3 text-[11.5px] leading-relaxed text-critical">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Health endpoint unreachable</p>
                    <p className="mt-0.5">{healthError}</p>
                  </div>
                </div>
              )}
              <p className="font-mono text-[10px] text-muted">Last checked: {formatDateTime(lastChecked)}</p>
              <Button variant="secondary" size="sm" onClick={() => void loadHealth()} loading={healthLoading}>
                <RefreshCw />
                Recheck
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <SectionLabel>Security model</SectionLabel>
                <CardTitle className="mt-1.5">How requests are authorised</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-[11.5px] leading-relaxed text-secondary">
              <div className="flex items-start gap-2.5">
                <Server className="mt-0.5 size-4 shrink-0 text-primary" />
                <p>
                  The browser calls same-origin <span className="font-mono text-[10.5px] text-ink">/api/v1/*</span> route
                  handlers. Those handlers attach the API key on the server and fail closed with a 503 when it is missing.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" />
                <p>
                  The key is read from server environment variables. It is never exposed through{' '}
                  <span className="font-mono text-[10.5px] text-ink">NEXT_PUBLIC_*</span> and is not stored in this browser.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <p>
                  There are no user accounts or sessions. The team directory is descriptive, and every operational API
                  call uses the same server-side key.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <Database className="mt-0.5 size-4 shrink-0 text-primary" />
                <p>
                  The map renders on a self-contained coordinate grid; it makes no third-party tile or geocoding requests.
                </p>
              </div>
              <div className="rounded-lg border border-line bg-[#fbf9f3] p-2.5 font-mono text-[10px] text-muted">
                origin: {origin || '—'} · proxy: /api/v1
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <SectionLabel>Runtime</SectionLabel>
                <CardTitle className="mt-1.5 flex items-center gap-2">
                  <SettingsIcon className="size-4 text-primary" />
                  Deployment posture
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-[11.5px] leading-relaxed text-secondary">
              <p className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                Frontend limits: 50 MB images, 200 MB videos, JPEG/PNG/WEBP/BMP only.
              </p>
              <p className="flex items-start gap-2">
                <Info className="mt-0.5 size-3.5 shrink-0 text-info" />
                Coordinates are never inferred from an image or video. Reports without device or surveyed coordinates
                remain pending verification.
              </p>
              <p className="flex items-start gap-2">
                <UserRound className="mt-0.5 size-3.5 shrink-0 text-muted" />
                {profile.name} · local operator label only.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function DiagnosticRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'success' | 'warning'
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <dt className="text-[11px] text-secondary">{label}</dt>
      <dd
        className={`text-right font-mono text-[10.5px] ${
          tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-ink'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
