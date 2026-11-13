import { proxyJson } from '@/lib/backend'

export async function POST(req: Request) {
  const body = await req.text()
  return proxyJson('/api/v1/datasets/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}
