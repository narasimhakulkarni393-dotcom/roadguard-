import { NextResponse } from 'next/server'

export async function GET() {
  const backendUrl = process.env.BACKEND_URL
  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl}/api/v1/inspections`, { cache: 'no-store' })
      if (res.ok) return NextResponse.json(await res.json())
    } catch {}
  }

  return NextResponse.json({
    total: 3,
    page: 1,
    page_size: 20,
    items: [
      {
        id: 'insp-101',
        created_at: new Date(Date.now() - 3600000).toISOString(),
        original_filename: 'urban_arterial_sec4.jpg',
        file_size: 1420500,
        status: 'completed',
        detections_count: 3,
        overall_severity: 'HIGH',
      },
      {
        id: 'insp-102',
        created_at: new Date(Date.now() - 7200000).toISOString(),
        original_filename: 'highway_km42_east.jpg',
        file_size: 2150300,
        status: 'completed',
        detections_count: 5,
        overall_severity: 'CRITICAL',
      },
    ],
  })
}
