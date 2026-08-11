import { NextResponse } from 'next/server'
import { getUserRowByEmail, verifyPassword, signToken, rateLimit, clientIp, publicUserWithHost, generateOtp, blockedAccountResponse } from '@/lib/local/auth'
import { createOtpCode, recordLogin } from '@/lib/local/db'
import { sendOtpEmail } from '@/lib/local/email'

export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400, headers: CORS })
    }
    // Throttle brute-force: max 10 attempts per 5 min per IP+email.
    const wait = rateLimit(`login:${clientIp(req)}:${String(email).toLowerCase().trim()}`, 10, 5 * 60_000)
    if (wait) {
      return NextResponse.json(
        { error: `Too many login attempts. Please try again in ${wait}s.` },
        { status: 429, headers: { ...CORS, 'Retry-After': String(wait) } }
      )
    }
    const row = await getUserRowByEmail(String(email).trim())
    if (!row || !verifyPassword(String(password), row.password_hash)) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401, headers: CORS })
    }
    // Blocked / removed → stop here. AFTER the password check, so this never tells a
    // stranger which emails are suspended; BEFORE the email_verified branch, so a
    // blocked account triggers no OTP mail and isn't sent to the verification screen
    // it could never get past.
    const blocked = blockedAccountResponse(row.account_status, CORS)
    if (blocked) return blocked
    // Correct password, but the email was never OTP-verified → force verification.
    // Re-issue a fresh code; clients (web/iOS/Android) route to the OTP screen on this.
    if (!row.email_verified) {
      const code = generateOtp()
      await createOtpCode(row.email, code)
      const emailSent = await sendOtpEmail(row.email, code)
      let devCode: string | undefined
      if (!emailSent) {
        await createOtpCode(row.email, '123456')
        devCode = '123456'
      }
      return NextResponse.json(
        { needsVerification: true, email: row.email, error: 'Please verify your email to continue — we sent you a new code.', ...(devCode ? { devCode } : {}) },
        { status: 403, headers: CORS }
      )
    }
    const user = await publicUserWithHost(row)
    const token = signToken({ sub: user.id, email: user.email })
    // F1: the one activity event nothing else records. Best-effort —
    // never let telemetry stop a sign-in.
    await recordLogin(user.id, 'password', req)
    const res = NextResponse.json({ token, user }, { headers: CORS })
    res.cookies.set('qk_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 30 * 24 * 3600 })
    return res
  } catch (err) {
    console.error('login failed:', err)
    return NextResponse.json({ error: 'Login failed', detail: String(err) }, { status: 500, headers: CORS })
  }
}
