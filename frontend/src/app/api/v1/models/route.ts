import { proxyJson } from '@/lib/backend'

export async function GET() {
  return proxyJson('/api/v1/models')
}
