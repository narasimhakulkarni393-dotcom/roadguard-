import { proxyJson } from '@/lib/backend'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return proxyJson(`/api/v1/training/${encodeURIComponent(id)}/logs`)
}
