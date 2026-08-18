// Pure logic behind the guest password reset (/api/auth/forgot-password +
// /api/auth/reset-password). No runtime imports on purpose — that is what makes
// this module loadable from `node --test`. See README → Testing.

// The strength of the replacement password is NOT decided here — `checkPassword`
// in password-policy.ts is the single floor signup, reset and change all clear.
// This module cannot import it (a core module with imports stops loading under
// `node --test`), and a second copy of the rules is exactly how the floor drifts.

/** Reset codes are the same 6-digit OTPs signup and login already mail. */
export const RESET_CODE_LENGTH = 6

/** How long a mailed reset code stays usable (minutes) — passed to createOtpCode. */
export const RESET_CODE_TTL_MINUTES = 10

/** Seconds the client must wait before asking for another code. */
export const RESET_RESEND_COOLDOWN_SECONDS = 30

/** Lower-cased, trimmed — the shape every otp_codes / users lookup keys on. */
export function normalizeResetEmail(email: unknown): string {
  return String(email ?? '').trim().toLowerCase()
}

/**
 * Digits only, capped at the code length. Users paste codes out of mail clients
 * with spaces, hyphens and non-breaking spaces attached; none of that should read
 * as a wrong code.
 */
export function normalizeResetCode(code: unknown): string {
  return String(code ?? '').replace(/\D/g, '').slice(0, RESET_CODE_LENGTH)
}

/** True once the user has typed a full code — the gate on the submit button. */
export function isCompleteResetCode(code: unknown): boolean {
  return normalizeResetCode(code).length === RESET_CODE_LENGTH
}

/**
 * The body of a forgot-password reply.
 *
 * Always `{ sent: true }` — an unknown address, a real send and a delivery failure
 * are indistinguishable, so this endpoint can't be used to enumerate accounts.
 * `devCode` exists only for local development, where no mail relay is configured;
 * the moment delivery is live the code must never travel back over the response,
 * which is the invariant the unit test pins.
 */
export function forgotPasswordBody(opts: {
  accountExists: boolean
  delivered: boolean
  code?: string | null
  cooldown?: number
}): { sent: true; cooldown: number; devCode?: string } {
  const cooldown = opts.cooldown ?? RESET_RESEND_COOLDOWN_SECONDS
  const leakable = !opts.delivered && opts.accountExists && !!opts.code
  return leakable ? { sent: true, cooldown, devCode: String(opts.code) } : { sent: true, cooldown }
}
