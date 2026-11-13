import { proxyJson, proxyStream } from '@/lib/backend'

export async function GET(req: Request) {
  const query = new URL(req.url).search
  return proxyJson(`/api/v1/videos${query}`)
}

export async function POST(req: Request) {
  return proxyStream('/api/v1/videos/analyze', req)
}
