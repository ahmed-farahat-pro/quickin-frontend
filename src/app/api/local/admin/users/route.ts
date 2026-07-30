import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/local/staff'
import { adminListUsers, adminActivateUser, adminDeleteUser, adminSetHost } from '@/lib/local/db'

// Admin (staff session + module permission): GET  → newest-first users with verification + counts.
//                    POST { id, action:'activate'|'delete' } → verify / delete user.
export const dynamic = 'force-dynamic'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }

export async function GET(req: Request) {
  const gate = await requireStaff(req, 'users')
  if ('error' in gate) return gate.error
  try {
    return NextResponse.json({ users: await adminListUsers() }, { headers: CORS })
  } catch (err) {
    console.error('admin users GET:', err)
    return NextResponse.json({ error: 'Failed to load' }, { status: 500, headers: CORS })
  }
}

export async function POST(req: Request) {
  const gate = await requireStaff(req, 'users')
  if ('error' in gate) return gate.error
  try {
    const body = await req.json().catch(() => null)
    const id = body?.id
    const action = body?.action
    const allowed = ['activate', 'delete', 'make-host', 'remove-host']
    if (!id || !allowed.includes(action)) {
      return NextResponse.json({ error: "id and action:'activate'|'delete'|'make-host'|'remove-host' required" }, { status: 400, headers: CORS })
    }
    if (action === 'delete') await adminDeleteUser(id)
    else if (action === 'make-host') await adminSetHost(id, true)
    else if (action === 'remove-host') await adminSetHost(id, false)
    else await adminActivateUser(id)
    return NextResponse.json({ ok: true }, { headers: CORS })
  } catch (err) {
    console.error('admin users POST:', err)
    return NextResponse.json({ error: 'Could not update user' }, { status: 500, headers: CORS })
  }
}
