// Same-origin proxy for the AI travel concierge stream.
//
// The browser talks to THIS route (same origin → no CORS / no preflight), and we
// pipe the backend's Server-Sent-Events stream straight through unbuffered. This
// is more robust than hitting the cross-origin backend directly from the browser
// (some environments stall cross-origin streaming fetches) and keeps the backend
// URL server-side. Contract is identical: POST { messages } -> SSE of
// data: {"delta":...} ... data: [DONE].
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BACKEND = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000'

export async function POST(req: Request) {
  const body = await req.text()
  let upstream: Response
  try {
    upstream = await fetch(`${BACKEND}/api/local/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: `Upstream unreachable: ${String(err)}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Pass non-2xx (e.g. 503 when the key isn't set) straight through as JSON.
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '')
    return new Response(text || JSON.stringify({ error: 'AI request failed' }), {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    })
  }

  // Stream the SSE body through unchanged.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
