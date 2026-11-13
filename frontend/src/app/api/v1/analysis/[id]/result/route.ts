import { NextResponse } from 'next/server'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await params
  const id = resolved.id

  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl}/api/v1/analysis/${id}/result`, { cache: 'no-store' })
      if (res.ok || res.status === 202) return NextResponse.json(await res.json(), { status: res.status })
    } catch (e) {
      // Backend not reachable
    }
  }

  // Honest reporting: do not fabricate mock detections when model backend is unreachable
  return NextResponse.json(
    {
      analysis_id: id,
      inspection_id: `insp-${id}`,
      status: 'needs_model',
      pipeline_status: 'needs_model',
      pipeline_stage: 'backend_offline',
      model_ready: false,
      message:
        'RoadGuard AI Python backend is not reachable. Connect the backend service with trained YOLO weights to perform live image-dependent inference.',
      detections: [],
    },
    { status: 503 }
  )
}
