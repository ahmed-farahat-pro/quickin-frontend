// Signup identity on the web — the client half of quickin-backend's
// `signup-identity-core.ts`.
//
// Every account created from 2026-11-13 on gives a phone number and an identity
// document when it signs up (email signup: inside the form, before the OTP; a
// first Google sign-in: on the blocking /complete-account page). The backend owns
// the rule; every auth response and GET /api/auth/me carry its outcome as four
// fields, and this module is the one place the web reads them:
//   - `identity_complete: false` → hold the user on /complete-account;
//   - `verification_status: 'rejected'` (with `identity_required`) → show the
//     reason and a re-upload link, and expect bookings to be refused;
//   - a booking refused with `403 { code }` → switch on the code, never the text.
//
// It also mirrors the backend's document-number rule (id-change-core
// `normalizeDocumentNumber`) so the form can say what is wrong in the user's own
// language before the request goes out. The server still decides.
//
// No runtime imports, so `node --test` can import this file directly — see
// README → Testing.

/** Where an account that still owes its phone + ID is held. */
export const COMPLETE_ACCOUNT_PATH = '/complete-account'

/** Where a rejected document is replaced (POST /api/local/verification). */
export const ID_REUPLOAD_PATH = '/verify-id'

/** Same bounds as quickin-backend id-change-core. */
export const NATIONAL_ID_DIGITS = 14
export const MIN_DOCUMENT_NUMBER_CHARS = 5
export const MAX_DOCUMENT_NUMBER_CHARS = 24

/**
 * Budget for ONE compressed ID photo, in data-URL characters. Two of them ride in
 * the signup body with the text fields, and Vercel refuses a body over ~4.5 MB
 * before the route runs — so each photo gets well under half of that. The
 * server's own per-photo cap (3.5 MB) is looser; this is the one that bites.
 */
export const MAX_SIGNUP_ID_PHOTO_CHARS = 1_900_000

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected'

/** The identity fields every auth response's user object and /api/auth/me carry. */
export interface IdentityState {
  identity_required: boolean
  identity_complete: boolean
  verification_status: VerificationStatus
  verification_note: string | null
}

function status(v: unknown): VerificationStatus {
  const s = String(v ?? '').trim()
  return s === 'pending' || s === 'verified' || s === 'rejected' ? s : 'unverified'
}

/**
 * Read the identity fields off a user object. Absent fields mean an older backend
 * or an account that predates the requirement — both read as "nothing owed", so a
 * missing field can never lock anyone out.
 */
export function readIdentityState(user: unknown): IdentityState {
  const u = (user && typeof user === 'object' ? user : {}) as Record<string, unknown>
  const s = status(u.verification_status)
  const note = typeof u.verification_note === 'string' ? u.verification_note.trim() : ''
  return {
    identity_required: u.identity_required === true,
    identity_complete: u.identity_complete !== false,
    verification_status: s,
    verification_note: s === 'rejected' ? note || null : null,
  }
}

/** True only when the backend says this account still owes its phone + ID. */
export function needsAccountCompletion(user: unknown): boolean {
  if (!user || typeof user !== 'object') return false
  return (user as Record<string, unknown>).identity_complete === false
}

/** True when a rejected document must be replaced before the next booking. */
export function isIdentityRejected(user: unknown): boolean {
  const s = readIdentityState(user)
  return s.identity_required && s.verification_status === 'rejected'
}

/**
 * Whether the /verify-id upload asks for a selfie. Accounts created under the
 * signup identity rule gave front + back only at signup, so re-uploading a
 * rejected ID asks for the same — never a selfie they were not asked for before
 * (iOS and Android agree). While the user is still loading (`undefined`) the
 * selfie is not asked for, so the field never flashes in and out.
 */
export function selfieRequiredForIdUpload(user: unknown): boolean {
  if (user === undefined) return false
  return !readIdentityState(user).identity_required
}

