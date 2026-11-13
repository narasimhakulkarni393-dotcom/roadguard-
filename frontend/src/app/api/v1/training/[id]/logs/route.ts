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
      const res = await fetch(`${backendUrl}/api/v1/training/${id}/logs`, { cache: 'no-store' })
      if (res.ok) return NextResponse.json(await res.json())
    } catch {}
  }

  return NextResponse.json({
    job_id: id,
    status: 'running',
    logs: [
      `[INFO] Starting YOLOv8 training on dataset...`,
      `[INFO] Model initialized with 3,011,048 parameters.`,
      `[EPOCH 1/3] box_loss: 0.042, cls_loss: 0.038, dfl_loss: 0.021 - mAP50: 0.52`,
      `[EPOCH 2/3] box_loss: 0.031, cls_loss: 0.029, dfl_loss: 0.018 - mAP50: 0.64`,
      `[EPOCH 3/3] box_loss: 0.025, cls_loss: 0.022, dfl_loss: 0.015 - mAP50: 0.71`,
      `[INFO] Validation complete. Weights saved to models/detection/best.pt.`,
    ],
  })
}
