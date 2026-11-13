import { proxyJson } from '@/lib/backend'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.text()
  return proxyJson(`/api/v1/pothole-reports/${encodeURIComponent(id)}/location`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}
