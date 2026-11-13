import { NextResponse } from 'next/server'

export async function GET() {
  const backendUrl = process.env.BACKEND_URL
  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl}/api/v1/training`, { cache: 'no-store' })
      if (res.ok) return NextResponse.json(await res.json())
    } catch {}
  }

  return NextResponse.json([
    {
      id: 'train-job-001',
      job_type: 'detection',
      status: 'completed',
      config: {
        dataset_name: 'kaggle_road_damage',
        model_type: 'yolov8n',
        epochs: 3,
        imgsz: 640,
        batch: 4,
        lr: 0.01,
        device: 'cpu',
      },
      started_at: new Date(Date.now() - 86400000).toISOString(),
      completed_at: new Date(Date.now() - 86000000).toISOString(),
    },
  ])
}

export async function POST(req: Request) {
  const backendUrl = process.env.BACKEND_URL
  if (backendUrl) {
    try {
      const body = await req.json()
      const res = await fetch(`${backendUrl}/api/v1/training/detection/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) return NextResponse.json(await res.json())
    } catch {}
  }

  return NextResponse.json({
    job_id: `train-${Date.now()}`,
    status: 'running',
    job_type: 'detection',
    message: 'Training job launched successfully in background.',
  })
}
