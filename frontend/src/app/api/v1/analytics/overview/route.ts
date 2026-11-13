import { NextResponse } from 'next/server'

export async function GET() {
  const backendUrl = process.env.BACKEND_URL
  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl}/api/v1/analytics/overview`, { cache: 'no-store' })
      if (res.ok) return NextResponse.json(await res.json())
    } catch {}
  }

  return NextResponse.json({
    total_inspections: 128,
    completed_analyses: 124,
    total_detections: 342,
    potholes_detected: 156,
    cracks_detected: 186,
    high_priority_defects: 48,
    damage_distribution: {
      Pothole: 156,
      'Longitudinal Crack': 84,
      'Transverse Crack': 62,
      'Alligator Crack': 40,
    },
    severity_distribution: {
      LOW: 98,
      MODERATE: 142,
      HIGH: 74,
      CRITICAL: 28,
    },
    recent_inspections: [
      {
        id: 'demo-insp-001',
        filename: 'urban_arterial_sec4.jpg',
        created_at: new Date(Date.now() - 3600000).toISOString(),
        detections_count: 3,
        overall_severity: 'HIGH',
      },
      {
        id: 'demo-insp-002',
        filename: 'highway_km42_east.jpg',
        created_at: new Date(Date.now() - 7200000).toISOString(),
        detections_count: 5,
        overall_severity: 'CRITICAL',
      },
      {
        id: 'demo-insp-003',
        filename: 'suburban_lane_09.jpg',
        created_at: new Date(Date.now() - 14400000).toISOString(),
        detections_count: 2,
        overall_severity: 'MODERATE',
      },
    ],
  })
}
