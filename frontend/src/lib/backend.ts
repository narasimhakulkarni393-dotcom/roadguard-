import { NextResponse } from 'next/server'

/**
 * Server-only backend bridge. The API key lives in the Next.js server
 * environment and is never exposed to the browser bundle.
 */
export const BACKEND_URL = (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:8000'
).replace(/\/$/, '')

export const BACKEND_API_KEY = (process.env.ROADGUARD_API_KEY || '').trim()

export function backendAuthHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra)
  if (BACKEND_API_KEY) headers.set('Authorization', `Bearer ${BACKEND_API_KEY}`)
  return headers
}

export function configurationError(): NextResponse | null {
  if (!BACKEND_API_KEY) {
    return NextResponse.json(
      {
        detail:
          'Server is not configured. Set ROADGUARD_API_KEY in the frontend server environment (never NEXT_PUBLIC_*).',
      },
      { status: 503 }
    )
  }
  return null
}

function unreachable(): NextResponse {
  return NextResponse.json(
    { detail: `Backend unreachable at ${BACKEND_URL}. Start the FastAPI service or set BACKEND_URL.` },
    { status: 503 }
  )
}

async function toNextResponse(res: Response): Promise<NextResponse> {
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 })
  }
  const text = await res.text()
  let body: unknown = {}
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = { detail: text }
    }
  }
  return NextResponse.json(body, { status: res.status })
}

export async function proxyJson(
  path: string,
  init?: RequestInit,
  { requiresKey = true }: { requiresKey?: boolean } = {}
): Promise<NextResponse> {
  if (requiresKey) {
    const notConfigured = configurationError()
    if (notConfigured) return notConfigured
  }
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      headers: backendAuthHeaders(init?.headers),
      cache: 'no-store',
    })
    return toNextResponse(res)
  } catch {
    return unreachable()
  }
}

export async function proxyFormData(
  path: string,
  formData: FormData,
  { method = 'POST', headers }: { method?: string; headers?: HeadersInit } = {}
): Promise<NextResponse> {
  const notConfigured = configurationError()
  if (notConfigured) return notConfigured
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method,
      // Never set Content-Type manually: fetch must add the multipart boundary.
      headers: backendAuthHeaders(headers),
      body: formData,
      cache: 'no-store',
    })
    return toNextResponse(res)
  } catch {
    return unreachable()
  }
}

/**
 * Streams the incoming request body to the backend without buffering it in
 * memory. Used for video and multipart uploads that can be hundreds of MB.
 */
export async function proxyStream(
  path: string,
  req: Request,
  { method = 'POST', headers }: { method?: string; headers?: HeadersInit } = {}
): Promise<NextResponse> {
  const notConfigured = configurationError()
  if (notConfigured) return notConfigured
  const forwarded = backendAuthHeaders(headers)
  const contentType = req.headers.get('content-type')
  if (contentType) forwarded.set('Content-Type', contentType)
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: forwarded,
      body: req.body,
      cache: 'no-store',
      // Required by Node/undici when sending a streaming request body.
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    return toNextResponse(res)
  } catch {
    return unreachable()
  }
}

export async function proxyBinary(path: string): Promise<NextResponse> {
  const notConfigured = configurationError()
  if (notConfigured) return notConfigured
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      headers: backendAuthHeaders(),
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text()
      let detail: unknown = text
      try {
        detail = JSON.parse(text)
      } catch {
        // keep raw text
      }
      return NextResponse.json({ detail }, { status: res.status })
    }
    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return unreachable()
  }
}
