import type { Metadata } from 'next'
import { Suspense } from 'react'
import './globals.css'
import { Navigation } from '@/components/Navigation'

export const metadata: Metadata = {
  title: 'RoadGuard AI — Road Damage Detection & Infrastructure Intelligence',
  description: 'AI-Powered Road Damage Detection, Measurement, Severity Analysis & Road Intelligence Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0B1220] text-slate-100 min-h-screen flex flex-col antialiased">
        <Suspense fallback={<div className="h-16 w-full bg-[#0B1220]" />}>
          <Navigation />
        </Suspense>
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-6">
          {children}
        </main>
        <footer className="border-t border-white/5 bg-[#080d17] py-6 px-4 md:px-8 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2">
            <div>
              RoadGuard AI &copy; 2026 &mdash; Automated Road Damage Detector & Analysis System
            </div>
            <div className="flex items-center gap-4 text-slate-400">
              <span>RDD2022 CRDDC Standard</span>
              <span>&bull;</span>
              <span>YOLOv8 Detection</span>
              <span>&bull;</span>
              <span>Explainable Severity</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
