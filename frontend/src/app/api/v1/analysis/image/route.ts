import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
  if (backendUrl) {
    try {
      const formData = await req.formData()
      const res = await fetch(`${backendUrl}/api/v1/analysis/image`, {
        method: 'POST',
        body: formData,
      })
      if (res.ok) return NextResponse.json(await res.json(), { status: res.status })
      const errBody = await res.json().catch(() => ({}))
      return NextResponse.json(errBody, { status: res.status })
    } catch {}
  }

  return NextResponse.json(
    {
      detail:
        'RoadGuard AI Python backend is unreachable. Start the backend service at http://localhost:8000 or set BACKEND_URL.',
    },
    { status: 503 }
  )
}
