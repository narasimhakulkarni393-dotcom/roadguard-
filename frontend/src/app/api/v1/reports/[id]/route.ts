import { NextResponse } from 'next/server'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await params
  const id = resolved.id

  const backendUrl = process.env.BACKEND_URL
  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl}/api/v1/reports/${id}`, { cache: 'no-store' })
      if (res.ok) return NextResponse.json(await res.json())
    } catch {}
  }

  return NextResponse.json({
    report_id: id,
    inspection_id: `insp-${id}`,
    generated_at: new Date().toISOString(),
    road_name: 'Metropolitan Corridor Sec-B',
    inspector: 'RoadGuard Autonomous Inspection System',
    overall_health: 'Fair to Poor',
    total_defects: 2,
    potholes_count: 1,
    cracks_count: 1,
    estimated_repair_cost_usd: 650,
    recommendations: [
      'Dispatch asphalt patching crew within 48 hours for High-severity pothole',
      'Crack seal longitudinal fissures to prevent winter moisture freeze-thaw cycles',
    ],
  })
}
