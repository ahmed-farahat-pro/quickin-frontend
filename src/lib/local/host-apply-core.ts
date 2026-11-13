// The web "Become a host" form's rules (2026-11-13): same account, no re-typing.
//
// A guest already gave their name, phone and ID at signup, so the backend reads
// them from the profile (GET /api/local/host/application → `profile.missing`)
// and IGNORES whatever the form sends for them. The form shows those read-only
// and asks only for what the profile is missing. The application itself adds
// the host-only facts: host type, address, a payout destination (unless one is
// on file) and acceptance of the host terms.
//
// Mirrors quickin-backend's host-application-core. Pure, no relative imports,
// so `node --test` can load it directly.

/** The profile fields an application needs, in the order the form shows them. */
export const PROFILE_FIELDS = ['full_name', 'phone', 'national_id'] as const
export type ProfileField = (typeof PROFILE_FIELDS)[number]

/**
 * The profile fields the form must ask for. Unknown keys are dropped. With no
 * profile at all (the GET failed, or an older backend), every field is asked
 * for — the server still fills from the profile whatever it can, so asking too
 * much is safe where asking too little would be refused.
 */
export function profileFieldsToAsk(profile: { missing?: unknown } | null | undefined): ProfileField[] {
  if (!profile || !Array.isArray(profile.missing)) return [...PROFILE_FIELDS]
  const missing = new Set(profile.missing.map((v) => String(v)))
  return PROFILE_FIELDS.filter((f) => missing.has(f))
}

/** The payout fields a host types, i.e. the body of PUT /host/payout-method. */
export interface PayoutDraftLike {
  method: string
  account_name: string
  bank_name: string
  iban: string
  account_number: string
  swift_bic: string
  branch: string
  instapay_address: string
}

/** True when nothing but the method toggle has been touched. */
export function isPayoutDraftEmpty(d: PayoutDraftLike | null | undefined): boolean {
  if (!d) return true
  return (Object.keys(d) as Array<keyof PayoutDraftLike>)
    .filter((k) => k !== 'method')
    .every((k) => !String(d[k] ?? '').trim())
}

export interface HostApplyInput {
  /** From profileFieldsToAsk — only these profile fields are sent. */
  ask: readonly ProfileField[]
  values: Partial<Record<ProfileField, string>>
  hostType: 'individual' | 'company' | 'brokerage'
  address: string
  company: string
  notes: string
  termsAccepted: boolean
  /** Whether a payout method is already on file. */
  payoutOnFile: boolean
  /** The typed payout destination; sent when one is required or was entered. */
  payout: PayoutDraftLike | null
  /** ID documents — only when the applicant needs to upload them. */
  identityDocs: { doc_type: string; id_front: string | null; id_back: string | null } | null
}

/**
 * The POST /api/local/host/apply body. Profile fields the profile already holds
 * are left out (the server would ignore them anyway); company only travels for a
 * business; the payout object only when one is required or the applicant chose
 * to replace the one on file.
 */
export function buildHostApplyBody(input: HostApplyInput): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const f of input.ask) body[f] = String(input.values[f] ?? '').trim()
  body.host_type = input.hostType
  body.address = input.address.trim()
  const isBusiness = input.hostType === 'company' || input.hostType === 'brokerage'
  const company = input.company.trim()
  if (isBusiness && company) body.company = company
  const notes = input.notes.trim()
  if (notes) body.notes = notes
  body.terms_accepted = input.termsAccepted === true
  if (input.payout && (!input.payoutOnFile || !isPayoutDraftEmpty(input.payout))) {
    body.payout = { ...input.payout }
  }
  if (input.identityDocs) Object.assign(body, input.identityDocs)
  return body
}

/**
 * The client-side checks for the host-only facts, as server `fields` keys.
 * (Name/phone/ID are checked by the form against their own policies.)
 */
export function checkHostOnlyFields(input: {
  address: string
  termsAccepted: boolean
  payoutOnFile: boolean
  payout: PayoutDraftLike | null
}): Array<'address' | 'terms' | 'payout'> {
  const out: Array<'address' | 'terms' | 'payout'> = []
  if (!input.address.trim()) out.push('address')
  if (!input.payoutOnFile && isPayoutDraftEmpty(input.payout)) out.push('payout')
  if (!input.termsAccepted) out.push('terms')
  return out
}

/** Server `fields` keys → `hostApply` message keys. Anything unmapped falls back
 *  to the server's own text. full_name is localized from its policy code. */
export const APPLY_FIELD_ERROR_KEYS: Readonly<Record<string, string>> = {
  national_id: 'errors.nationalIdRequired',
  // A blank phone can't reach the server (the field is required and checked
  // first), so a server refusal here is always about the format.
  phone: 'errors.phoneInvalid',
  address: 'errors.addressRequired',
  host_type: 'errors.hostTypeInvalid',
  terms: 'errors.termsRequired',
  payout: 'errors.payoutInvalid',
}
