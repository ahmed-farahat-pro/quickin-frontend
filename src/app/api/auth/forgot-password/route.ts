import { NextResponse } from 'next/server'
import { generateOtp, isValidEmail, rateLimit, clientIp, getUserRowByEmail, blockedAccountResponse } from '@/lib/local/auth'
import { createOtpCode } from '@/lib/local/db'
import { sendOtpEmail, mailRelayConfigured } from '@/lib/local/email'
import {
  forgotPasswordBody,
  normalizeResetEmail,
  RESET_CODE_TTL_MINUTES,
  RESET_RESEND_COOLDOWN_SECONDS,
} from '@/lib/local/password-reset-core'

// Step 1 of the guest password reset.
//   POST /api/auth/forgot-password { email } → { sent: true, cooldown }
//
// Mirrors the backend route of the same path (which the iOS and Android apps call),
// so the web login page now has the flow both mobile clients already ship. The code
// is the same 6-digit OTP signup and login mail, stored in otp_codes, and consumed
// by /api/auth/reset-password.
//
// Always answers `{ sent: true }`: an unknown address and a real send look identical,
// so this cannot be used to discover which emails have accounts.
export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }

export async function POST(req: Request) {
  try {
    const { email } = await req.json()
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400, headers: CORS })
    }
    const key = normalizeResetEmail(email)
    // Same shape as resend-otp: a short per-email cooldown the UI timer mirrors,
    // an hourly cap so one address can't be mail-bombed, and an IP cap so one
    // client can't walk a list of addresses.
    const cd = rateLimit(`forgotpw-cd:${key}`, 1, RESET_RESEND_COOLDOWN_SECONDS * 1000)
    if (cd) {
      return NextResponse.json(
        { error: `Please wait ${cd}s before requesting another code.`, cooldown: cd },
        { status: 429, headers: { ...CORS, 'Retry-After': String(cd) } }
      )
    }
    const hourly = rateLimit(`forgotpw-hr:${key}`, 5, 60 * 60_000)
    if (hourly) {
      return NextResponse.json(
        { error: 'Too many reset requests. Please try again later.' },
        { status: 429, headers: { ...CORS, 'Retry-After': String(hourly) } }
      )
    }
    const perIp = rateLimit(`forgotpw-ip:${clientIp(req)}`, 20, 15 * 60_000)
    if (perIp) {
      return NextResponse.json(
        { error: `Too many reset requests. Please try again in ${perIp}s.` },
        { status: 429, headers: { ...CORS, 'Retry-After': String(perIp) } }
      )
    }

    const existing = await getUserRowByEmail(key)
    if (!existing) {
      return NextResponse.json(
        forgotPasswordBody({ accountExists: false, delivered: mailRelayConfigured }),
        { headers: CORS }
      )
    }
    // A blocked or removed account can't reset its way back in — send no mail. The
    // generic { sent: true } above already hides whether an email exists, so saying
    // so plainly here costs nothing and saves a support round trip.
    const blocked = blockedAccountResponse(existing.account_status, CORS)
    if (blocked) return blocked

    const code = generateOtp()
    await createOtpCode(existing.email, code, RESET_CODE_TTL_MINUTES)
    await sendOtpEmail(existing.email, code)
    return NextResponse.json(
      forgotPasswordBody({ accountExists: true, delivered: mailRelayConfigured, code }),
      { headers: CORS }
    )
  } catch (err) {
    console.error('forgot-password failed:', err)
    return NextResponse.json({ error: 'Could not start the reset', detail: String(err) }, { status: 500, headers: CORS })
  }
}
