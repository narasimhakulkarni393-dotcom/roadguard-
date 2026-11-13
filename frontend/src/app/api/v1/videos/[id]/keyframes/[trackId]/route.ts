import { proxyBinary } from '@/lib/backend'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; trackId: string }> }
) {
  const { id, trackId } = await params
  return proxyBinary(`/api/v1/videos/${encodeURIComponent(id)}/keyframes/${encodeURIComponent(trackId)}`)
}
