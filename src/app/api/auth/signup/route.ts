import { NextResponse } from 'next/server'
import {
  createUser, getUserRowByEmail, hashPassword, generateOtp,
  checkEmail, emailProblemMessage, rateLimit, clientIp, blockedAccountResponse,
} from '@/lib/local/auth'
import { createOtpCode } from '@/lib/local/db'
import { sendOtpEmail } from '@/lib/local/email'
import { checkPassword, passwordProblemMessage } from '@/lib/local/password-policy'
import { checkName, fallbackNameFromEmail, nameProblemMessage, normalizeName } from '@/lib/local/name-policy'

export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }

export async function POST(req: Request) {
  try {
    // Throttle signups: max 5 per minute per IP.
    const wait = rateLimit(`signup:${clientIp(req)}`, 5, 60_000)
    if (wait) {
      return NextResponse.json(
        { error: `Too many sign-up attempts. Please try again in ${wait}s.` },
        { status: 429, headers: { ...CORS, 'Retry-After': String(wait) } }
      )
    }
    const { email, password, full_name } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400, headers: CORS })
    }
    // Structure, a real TLD (`.con` is not one), then the disposable blocklist.
    // `emailProblem` is echoed so a client can localize the reason and offer the
    // did-you-mean without re-implementing the rules; `error` stays the plain
    // English sentence every existing client already renders.
    const problem = checkEmail(email)
    if (problem) {
      return NextResponse.json(
        { error: emailProblemMessage(problem), emailProblem: problem },
        { status: 400, headers: CORS }
      )
    }
    // The strength policy, decided here and nowhere else. `passwordProblem` is
    // echoed for the same reason `emailProblem` is: the form localizes the reason
    // and lights up the failing rule without re-implementing the rules.
    const weak = checkPassword(password, email)
    if (weak) {
      return NextResponse.json(
        { error: passwordProblemMessage(weak), passwordProblem: weak },
        { status: 400, headers: CORS }
      )
    }
    // The name, by the same rule the host application uses — `12345` used to
    // become a real display name, the one a host reads next to a booking request.
    // A client that sends no name at all is still let through (social sign-in
    // does): it falls back below. `nameProblem` is echoed so a client can
    // localize the reason, exactly like `emailProblem` and `passwordProblem`.
    const name = normalizeName(full_name)
    if (name) {
      const nameProblem = checkName(name)
      if (nameProblem) {
        return NextResponse.json(
          { error: nameProblemMessage(nameProblem), nameProblem },
          { status: 400, headers: CORS }
        )
      }
    }
    const existing = await getUserRowByEmail(email)
    if (existing) {
      // A blocked or removed account still holds this email. Say so plainly rather
      // than re-issuing a code (or 409-ing to a login that will also refuse) —
      // reinstating an account is an admin decision, not a re-registration.
      const blocked = blockedAccountResponse(existing.account_status, CORS)
      if (blocked) return blocked
      // Account exists but email was never OTP-verified → don't dead-end. Re-issue a
      // code and tell the client to jump to the OTP step (web + iOS + Android handle this).
      if (!existing.email_verified) {
        const code = generateOtp()
        await createOtpCode(existing.email, code)
        await sendOtpEmail(existing.email, code)
        return NextResponse.json(
          {
            pending: true,
            needsVerification: true,
            email: existing.email,
            message: 'This email is already registered but not verified yet — we sent you a new code.',
          },
          { headers: CORS }
        )
      }
      return NextResponse.json({ error: 'An account with this email already exists. Please log in.' }, { status: 409, headers: CORS })
    }
    const user = await createUser({
      email: String(email).trim(),
      passwordHash: hashPassword(String(password)),
      // No name sent → the local part of the address, which is guest input too:
      // `0100@gmail.com` would seed exactly the numeric-only name refused above.
      fullName: name || fallbackNameFromEmail(email),
    })
    // Email verification: send a 6-digit code; the session is issued by /verify-otp.
    const code = generateOtp()
    await createOtpCode(user.email, code)
    await sendOtpEmail(user.email, code)
    return NextResponse.json({ pending: true, email: user.email }, { headers: CORS })
  } catch (err) {
    console.error('signup failed:', err)
    return NextResponse.json({ error: 'Signup failed', detail: String(err) }, { status: 500, headers: CORS })
  }
}
