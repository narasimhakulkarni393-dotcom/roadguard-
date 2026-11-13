'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BadgeCheck,
  Lock,
  Plus,
  SearchX,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
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
  SearchInput,
  Select,
  Field,
  Input,
  Dialog,
  ModalContent,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  SectionLabel,
  useToast,
} from '@/components/ui'
import { initials, formatDate } from '@/lib/format'
import { DIRECTORY_STORAGE_KEY as STORAGE_KEY } from '@/lib/preferences'

type MemberRole = 'admin' | 'analyst' | 'surveyor' | 'viewer'
type MemberStatus = 'active' | 'invited' | 'suspended'

interface Member {
  id: string
  name: string
  email: string
  role: MemberRole
  status: MemberStatus
  addedAt: string
}

interface MemberDraft {
  name: string
  email: string
  role: MemberRole
  status: MemberStatus
}

const ROLE_LABEL: Record<MemberRole, string> = {
  admin: 'Administrator',
  analyst: 'Analyst',
  surveyor: 'Field surveyor',
  viewer: 'Viewer',
}

const ROLE_TONE: Record<MemberRole, 'graphite' | 'info' | 'primary' | 'neutral'> = {
  admin: 'graphite',
  analyst: 'info',
  surveyor: 'primary',
  viewer: 'neutral',
}

const STATUS_LABEL: Record<MemberStatus, string> = {
  active: 'Active',
  invited: 'Invited',
  suspended: 'Suspended',
}

const STATUS_TONE: Record<MemberStatus, 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  invited: 'warning',
  suspended: 'neutral',
}

const EMPTY_DRAFT: MemberDraft = { name: '', email: '', role: 'surveyor', status: 'active' }

