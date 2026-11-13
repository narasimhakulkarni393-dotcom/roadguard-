import { proxyBinary } from '@/lib/backend'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return proxyBinary(`/api/v1/analysis/${encodeURIComponent(id)}/original-image`)
}
