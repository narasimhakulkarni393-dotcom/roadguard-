import type { Metadata } from 'next'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import 'leaflet/dist/leaflet.css'
import './globals.css'
import { AppShell } from '@/components/shell/AppShell'

export const metadata: Metadata = {
  title: {
    default: 'PitScout — Road Infrastructure Intelligence',
    template: '%s · PitScout',
  },
  description:
    'AI road damage detection, video tracking, geotagged reporting and duplicate identification for infrastructure teams.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
