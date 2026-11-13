'use client'

import React, { useState, useEffect } from 'react'
import {
  Cpu,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  FileCode2,
  Sliders,
  Layers,
  Terminal,
} from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

export default function TrainingPage() {
  const [modelType, setModelType] = useState('detection')
  const [epochs, setEpochs] = useState(30)
  const [batchSize, setBatchSize] = useState(8)
  const [imgSize, setImgSize] = useState(640)
  const [learningRate, setLearningRate] = useState(0.01)
  const [device, setDevice] = useState('cpu')

  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<string | null>(null)
  const [logs, setLogs] = useState<string>('')
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startTraining = async () => {
    setIsStarting(true)
    setError(null)
    try {
      const endpoint =
        modelType === 'detection'
          ? `${API_BASE}/api/v1/training/detection/start`
          : `${API_BASE}/api/v1/training/authenticity/start`

      const payload =
        modelType === 'detection'
          ? {
              dataset_name: 'rdd2022',
              model_type: 'yolov8n',
              epochs: Number(epochs),
              imgsz: Number(imgSize),
              batch: Number(batchSize),
              lr: Number(learningRate),
              device: device,
            }
          : {
              dataset_name: 'genimage',
              model_type: 'mobilenet_v3_small',
              epochs: Number(epochs),
              batch: Number(batchSize),
              lr: Number(learningRate),
            }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.detail || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setActiveJobId(json.job_id)
      setJobStatus(json.status)
      setLogs(`[${new Date().toISOString()}] Job initialized with ID: ${json.job_id}\nConnecting to training worker...`)
    } catch (err: any) {
      setError(err.message || 'Failed to trigger training job.')
    } finally {
      setIsStarting(false)
    }
  }

  // Poll for logs if there is an active job
  useEffect(() => {
    if (!activeJobId) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/training/${activeJobId}/logs`)
        if (res.ok) {
          const json = await res.json()
          setLogs(json.logs)
          setJobStatus(json.status)
        }
      } catch (e) {
        console.error(e)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [activeJobId])

  return (
    <div className="flex flex-col gap-8 py-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-2">
            <Cpu className="h-7 w-7 text-cyan-400" />
            Neural Model Training &amp; Orchestration
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Fine-tune YOLOv8 on CRDDC RDD2022 road defect annotations or train authenticity classifiers.
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left: Training Configuration Form */}
        <div className="lg:col-span-5 flex flex-col gap-5 rounded-2xl border border-white/10 bg-[#111C2E] p-6 shadow-xl">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider text-cyan-400 flex items-center gap-2">
            <Sliders className="h-4 w-4" />
            Hyperparameter Configuration
          </h3>

          <div className="flex flex-col gap-4 text-xs">
            {/* Model Target */}
            <div>
              <label className="text-slate-300 font-medium block mb-1.5">Target Architecture</label>
              <select
                value={modelType}
                onChange={(e) => setModelType(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-slate-900 p-2.5 text-white"
              >
                <option value="detection">YOLOv8n (Object Detection &bull; RDD2022)</option>
                <option value="authenticity">MobileNetV3 (Authenticity &bull; GenImage)</option>
              </select>
            </div>

            {/* Epochs Slider */}
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Epochs</span>
                <span className="font-mono text-cyan-400 font-bold">{epochs}</span>
              </div>
              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={epochs}
                onChange={(e) => setEpochs(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>

            {/* Batch Size */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Batch Size</label>
                <select
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="w-full rounded-lg border border-white/10 bg-slate-900 p-2 text-white"
                >
                  <option value={4}>4 (Low memory)</option>
                  <option value={8}>8 (Recommended CPU)</option>
                  <option value={16}>16 (Standard)</option>
                  <option value={32}>32 (GPU)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Image Size (px)</label>
                <select
                  value={imgSize}
                  onChange={(e) => setImgSize(Number(e.target.value))}
                  className="w-full rounded-lg border border-white/10 bg-slate-900 p-2 text-white"
                >
                  <option value={416}>416 px (Fast)</option>
                  <option value={640}>640 px (Standard)</option>
                  <option value={1024}>1024 px (High Res)</option>
                </select>
              </div>
            </div>

            {/* Learning Rate & Device */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Learning Rate</label>
                <input
                  type="number"
                  step="0.001"
                  value={learningRate}
                  onChange={(e) => setLearningRate(Number(e.target.value))}
                  className="w-full rounded-lg border border-white/10 bg-slate-900 p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Execution Hardware</label>
                <select
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-900 p-2 text-white font-mono"
                >
                  <option value="cpu">CPU (Active Machine)</option>
                  <option value="cuda">CUDA (If GPU attached)</option>
                </select>
              </div>
            </div>
          </div>

          <button
            onClick={startTraining}
            disabled={isStarting}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 py-3 text-sm font-bold text-slate-950 shadow-md shadow-cyan-500/20 hover:brightness-110 disabled:opacity-50"
          >
            <Play className="h-4 w-4 fill-slate-950" />
            {isStarting ? 'Submitting Job...' : 'Start Training Run'}
          </button>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Right: Live Training Console & Logs */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex h-full min-h-[460px] flex-col rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
                <Terminal className="h-4 w-4" />
                <span>Training Telemetry Output</span>
              </div>
              {jobStatus && (
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-mono text-cyan-300 uppercase">
                  Status: {jobStatus}
                </span>
              )}
            </div>

            <pre className="mt-4 flex-1 overflow-auto rounded-xl bg-[#0B1220] p-4 font-mono text-xs text-slate-300 leading-relaxed">
              {logs ||
                'No active training session in progress.\nSelect parameters and click "Start Training Run" to execute model fine-tuning.'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
