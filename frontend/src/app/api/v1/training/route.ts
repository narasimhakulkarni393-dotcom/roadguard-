import { proxyJson } from '@/lib/backend'

export async function GET(req: Request) {
  const query = new URL(req.url).search
  return proxyJson(`/api/v1/training${query}`)
}

export async function POST(req: Request) {
  const body = await req.text()
  return proxyJson('/api/v1/training/detection/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}
