import { NextResponse } from 'next/server'
import { getBookingProof } from '@/lib/local/db'
import { getUserWithRole } from '@/lib/local/auth'

// GET /api/local/bookings/:id/payment-proof
//   → the latest transfer screenshot (base64), for the booking's guest, the
//     listing's host, or an admin. 404 if there's none / the caller isn't allowed.
// (Guests upload proofs via the backend / mobile app; the web only reads them.)
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
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
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
