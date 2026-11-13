const CLASS_LABELS: Record<string, string> = {
  D00: 'Longitudinal crack',
  D10: 'Transverse crack',
  D20: 'Alligator crack',
  D40: 'Pothole',
  'longitudinal_crack': 'Longitudinal crack',
  'transverse_crack': 'Transverse crack',
  'alligator_crack': 'Alligator crack',
  pothole: 'Pothole',
  crack: 'Crack',
}

export function classLabel(value: string | null | undefined) {
  if (!value) return 'Unclassified'
  const key = value.trim()
  if (CLASS_LABELS[key]) return `${CLASS_LABELS[key]} · ${key}`
  return humanize(key)
}

export function humanize(value: string | null | undefined) {
  if (!value) return '—'
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function shortId(value: string | null | undefined, length = 8) {
  if (!value) return '—'
  return value.length > length ? `${value.slice(0, length)}…` : value
}

export function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const naive = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/
  const date = new Date(naive.test(value) ? `${value}Z` : value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value: string | null | undefined) {
  const date = parseApiDate(value)
  if (!date) return '—'
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value: string | null | undefined) {
  const date = parseApiDate(value)
  if (!date) return '—'
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function timeAgo(value: string | null | undefined) {
  const date = parseApiDate(value)
  if (!date) return '—'
  const diff = Date.now() - date.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return 'just now'
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`
  if (diff < day) return `${Math.floor(diff / hour)} h ago`
  if (diff < 7 * day) return `${Math.floor(diff / day)} d ago`
  return formatDate(value)
}

export function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString()
}

export function formatPercent(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatRatioPercent(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(digits)}%`
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes == null || Number.isNaN(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let size = bytes / 1024
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`
}

export function coordinate(lat: number | null | undefined, lon: number | null | undefined) {
  if (lat == null || lon == null) return 'No verified coordinates'
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [headers.join(','), ...rows.map((row) => headers.map((h) => escape(row[h])).join(','))].join('\n')
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
