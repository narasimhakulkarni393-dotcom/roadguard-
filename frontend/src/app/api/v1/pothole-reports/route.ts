import { proxyJson, proxyStream } from '@/lib/backend'

export async function GET(req: Request) {
  const query = new URL(req.url).search
  return proxyJson(`/api/v1/pothole-reports${query}`)
}

export async function POST(req: Request) {
  const idempotencyKey = req.headers.get('idempotency-key')
  return proxyStream('/api/v1/pothole-reports', req, {
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  })
}
