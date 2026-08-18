import { NextResponse } from 'next/server'
import {
  getUserRowByEmail, signToken, rateLimit, clientIp, publicUserWithHost,
  blockedAccountResponse, updatePassword,
} from '@/lib/local/auth'
import { verifyOtpCode, markEmailVerified, recordLogin } from '@/lib/local/db'
import { normalizeResetCode, normalizeResetEmail } from '@/lib/local/password-reset-core'
import { checkPassword, passwordProblemMessage } from '@/lib/local/password-policy'

// Step 2 of the guest password reset.
//   POST /api/auth/reset-password { email, code, password } → { token, user }
//
// Same contract as the backend route the mobile apps call: a correct code sets the
// new password AND signs the user in, so nobody has to type a just-chosen password
// again on the next screen.
//
// One deliberate side effect: the account is marked email-verified. Holding a code
// we mailed is exactly the proof the OTP gate asks for, and without this a user who
// never verified would reset their password only to be bounced to the OTP screen.
export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }

// One message for "no such account", "wrong code" and "expired code" — telling them
// apart would turn this endpoint into the account-existence oracle that
// /api/auth/forgot-password refuses to be.
const BAD_CODE = 'That code is invalid or has expired.'

export async function POST(req: Request) {
  try {
    const { email, code, password } = await req.json()
    if (!email || !code || !password) {
      return NextResponse.json({ error: 'Email, code and new password are required' }, { status: 400, headers: CORS })
    }
    const key = normalizeResetEmail(email)
    // Cap guessing: 10 attempts per 10 min per IP+email (verifyOtpCode caps the
    // code itself at 5 tries; this stops the surrounding retry loop).
    const wait = rateLimit(`resetpw:${clientIp(req)}:${key}`, 10, 10 * 60_000)
    if (wait) {
      return NextResponse.json(
        { error: `Too many attempts. Please try again in ${wait}s.` },
        { status: 429, headers: { ...CORS, 'Retry-After': String(wait) } }
      )
    }
    // Same policy as signup — a reset must not be the way around it.
    const weak = checkPassword(password, key)
    if (weak) {
      return NextResponse.json(
        { error: passwordProblemMessage(weak), passwordProblem: weak },
        { status: 400, headers: CORS }
      )
    }

    // Check the account BEFORE the code, so a blocked user doesn't burn a valid
    // one-time code discovering they can't get in (the same ordering as verify-otp).
    const row = await getUserRowByEmail(key)
    if (row) {
      const blocked = blockedAccountResponse(row.account_status, CORS)
      if (blocked) return blocked
    }
    const ok = await verifyOtpCode(key, normalizeResetCode(code))
    if (!ok || !row) {
      return NextResponse.json({ error: BAD_CODE }, { status: 400, headers: CORS })
    }

    await updatePassword(row.id, String(password))
    await markEmailVerified(row.email)

    const user = await publicUserWithHost({ ...row, email_verified: true })
    const token = signToken({ sub: user.id, email: user.email })
    // F1: the one activity event nothing else records. Best-effort —
    // never let telemetry stop a sign-in.
    await recordLogin(user.id, 'password', req)
    const res = NextResponse.json({ token, user }, { headers: CORS })
    res.cookies.set('qk_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 30 * 24 * 3600 })
    return res
  } catch (err) {
    console.error('reset-password failed:', err)
    return NextResponse.json({ error: 'Could not reset the password', detail: String(err) }, { status: 500, headers: CORS })
  }
}
