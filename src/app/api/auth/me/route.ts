import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, getUserRowByEmail, publicUserWithHost } from '@/lib/local/auth'
import { normalizeStatus } from '@/lib/local/user-admin-core'

export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }

// GET /api/auth/me — resolves the current user from a Bearer token or qk_token cookie.
// Returns the authoritative host fields (is_host, host_type, host_status,
// host_review_note) so a client can re-validate host state on every launch
// instead of trusting a cached flag.
export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization') || ''
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : null
    const cookieToken = (await cookies()).get('qk_token')?.value || null
    const token = bearer || cookieToken
    if (!token) return NextResponse.json({ user: null }, { headers: CORS })

    const claims = verifyToken(token)
    if (!claims) return NextResponse.json({ user: null }, { headers: CORS })

    const row = await getUserRowByEmail(claims.email)
    if (!row) return NextResponse.json({ user: null }, { headers: CORS })

    // This route resolves the token itself rather than going through
    // getUserFromRequest (it needs the full row for the host fields), so the
    // blocked/removed check has to be repeated here — otherwise a suspended user's
    // client keeps re-validating happily on every launch. `user: null` is the
    // existing "signed out" contract; accountStatus lets a client explain why.
    const status = normalizeStatus(row.account_status)
    if (status !== 'active') {
      return NextResponse.json({ user: null, accountStatus: status }, { headers: CORS })
    }

    return NextResponse.json({ user: await publicUserWithHost(row) }, { headers: CORS })
  } catch (err) {
    return NextResponse.json({ user: null, error: String(err) }, { status: 200, headers: CORS })
  }
}
