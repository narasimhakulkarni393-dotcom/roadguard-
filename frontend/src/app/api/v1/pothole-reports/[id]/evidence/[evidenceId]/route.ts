import { proxyBinary } from '@/lib/backend'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; evidenceId: string }> }
) {
  const { id, evidenceId } = await params
  return proxyBinary(
    `/api/v1/pothole-reports/${encodeURIComponent(id)}/evidence/${encodeURIComponent(evidenceId)}`
  )
}
