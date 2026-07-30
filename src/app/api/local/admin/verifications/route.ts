import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/local/staff'
import { getPendingVerifications, reviewVerification } from '@/lib/local/db'

// Admin (staff session + module permission): GET  → pending ID verifications.
//                    POST { id, action: 'verify'|'reject', note? } → decide.
export const dynamic = 'force-dynamic'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }

export async function GET(req: Request) {
  const gate = await requireStaff(req, 'verifications')
  if ('error' in gate) return gate.error
  try {
    return NextResponse.json({ verifications: await getPendingVerifications() }, { headers: CORS })
  } catch (err) {
    console.error('admin verifications GET:', err)
    return NextResponse.json({ error: 'Failed to load' }, { status: 500, headers: CORS })
  }
}

export async function POST(req: Request) {
  const gate = await requireStaff(req, 'verifications')
  if ('error' in gate) return gate.error
  try {
    const body = await req.json().catch(() => null)
    const id = body?.id
    const action = body?.action === 'verify' ? 'verify' : body?.action === 'reject' ? 'reject' : null
    if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400, headers: CORS })
    await reviewVerification(id, action, body?.note ?? null)
    return NextResponse.json({ ok: true }, { headers: CORS })
  } catch (err) {
    console.error('admin verifications POST:', err)
    return NextResponse.json({ error: 'Could not update' }, { status: 500, headers: CORS })
  }
}