/** Where to send someone who has just signed in or signed up. */
export function postAuthPath(user: unknown, fallback = '/explore'): string {
  return needsAccountCompletion(user) ? COMPLETE_ACCOUNT_PATH : fallback
}

/** Pages an account that owes its identity may still open: the completion page
 *  itself, the auth pages (to switch account), the legal pages it agrees to, the
 *  staff console (a separate session) and the help/contact page. */
const GATE_EXEMPT = [
  COMPLETE_ACCOUNT_PATH,
  '/login',
  '/signup',
  '/auth',
  '/terms',
  '/privacy',
  '/contact',
  '/delete-account',
  '/account/delete',
  '/ops',
]

/** Drop a leading `/en`-style segment, given the real locale list. */
function stripLocale(pathname: string, locales: readonly string[]): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return '/'
  if (!locales.includes(segments[0])) return pathname
  const rest = segments.slice(1).join('/')
  return rest ? `/${rest}` : '/'
}

/** True for a page the completion gate must NOT redirect away from. */
export function isIdentityGateExempt(pathname: string, locales: readonly string[]): boolean {
  const path = stripLocale(pathname || '/', locales)
  return GATE_EXEMPT.some((p) => path === p || path.startsWith(`${p}/`))
}

/** Why a document number was refused — each code has a localized message. */
export type DocumentNumberProblem =
  | 'required'
  | 'nationalIdDigits'
  | 'nationalIdLength'
  | 'documentChars'
  | 'documentLength'

/** Upper-cased, spaces and dashes removed — what the server stores. */
export function canonicalDocumentNumber(v: unknown): string {
  return String(v ?? '').toUpperCase().replace(/[\s-]+/g, '')
}

/** The same rule as the backend's `normalizeDocumentNumber`, as a problem code. */
export function checkDocumentNumber(v: unknown, docType: unknown): DocumentNumberProblem | null {
  const raw = canonicalDocumentNumber(v)
  if (!raw) return 'required'
  if (String(docType ?? '') === 'national_id') {
    if (!/^\d+$/.test(raw)) return 'nationalIdDigits'
    if (raw.length !== NATIONAL_ID_DIGITS) return 'nationalIdLength'
    return null
  }
  if (!/^[A-Z0-9]+$/.test(raw)) return 'documentChars'
  if (raw.length < MIN_DOCUMENT_NUMBER_CHARS || raw.length > MAX_DOCUMENT_NUMBER_CHARS) {
    return 'documentLength'
  }
  return null
}

/** The identity request-body fields the server can name in a 400's `fields`. */
export const IDENTITY_FIELDS = ['phone', 'doc_type', 'id_number', 'id_front', 'id_back'] as const
export type IdentityField = (typeof IDENTITY_FIELDS)[number]

/** Server message for a phone already on another account (signup-identity-core). */
export const PHONE_TAKEN_MESSAGE = 'This phone number is already used by another account'

/** Pick the identity entries out of a 400's `fields` map. */
export function identityFieldErrors(fields: unknown): Partial<Record<IdentityField, string>> {
  const out: Partial<Record<IdentityField, string>> = {}
  if (!fields || typeof fields !== 'object') return out
  const f = fields as Record<string, unknown>
  for (const key of IDENTITY_FIELDS) {
    if (typeof f[key] === 'string' && f[key]) out[key] = f[key] as string
  }
  return out
}

export type BookingIdentityBlock =
  | { kind: 'incomplete' }
  | { kind: 'rejected'; message: string }

/**
 * Was this booking response an identity refusal? Switches on `code` only — the
 * message is shown (it carries the rejection reason) but never parsed.
 */
export function bookingIdentityBlock(httpStatus: number, body: unknown): BookingIdentityBlock | null {
  if (httpStatus !== 403 || !body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (b.code === 'identity_incomplete') return { kind: 'incomplete' }
  if (b.code === 'identity_rejected') {
    return { kind: 'rejected', message: typeof b.error === 'string' ? b.error : '' }
  }
  return null
}
