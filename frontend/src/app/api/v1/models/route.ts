import { NextResponse } from 'next/server'

export async function GET() {
  const backendUrl = process.env.BACKEND_URL
  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl}/api/v1/models`, { cache: 'no-store' })
      if (res.ok) return NextResponse.json(await res.json())
    } catch {}
  }

  return NextResponse.json({
    models: [
      {
        id: 'yolov8n-rdd-latest',
        name: 'RoadGuard YOLOv8n Multi-Defect Detector',
        task: 'road_damage_detection',
        classes: ['Pothole', 'Crack', 'Manhole'],
        format: 'PyTorch .pt',
        checkpoint_path: 'models/detection/best.pt',
        size_mb: 6.5,
        status: 'active_production',
        metrics: {
          mAP50: 0.71,
          precision: 0.74,
          recall: 0.68,
        },
      },
    ],
  })
}
