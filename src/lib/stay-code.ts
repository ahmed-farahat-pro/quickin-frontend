// Reservation-code helpers shared by the server (lib/local/db.ts) and the
// browser (the guest pass card, the host stay-guide editor). No `pg` and no node
// built-ins live here, so a client component can import it.
//
// Background: a reservation only gets a code when it is CONFIRMED, so "no code"
// is a normal state, not an error — and a client that turns a missing code into
// a link produces `/stay/null`, which is exactly the bug guests reported.
//
// A code is only HALF the gate. Whether the pass is live is `isLiveStayPass` in
// lib/local/payment-flow-core.ts (confirmed AND paid, or completed) — the code
// exists from host approval onward, well before any money arrives.

/**
 * Normalise a reservation code coming from a URL, a QR scan or an API payload.
 * Returns null for anything that is not a plausible code, including the empty
 * string and the literal "null"/"undefined" strings (Android's
 * `JSONObject.optString` hands back "null" for a JSON null). Treat null as
 * "there is no code": don't look it up, don't build a link from it.
 */
export function normalizeReservationCode(raw: unknown): string | null {
  const code = String(raw ?? '').trim().toUpperCase()
  if (!code || code === 'NULL' || code === 'UNDEFINED') return null
  if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(code)) return null
  return code
}

/**
 * THE one definition of "this pass is still live" lives in
 * `lib/local/payment-flow-core.ts` as `isLiveStayPass`, because the rule needs
 * the payment columns as well as the status — import that, not this.
 *
 * This function is the STATUS HALF only, kept for the places that genuinely
 * have nothing but a status string. It is NOT the pass gate: `confirmed` means
 * the host accepted the request, and the guest pays afterwards, so a booking can
 * be `confirmed` (with a reservation code already minted) and still owe every
 * piastre. Gating a QR on this alone is what handed hosts and guests a working
 * pass for an unpaid stay.
 */
export function isLiveStayStatus(status: string | null | undefined): boolean {
  return status === 'confirmed' || status === 'completed'
}

/**
 * The ONE place the web builds a link to a stay pass. Returns null when there is
 * no usable code, so every caller renders nothing rather than a broken link.
 * `locale` is optional — the app's proxy redirects an unprefixed /stay/<code> to
 * the viewer's locale anyway.
 */
export function stayPassPath(code: unknown, locale?: string): string | null {
  const c = normalizeReservationCode(code)
  if (!c) return null
  const prefix = locale ? `/${locale}` : ''
  return `${prefix}/stay/${encodeURIComponent(c)}`
}
