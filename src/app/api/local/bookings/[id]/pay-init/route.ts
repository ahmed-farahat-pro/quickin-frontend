import { NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/local/auth'
import { payBooking } from '@/lib/local/db'

// POST /api/local/bookings/:id/pay-init — start payment for an APPROVED booking.
//
// ARCHITECTURE: the quickin-backend project is the single owner of Paymob (keys,
// Intention API, webhook = source of truth). This route is a thin SAME-ORIGIN proxy:
// the browser can't call the backend directly (the qk_token cookie is httpOnly and
// scoped to this domain), so we read the caller's token here and forward it as a
// Bearer to the backend's own pay-init. Both projects share AUTH_SECRET + the Neon DB,
// so the backend authenticates the same user and settles the same booking row.
//
// Client contract is unchanged: read `checkout_url` if present (hand off to Paymob),
// otherwise the booking was mock-settled (local dev with no backend) → just refresh.
export const dynamic = 'force-dynamic'

// Backend base URL (e.g. https://quickin-backend.vercel.app). Unset → local mock.
const BACKEND_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '')
const isLocalBackend = /^https?:\/\/(127\.0\.0\.1|localhost)\b/i.test(BACKEND_BASE)

/** Pull the caller's auth token (Bearer header or qk_token cookie) to forward upstream. */
function callerToken(req: Request): string | null {
  const auth = req.headers.get('authorization') || ''
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)qk_token=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const me = await getUserFromRequest(req)
  if (!me) return NextResponse.json({ error: 'Please sign in to pay' }, { status: 401 })

  // No backend configured (pure local frontend dev) → mock-settle so the flow completes.
  if (!BACKEND_BASE) return mockSettle(id, me.id)

  const token = callerToken(req)
  if (!token) return NextResponse.json({ error: 'Please sign in to pay' }, { status: 401 })

  // Where Paymob should send the browser back after checkout (the backend allowlists this).
  const redirectUrl = `${new URL(req.url).origin}/reservations?paid=1`

  try {
    const upstream = await fetch(`${BACKEND_BASE}/api/local/bookings/${encodeURIComponent(id)}/pay-init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ redirect_url: redirectUrl }),
      cache: 'no-store',
    })
    const data = await upstream.json().catch(() => ({}))
    return NextResponse.json(data, { status: upstream.status })
  } catch (err) {
    // Backend unreachable. In local dev fall back to the mock; in prod surface the error.
    if (isLocalBackend) return mockSettle(id, me.id)
    console.error('pay-init proxy failed:', err)
    return NextResponse.json({ error: 'Payment service unavailable' }, { status: 502 })
  }
}

/** Local-only settlement used when no real backend is configured (keeps dev usable). */
async function mockSettle(bookingId: string, userId: string) {
  try {
    const { booking } = await payBooking({ userId, bookingId, method: 'card' })
    return NextResponse.json({ ok: true, mode: 'mock', paid: true, booking })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not complete payment'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
