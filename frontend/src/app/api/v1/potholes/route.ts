import { proxyJson } from '@/lib/backend'

export async function GET(req: Request) {
  const query = new URL(req.url).search
  return proxyJson(`/api/v1/potholes${query}`)
}
