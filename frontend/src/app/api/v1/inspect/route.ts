import { NextResponse } from 'next/server'

const EXPECTED_KEY = process.env.ROADGUARD_API_KEY || 'roadguard-production-api-key-2026'

export async function POST(req: Request) {
  // Check authorization header
  const authHeader = req.headers.get('authorization') || ''
  const apiKeyHeader = req.headers.get('x-api-key') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || apiKeyHeader.trim()

  if (!token) {
    return NextResponse.json(
      { detail: "Authentication required. Provide 'Authorization: Bearer <API_KEY>' or 'X-API-Key' header." },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
    )
  }

  if (token !== EXPECTED_KEY) {
    return NextResponse.json(
      { detail: 'Invalid API key provided.' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
    )
  }

  // Forward to remote backend if BACKEND_URL configured
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
  if (backendUrl) {
    try {
      const formData = await req.formData()
      const res = await fetch(`${backendUrl}/api/v1/inspect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (res.ok) return NextResponse.json(await res.json())
      const errBody = await res.json().catch(() => ({}))
      return NextResponse.json(errBody, { status: res.status })
    } catch {}
  }

  // Return honest model-unavailable response without fabricating detections
  return NextResponse.json(
    {
      success: false,
      pipeline_status: 'needs_model',
      stage: 'damage_detection',
      message:
        'RoadGuard AI Python backend is unreachable. Start the backend service to run genuine YOLOv8 computer vision model inference.',
      detections: [],
    },
    { status: 503 }
  )
}
