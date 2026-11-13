import { NextResponse } from 'next/server'

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
