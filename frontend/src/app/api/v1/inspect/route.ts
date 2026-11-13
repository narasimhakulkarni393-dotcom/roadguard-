import { proxyFormData } from '@/lib/backend'

export async function POST(req: Request) {
  const formData = await req.formData()
  return proxyFormData('/api/v1/inspect', formData)
}
