import {
  BarChart3,
  ClipboardList,
  Cpu,
  Database,
  LayoutDashboard,
  Map,
  MapPin,
  ScanEye,
  Settings,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  description: string
  group: 'workspace' | 'intelligence' | 'system'
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Network health, activity and priorities',
    group: 'workspace',
  },
  {
    label: 'Image Detection',
    href: '/inspect',
    icon: ScanEye,
    description: 'Run the 8-stage image inspection pipeline',
    group: 'workspace',
  },
  {
    label: 'Video Detection',
    href: '/video',
    icon: Video,
    description: 'Track defects across survey footage',
    group: 'workspace',
  },
  {
    label: 'Live Pothole Map',
    href: '/map',
    icon: Map,
    description: 'Geospatial view of canonical potholes',
    group: 'intelligence',
  },
  {
    label: 'Duplicate Detection',
    href: '/duplicates',
    icon: MapPin,
    description: 'Review match decisions and evidence',
    group: 'intelligence',
  },
  {
    label: 'Report a Pothole',
    href: '/report',
    icon: MapPin,
    description: 'Submit geotagged photographic evidence',
    group: 'intelligence',
  },
  {
    label: 'Pothole Management',
    href: '/potholes',
    icon: ClipboardList,
    description: 'Canonical records and lifecycle status',
    group: 'intelligence',
  },
  {
    label: 'Analytics & Reports',
    href: '/analytics',
    icon: BarChart3,
    description: 'Trends, hotspots and resolution metrics',
    group: 'intelligence',
  },
  {
    label: 'User Management',
    href: '/users',
    icon: Users,
    description: 'Workspace roles and access',
    group: 'system',
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    description: 'Workspace, API and notification settings',
    group: 'system',
  },
  {
    label: 'Datasets',
    href: '/datasets',
    icon: Database,
    description: 'Corpus provenance and preparation',
    group: 'system',
  },
  {
    label: 'Model Training',
    href: '/training',
    icon: Cpu,
    description: 'Fine-tuning runs and telemetry',
    group: 'system',
  },
]

export const PAGE_TITLES: { prefix: string; title: string; section: string }[] = [
  { prefix: '/dashboard', title: 'Dashboard', section: 'Workspace' },
  { prefix: '/inspect', title: 'Image Detection', section: 'Workspace' },
  { prefix: '/video', title: 'Video Detection', section: 'Workspace' },
  { prefix: '/map', title: 'Live Pothole Map', section: 'Intelligence' },
  { prefix: '/duplicates', title: 'Duplicate Detection Centre', section: 'Intelligence' },
  { prefix: '/report', title: 'Report a Pothole', section: 'Intelligence' },
  { prefix: '/reports', title: 'Submission Log', section: 'Intelligence' },
  { prefix: '/potholes', title: 'Pothole Management', section: 'Intelligence' },
  { prefix: '/analytics', title: 'Analytics & Reports', section: 'Intelligence' },
  { prefix: '/users', title: 'User Management', section: 'System' },
  { prefix: '/settings', title: 'Settings', section: 'System' },
  { prefix: '/datasets', title: 'Datasets', section: 'System' },
  { prefix: '/training', title: 'Model Training', section: 'System' },
]

export function resolvePage(pathname: string) {
  return (
    PAGE_TITLES.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`)) || {
      title: 'PitScout',
      section: 'Workspace',
    }
  )
}
