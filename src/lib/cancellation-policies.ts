// The three cancellation policies, for the host forms to offer.
//
// UI ONLY. The refund LADDER — what each policy actually pays back, and when —
// lives in quickin-backend's `cancellation-core.ts` and runs there. This app no
// longer computes refunds; it renders a choice and PATCHes it, and the backend
// re-normalises whatever arrives. Copying the maths over here is exactly the
// duplication the backend merge removed, so this file deliberately holds none of
// it: three strings and a fallback.
//
// The values must match the backend's `CANCELLATION_POLICIES`. They are a closed
// set written into the database as text and unchanged since the column existed;
// if a fourth is ever added, the API will reject anything this file invents, so
// the failure is loud rather than silent.

export type CancellationPolicy = 'flexible' | 'moderate' | 'strict'

/** Offered in this order — most to least generous. */
export const CANCELLATION_POLICIES: CancellationPolicy[] = ['flexible', 'moderate', 'strict']

/**
 * Read a value from the API into one of the three. Anything missing or
 * unrecognised is `moderate` — the database default, so a listing created before
 * the column existed and one whose host never touched the field both show the
 * same thing the backend would apply.
 */
export function toPolicy(value: unknown): CancellationPolicy {
  const v = String(value ?? '').toLowerCase().trim()
  return (CANCELLATION_POLICIES as string[]).includes(v) ? (v as CancellationPolicy) : 'moderate'
}