function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `member-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function readDirectory(): Member[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is Member =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.email === 'string' &&
        typeof item.role === 'string' &&
        typeof item.status === 'string'
    )
  } catch {
    return []
  }
}

export default function UsersPage() {
  const { toast } = useToast()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<MemberDraft>(EMPTY_DRAFT)
  const [formError, setFormError] = useState<string | null>(null)
  const [removeId, setRemoveId] = useState<string | null>(null)

  useEffect(() => {
    setMembers(readDirectory())
    setLoading(false)
  }, [])

  const persist = useCallback(
    (next: Member[]) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        toast({ tone: 'error', title: 'Browser storage unavailable', description: 'The directory could not be saved.' })
      }
      setMembers(next)
    },
    [toast]
  )

  const openCreate = () => {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setFormError(null)
    setDialogOpen(true)
  }

  const openEdit = (member: Member) => {
    setEditingId(member.id)
    setDraft({ name: member.name, email: member.email, role: member.role, status: member.status })
    setFormError(null)
    setDialogOpen(true)
  }

  const saveMember = () => {
    const name = draft.name.trim()
    const email = draft.email.trim()
    if (!name) {
      setFormError('Enter the person’s name.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('Enter a valid email address.')
      return
    }
    const duplicate = members.some(
      (member) => member.email.toLowerCase() === email.toLowerCase() && member.id !== editingId
    )
    if (duplicate) {
      setFormError('Another directory entry already uses this email address.')
      return
    }

    if (editingId) {
      persist(
        members.map((member) =>
          member.id === editingId ? { ...member, name, email, role: draft.role, status: draft.status } : member
        )
      )
      toast({ tone: 'success', title: 'Directory entry updated', description: `${name} is stored in this browser only.` })
    } else {
      const member: Member = {
        id: makeId(),
        name,
        email,
        role: draft.role,
        status: draft.status,
        addedAt: new Date().toISOString(),
      }
      persist([member, ...members])
      toast({ tone: 'success', title: 'Directory entry added', description: 'No account or credential was created.' })
    }
    setDialogOpen(false)
  }

  const removeMember = (id: string) => {
    const target = members.find((member) => member.id === id)
    persist(members.filter((member) => member.id !== id))
    setRemoveId(null)
    toast({ tone: 'info', title: 'Directory entry removed', description: target ? `${target.name} was removed locally.` : undefined })
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return members.filter((member) => {
      if (roleFilter !== 'all' && member.role !== roleFilter) return false
      if (statusFilter !== 'all' && member.status !== statusFilter) return false
      if (!term) return true
      return member.name.toLowerCase().includes(term) || member.email.toLowerCase().includes(term)
    })
  }, [members, search, roleFilter, statusFilter])

  const activeCount = members.filter((member) => member.status === 'active').length
  const invitedCount = members.filter((member) => member.status === 'invited').length
  const adminCount = members.filter((member) => member.role === 'admin').length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="System"
        title="User management"
        description="A local workspace directory for the people coordinating inspections. Roles are descriptive labels for this browser — they are not enforced by the backend."
        actions={
          <Button onClick={openCreate}>
            <UserPlus />
            Add person
          </Button>
        }
      />

      <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft p-4">
        <Lock className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="text-[11.5px] leading-relaxed text-warning">
          <p className="font-semibold">Directory only — no authentication backend</p>
          <p className="mt-0.5 opacity-90">
            The PitScout API is protected by a single machine-to-machine key held server-side. It exposes no user account
            endpoints, so this directory cannot grant access, send invitations or revoke credentials. Entries are stored in
            this browser&apos;s <span className="font-mono">localStorage</span> and can be cleared from Settings.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Directory entries" value={members.length} hint="stored in this browser" icon={Users} tone="primary" />
        <StatCard label="Active" value={activeCount} hint="marked active locally" icon={BadgeCheck} tone="success" />
        <StatCard label="Invited" value={invitedCount} hint="no invitation was sent" icon={UserPlus} tone={invitedCount > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Administrators" value={adminCount} hint="descriptive role only" icon={ShieldCheck} tone="info" />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or email…"
            className="w-full sm:w-72"
            type="search"
            aria-label="Search directory"
          />
          <Select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="w-full sm:w-44"
            aria-label="Filter by role"
          >
            <option value="all">All roles</option>
            {Object.entries(ROLE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="w-full sm:w-40"
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <span className="ml-auto font-mono text-[10.5px] text-muted">
            {filtered.length} of {members.length}
          </span>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted">Reading local directory…</div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={members.length === 0 ? Users : SearchX}
              title={members.length === 0 ? 'No directory entries' : 'No people match these filters'}
              description={
                members.length === 0
                  ? 'Add the operators, analysts and surveyors who work in this workspace. This does not create accounts or credentials.'
                  : 'Clear the search or filters to see the rest of the local directory.'
              }
              action={
                members.length === 0 ? (
                  <Button size="sm" onClick={openCreate}>
                    <Plus />
                    Add the first person
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSearch('')
                      setRoleFilter('all')
                      setStatusFilter('all')
                    }}
                  >
                    Reset filters
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Person</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Added</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((member) => (
                <TR key={member.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-graphite font-display text-[11px] font-semibold text-[#f8f6f0]">
                        {initials(member.name) || '—'}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium text-ink">{member.name}</p>
                        <p className="truncate font-mono text-[10.5px] text-muted">{member.email}</p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={ROLE_TONE[member.role]}>{ROLE_LABEL[member.role]}</Badge>
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[member.status]} dot>
                      {STATUS_LABEL[member.status]}
                    </Badge>
                  </TD>
                  <TD className="text-[11px]">{formatDate(member.addedAt)}</TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1.5">
                      {removeId === member.id ? (
                        <>
                          <span className="text-[10.5px] text-critical">Remove?</span>
                          <Button variant="danger" size="sm" onClick={() => removeMember(member.id)}>
                            Yes
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setRemoveId(null)}>
                            No
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="secondary" size="sm" onClick={() => openEdit(member)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            onClick={() => setRemoveId(member.id)}
                            aria-label={`Remove ${member.name}`}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div>
            <SectionLabel>Role reference</SectionLabel>
            <CardTitle className="mt-1.5">What each label means in this workspace</CardTitle>
            <CardDescription>
              These descriptions guide coordination. They do not change what the API accepts, because the backend authorises
              the single server-side key, not individual people.
            </CardDescription>
          </div>
          <Badge tone="warning">Not enforced</Badge>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { role: 'admin' as MemberRole, body: 'Coordinates the workspace, reviews exports and owns lifecycle decisions.' },
            { role: 'analyst' as MemberRole, body: 'Runs image and video analyses, reads duplicate audits and prepares reports.' },
            { role: 'surveyor' as MemberRole, body: 'Captures geotagged field evidence and corrects report locations on site.' },
            { role: 'viewer' as MemberRole, body: 'Reads dashboards, maps and analytics without changing records.' },
          ].map((item) => (
            <div key={item.role} className="rounded-xl border border-line bg-[#fbf9f3] p-3">
              <Badge tone={ROLE_TONE[item.role]}>{ROLE_LABEL[item.role]}</Badge>
              <p className="mt-2 text-[11.5px] leading-relaxed text-secondary">{item.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <ModalContent
          title={editingId ? 'Edit directory entry' : 'Add a person'}
          description="Stored only in this browser. No account, password or credential is created."
        >
          <div className="space-y-4 p-5">
            <Field label="Full name" htmlFor="member-name">
              <Input
                id="member-name"
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                maxLength={80}
                placeholder="R. Kulkarni"
                autoFocus
              />
            </Field>
            <Field label="Email" htmlFor="member-email" hint="Used as a unique label in this directory only.">
              <Input
                id="member-email"
                type="email"
                value={draft.email}
                onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                maxLength={120}
                placeholder="surveyor@example.org"
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Role" htmlFor="member-role">
                <Select
                  id="member-role"
                  value={draft.role}
                  onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as MemberRole }))}
                >
                  {Object.entries(ROLE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status" htmlFor="member-status">
                <Select
                  id="member-status"
                  value={draft.status}
                  onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as MemberStatus }))}
                >
                  {Object.entries(STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {formError && (
              <div className="flex items-start gap-2 rounded-lg border border-critical/20 bg-critical-soft p-3 text-[11.5px] text-critical">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveMember}>{editingId ? 'Save changes' : 'Add to directory'}</Button>
          </div>
        </ModalContent>
      </Dialog>
    </div>
  )
}
