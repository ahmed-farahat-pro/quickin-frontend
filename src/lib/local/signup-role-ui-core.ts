// The web half of the role-aware signup (backend: signup-role-core.ts). A first
// signup — /signup, or /complete-account after a first Google sign-in — opens on
// Guest / Host cards (Guest preselected, so nobody has to choose) and then walks
// stepped pages:
//
//   guest: account → identity → refund (optional, skippable)
//   host:  account → identity → hosting → payout (required)
//
// /complete-account has no account step: Google already made the account.
// Everything is posted once, at the end; the server answers every step's bad
// fields in one `fields` map, and the page jumps back to the earliest step that
// owns one. This file decides which step owns which key and builds the role
// half of the body.
//
// Pure, no imports, so `node --test` can load it directly.

export type SignupRole = 'guest' | 'host'
export type SignupStep = 'account' | 'identity' | 'refund' | 'hosting' | 'payout'

/** Mirrors SIGNUP_STEPS in the backend's signup-role-core.ts. */
const STEPS: Readonly<Record<SignupRole, readonly SignupStep[]>> = {
  guest: ['account', 'identity', 'refund'],
  host: ['account', 'identity', 'hosting', 'payout'],
}

export const SIGNUP_HOST_TYPES = ['individual', 'company', 'brokerage'] as const
export type SignupHostType = (typeof SIGNUP_HOST_TYPES)[number]

/** sessionStorage key: the role picked before a Google sign-up, so the
 *  completion page opens on the same card. */
export const SIGNUP_ROLE_STORAGE_KEY = 'qk_signup_role'

export function normalizeRole(v: unknown): SignupRole {
  return v === 'host' ? 'host' : 'guest'
}

/** The pages this role walks. `withAccount: false` is /complete-account. */
export function signupSteps(role: SignupRole, withAccount = true): SignupStep[] {
  const steps = [...STEPS[role]]
  return withAccount ? steps : steps.filter((s) => s !== 'account')
}

/** Which page a server error key belongs to. */
export function stepForField(key: string): SignupStep {
  switch (key) {
    case 'phone':
    case 'doc_type':
    case 'id_number':
    case 'id_front':
    case 'id_back':
      return 'identity'
    case 'host_type':
    case 'address':
    case 'company':
    case 'notes':
    case 'terms':
      return 'hosting'
    case 'payout':
      return 'payout'
    case 'refund_method':
      return 'refund'
    default:
      return 'account'
  }
}

/**
 * Index (into `steps`) of the earliest page that owns one of `keys`, or -1 when
 * none of them belongs to a page shown here.
 */
export function firstStepWithError(steps: readonly SignupStep[], keys: Iterable<string>): number {
  let first = -1
  for (const key of keys) {
    const i = steps.indexOf(stepForField(key))
    if (i !== -1 && (first === -1 || i < first)) first = i
  }
  return first
}

export interface HostingValues {
  hostType: SignupHostType | ''
  address: string
  company: string
  notes: string
  termsAccepted: boolean
}

export const EMPTY_HOSTING: HostingValues = {
  hostType: '',
  address: '',
  company: '',
  notes: '',
  termsAccepted: false,
}

export type HostingField = 'host_type' | 'address' | 'terms'

/** The hosting page's own checks before Next — the server re-checks all of it. */
export function checkHosting(v: HostingValues): HostingField[] {
  const bad: HostingField[] = []
  if (!(SIGNUP_HOST_TYPES as readonly string[]).includes(v.hostType)) bad.push('host_type')
  if (!v.address.trim()) bad.push('address')
  if (!v.termsAccepted) bad.push('terms')
  return bad
}

/** A destination draft the user left blank — no method fields typed. */
export function isDestinationBlank(d: Record<string, unknown> | null | undefined): boolean {
  if (!d) return true
  return Object.entries(d).every(([k, v]) => k === 'method' || typeof v !== 'string' || v.trim() === '')
}

/**
 * The role half of the request body. A guest's refund destination is sent only
 * when it was not skipped and not blank; a host always sends hosting + payout.
 */
export function roleBody(
  role: SignupRole,
  hosting: HostingValues,
  destination: Record<string, unknown> | null,
  refundSkipped: boolean
): Record<string, unknown> {
  if (role === 'guest') {
    return !refundSkipped && !isDestinationBlank(destination)
      ? { role, refund_method: destination }
      : { role }
  }
  return {
    role,
    host_type: hosting.hostType,
    address: hosting.address.trim(),
    company: hosting.hostType === 'individual' ? '' : hosting.company.trim(),
    notes: hosting.notes.trim(),
    terms_accepted: hosting.termsAccepted,
    payout: destination,
  }
}
