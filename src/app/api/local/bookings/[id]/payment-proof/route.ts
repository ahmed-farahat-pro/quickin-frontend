import { NextResponse } from 'next/server'
import { getBookingProof, submitPaymentProof } from '@/lib/local/db'
import { getUserWithRole, getUserFromRequest } from '@/lib/local/auth'
import { PaymentProofError } from '@/lib/local/payment-flow-core'

// GET /api/local/bookings/:id/payment-proof
//   → the latest transfer screenshot (base64), for the booking's guest, the
//     listing's host, or an admin. 404 if there's none / the caller isn't allowed.
// POST /api/local/bookings/:id/payment-proof { image, method? }
//   → the guest submits their transfer screenshot. This route was GET-only, which is
//     why a payment started on the website could never be completed — the upload
//     existed on mobile alone. Writes payment_status='submitted', i.e. pending
//     confirmation, for an admin to accept or reject in /ops.
export const dynamic = 'force-dynamic'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
  })
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserWithRole(req)
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401, headers: CORS })
    const { id } = await params
    const proof = await getBookingProof(id, user)
    if (!proof) return NextResponse.json({ error: 'No payment screenshot found' }, { status: 404, headers: CORS })
    return NextResponse.json(proof, { headers: CORS })
  } catch (err) {
    console.error('GET /api/local/bookings/[id]/payment-proof failed:', err)
    return NextResponse.json({ error: 'Failed to load screenshot', detail: String(err) }, { status: 500, headers: CORS })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401, headers: CORS })
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const image = body?.image ?? body?.payment_proof ?? body?.proof
    const booking = await submitPaymentProof(id, user.id, image, body?.method ?? 'instapay')
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404, headers: CORS })
    return NextResponse.json({ ok: true, booking }, { headers: CORS })
  } catch (err) {
    // PaymentProofError carries a message written for the guest — pass it through.
    if (err instanceof PaymentProofError) {
      return NextResponse.json({ error: err.message }, { status: 400, headers: CORS })
    }
    console.error('POST /api/local/bookings/[id]/payment-proof failed:', err)
    return NextResponse.json({ error: 'Could not submit your screenshot' }, { status: 500, headers: CORS })
  }
}
