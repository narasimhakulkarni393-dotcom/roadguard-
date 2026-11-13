'use client'

import React from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ScanEye,
  AlertTriangle,
  Layers,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Activity,
  CheckCircle2,
  FileCheck2,
  Cpu,
} from 'lucide-react'

export default function LandingPage() {
  const defectTypes = [
    {
      code: 'D40',
      title: 'Potholes',
      color: 'border-red-500/40 bg-red-500/10 text-red-400',
      badge: 'High Risk',
      desc: 'Severe pavement cavity caused by water ingress, subgrade wear, and repetitive heavy traffic load.',
    },
    {
      code: 'D20',
      title: 'Alligator Cracking',
      color: 'border-orange-500/40 bg-orange-500/10 text-orange-400',
      badge: 'Fatigue Failure',
      desc: 'Interconnected series of fatigue fractures indicating deep structural sub-base failure.',
    },
    {
      code: 'D00',
      title: 'Longitudinal Cracks',
      color: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
      badge: 'Joint Defect',
      desc: 'Cracks parallel to the road centerline caused by poor joint construction or temperature contraction.',
    },
    {
      code: 'D10',
      title: 'Transverse Cracks',
      color: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400',
      badge: 'Thermal Stress',
      desc: 'Cracks perpendicular to the centerline resulting from pavement aging, binder shrinkage, or frost action.',
    },
  ]

  return (
    <div className="flex flex-col gap-16 py-8">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#111C2E] via-[#0D1625] to-[#0B1220] p-8 md:p-14 shadow-2xl">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1 text-xs font-semibold text-cyan-300">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              <span>Next-Gen Infrastructure Vision</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
              See Road Damage <br />
              <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
                Before It Becomes a Crisis.
              </span>
            </h1>

            <p className="text-base md:text-lg text-slate-300 max-w-2xl leading-relaxed">
              Automated computer-vision road defect recognition, calibrated geometric measurement,
              explainable severity grading, and multi-factor engineering diagnostics for road networks.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                href="/inspect"
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/25 transition hover:brightness-110 hover:shadow-cyan-500/40"
              >
                <ScanEye className="h-4 w-4" />
                Launch Inspection Workspace
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
              >
                View Analytics &amp; Metrics
              </Link>
            </div>
          </div>

          {/* Interactive Simulation / Visual */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-900/90 shadow-2xl p-4 flex flex-col justify-between">
              {/* Road Lane Graphic */}
              <div className="absolute inset-0 flex flex-col justify-center items-center opacity-30">
                <div className="w-full h-1 bg-slate-700"></div>
                <div className="w-full h-8 flex justify-around items-center">
                  <div className="w-12 h-1 bg-amber-400/80"></div>
                  <div className="w-12 h-1 bg-amber-400/80"></div>
                  <div className="w-12 h-1 bg-amber-400/80"></div>
                  <div className="w-12 h-1 bg-amber-400/80"></div>
                </div>
                <div className="w-full h-1 bg-slate-700"></div>
              </div>

              {/* Scanning Line Animation */}
              <motion.div
                className="absolute top-0 bottom-0 w-1 bg-gradient-to-b from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee]"
                animate={{ left: ['0%', '100%', '0%'] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              />

              {/* Detection Box Simulation 1 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="relative z-10 w-44 rounded-lg border-2 border-red-500 bg-red-950/40 p-2.5 shadow-lg backdrop-blur-sm self-start mt-4"
              >
                <div className="flex items-center justify-between text-[11px] font-bold text-red-400">
                  <span>D40: POTHOLE</span>
                  <span className="font-mono bg-red-500/20 px-1 rounded">94.8%</span>
                </div>
                <div className="text-[10px] text-slate-300 mt-1 font-mono">
                  Area: 32,480 px² &bull; Sev: HIGH
                </div>
              </motion.div>

              {/* Detection Box Simulation 2 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="relative z-10 w-48 rounded-lg border-2 border-blue-400 bg-blue-950/40 p-2.5 shadow-lg backdrop-blur-sm self-end mb-4"
              >
                <div className="flex items-center justify-between text-[11px] font-bold text-blue-300">
                  <span>D00: LONGITUDINAL</span>
                  <span className="font-mono bg-blue-500/20 px-1 rounded">89.2%</span>
                </div>
                <div className="text-[10px] text-slate-300 mt-1 font-mono">
                  Span: 420 px &bull; Sev: MODERATE
                </div>
              </motion.div>

              <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-2 text-[10px] font-mono text-slate-400">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                  YOLOv8 Active Pipeline
                </span>
                <span>CRDDC RDD2022</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Defect Classes Grid */}
      <section className="flex flex-col gap-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Defect Taxonomy</span>
          <h2 className="text-2xl md:text-3xl font-bold text-white mt-1">
            Standardised CRDDC Road Defect Classes
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            Trained according to international benchmarks (RDD2022) for pavement damage detection.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {defectTypes.map((d) => (
            <div
              key={d.code}
              className={`rounded-2xl border p-5 transition-all duration-300 hover:border-cyan-500/50 hover:bg-slate-900/90 ${d.color}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold bg-white/10 px-2 py-0.5 rounded">{d.code}</span>
                <span className="text-[11px] font-medium opacity-80">{d.badge}</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-3">{d.title}</h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed opacity-90">{d.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Multi-Stage Architecture Flow */}
      <section className="rounded-2xl border border-white/10 bg-[#111C2E]/60 p-8">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Activity className="h-5 w-5 text-cyan-400" />
          The 8-Stage Intelligence Pipeline
        </h2>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-white/5 bg-slate-900/60 p-4">
            <span className="text-xs font-mono text-cyan-400 font-bold">STAGE 1 &amp; 2</span>
            <h4 className="text-sm font-bold text-white mt-1">Image Validation &amp; Authenticity</h4>
            <p className="text-xs text-slate-400 mt-1">EXIF sanity, blur variance, exposure balance, and heuristic authenticity verification.</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-900/60 p-4">
            <span className="text-xs font-mono text-cyan-400 font-bold">STAGE 3 &amp; 4</span>
            <h4 className="text-sm font-bold text-white mt-1">Detection &amp; Highlighting</h4>
            <p className="text-xs text-slate-400 mt-1">YOLOv8 bounding box generation, class tagging, confidence scoring, and visual color overlays.</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-900/60 p-4">
            <span className="text-xs font-mono text-cyan-400 font-bold">STAGE 5 &amp; 6</span>
            <h4 className="text-sm font-bold text-white mt-1">Dimension &amp; Severity</h4>
            <p className="text-xs text-slate-400 mt-1">Pixel area calculations, shape elongation, multi-defect factor, and explainable 0–100 severity scores.</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-slate-900/60 p-4">
            <span className="text-xs font-mono text-cyan-400 font-bold">STAGE 7 &amp; 8</span>
            <h4 className="text-sm font-bold text-white mt-1">Cause &amp; Remediation</h4>
            <p className="text-xs text-slate-400 mt-1">Civil engineering failure hypotheses, recommended field inspections, and structured reporting.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
