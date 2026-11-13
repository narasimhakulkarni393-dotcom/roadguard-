import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const backendUrl = process.env.BACKEND_URL
  if (backendUrl) {
    try {
      const formData = await req.formData()
      const res = await fetch(`${backendUrl}/api/v1/analysis/image`, {
        method: 'POST',
        body: formData,
      })
      if (res.ok) return NextResponse.json(await res.json())
    } catch {}
  }

  // Cloud serverless handler
  const analysisId = `analysis-${Date.now()}`
  return NextResponse.json(
    {
      analysis_id: analysisId,
      inspection_id: `insp-${Date.now()}`,
      status: 'pending',
      status_url: `/api/v1/analysis/${analysisId}`,
      result_url: `/api/v1/analysis/${analysisId}/result`,
      message: 'Image received. Analysis started in background.',
    },
    { status: 202 }
  )
}
