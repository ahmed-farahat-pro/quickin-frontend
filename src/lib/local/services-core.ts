// Services, from both sides: which bucket a subscription request sits in, what
// state a host's own service is shown in, and what makes a new-service form
// submittable — pure, and DELIBERATELY free of runtime imports so `node --test`
// can load it as-is (see resort-core.ts, README → Testing).
//
// Services are the listings story in miniature: a host posts one, guests
// subscribe, the host confirms or declines, and the host can take it back off
// the market. The rules below are the ones the backend enforces on the write
// (lib/local/services.ts there); this module is what lets the web say the same
// things before the round-trip, and is shared by the host inbox, the host's own
// service cards and the guest's subscription list.

// ---- Subscription requests ---------------------------------------------------

/** The three buckets a request is ever shown in. Anything the backend adds
 *  later lands in 'pending' — see `serviceRequestBucket`. */
export type ServiceRequestBucket = 'pending' | 'confirmed' | 'rejected'

export const SERVICE_REQUEST_BUCKET_ORDER: readonly ServiceRequestBucket[] = [
  'pending',
  'confirmed',
  'rejected',
]

/**
 * Which bucket a request's raw status belongs to.
 *
 * An unrecognised status reads as 'pending' rather than being dropped: a row
 * the UI cannot classify is still a row the host has not answered, and hiding
 * it would lose a guest's request silently. Case-insensitive because the column
 * is free text on the wire.
 */
export function serviceRequestBucket(status: string | null | undefined): ServiceRequestBucket {
  const s = String(status ?? '').trim().toLowerCase()
  if (s === 'confirmed' || s === 'approved' || s === 'accepted') return 'confirmed'
  if (s === 'rejected' || s === 'declined' || s === 'cancelled') return 'rejected'
  return 'pending'
}

/** True when the host can still act on this request. Only pending ones carry
 *  Confirm / Decline — the backend refuses a second answer anyway. */
export function isActionableRequest(status: string | null | undefined): boolean {
  return serviceRequestBucket(status) === 'pending'
}

/** How many requests sit in each bucket, for the inbox's chips. Every bucket
 *  gets an entry so a chip cannot read an undefined count. */
export function serviceRequestCounts(
  statuses: readonly (string | null | undefined)[],
): Record<ServiceRequestBucket, number> {
  const counts: Record<ServiceRequestBucket, number> = { pending: 0, confirmed: 0, rejected: 0 }
  for (const status of statuses) counts[serviceRequestBucket(status)] += 1
  return counts
}

// ---- A host's own service ----------------------------------------------------

/** The state one of the host's services is shown in. */
export type HostServiceState = 'live' | 'deactivated' | 'blocked'

export interface HostServiceLike {
  is_published: boolean
  /** True when the HOST took it down. Absent on older rows. */
  unpublished_by_host?: boolean
}

/**
 * Whether this service is live, the host took it down, or someone else did.
 *
 * The distinction is the whole point: a host can undo their own deactivation
 * and cannot undo an operator's, so a single "unpublished" would either offer a
 * button that 403s or hide one that works. Same split as
 * `hostVisibilityState()` for listings, minus the moderation states — services
 * are not reviewed before they go live.
 *
 * An unpublished row with no `unpublished_by_host` flag is read as the host's
 * own doing: services predate the flag, every one of those was taken down by
 * its host, and the alternative strands them with no way back.
 */
export function hostServiceState(service: HostServiceLike): HostServiceState {
  if (service.is_published) return 'live'
  return service.unpublished_by_host === false ? 'blocked' : 'deactivated'
}

/** True when the host may flip this service's visibility themselves. */
export function canToggleService(service: HostServiceLike): boolean {
  return hostServiceState(service) !== 'blocked'
}

// ---- The new-service form ----------------------------------------------------

export const MAX_SERVICE_TITLE = 120
export const MAX_SERVICE_DESCRIPTION = 2000

export interface ServiceDraft {
  title: string
  price: string | number
  description?: string | null
  category?: string | null
  location?: string | null
}

/**
 * Why this draft cannot be posted, or null when it can. Returns a KEY — the
 * wording lives in the message catalogs, in four locales.
 *
 *   'title_required'  / 'title_long'
 *   'price_required'  — blank, or not a number
 *   'price_negative'  — below zero
 *   'description_long'
 *
 * A price of exactly 0 is allowed: a host offering a free welcome tour is a
 * real thing, and it is the NEGATIVE case the backend rejects. This mirrors the
 * seasonal-price rule in reverse — there, empty clears a rate and a typed 0 is
 * refused; here there is nothing to clear, so 0 is just a price.
 */
export function serviceDraftProblem(draft: ServiceDraft): string | null {
  const title = String(draft.title ?? '').trim()
  if (!title) return 'title_required'
  if (title.length > MAX_SERVICE_TITLE) return 'title_long'

  const raw = String(draft.price ?? '').trim()
  if (!raw) return 'price_required'
  const price = Number(raw)
  if (!Number.isFinite(price)) return 'price_required'
  if (price < 0) return 'price_negative'

  const description = String(draft.description ?? '').trim()
  if (description.length > MAX_SERVICE_DESCRIPTION) return 'description_long'

  return null
}

/** Convenience for the submit button's `disabled`. */
export function canSubmitService(draft: ServiceDraft): boolean {
  return serviceDraftProblem(draft) === null
}

/**
 * The body to POST to `/api/local/services`.
 *
 * Every optional text field collapses to null when blank, so the row holds
 * nulls rather than empty strings — the card renderers all branch on null, and
 * '' would slip past them and render an empty line.
 */
export function serviceBody(draft: ServiceDraft): {
  title: string
  price: number
  description: string | null
  category: string | null
  location: string | null
} {
  const orNull = (v: string | null | undefined) => {
    const s = String(v ?? '').trim()
    return s.length > 0 ? s : null
  }
  return {
    title: String(draft.title).trim(),
    price: Number(String(draft.price).trim()),
    description: orNull(draft.description),
    category: orNull(draft.category),
    location: orNull(draft.location),
  }
}

/**
 * What a guest is quoted for a host's service.
 *
 * Both projections already carry it, so this only picks the right field rather
 * than pricing anything:
 *   • host  (`/api/local/host/services`) — `price` is the host's RAW amount and
 *     `guest_price` is the quoted figure.
 *   • guest (`/api/local/services`)      — `price` IS the quoted figure; there
 *     is no `guest_price`, and the raw price is never served.
 *
 * Deliberately does NOT recompute from `commission_rate`. The markup is a
 * round-UP to the nearest 10 EGP that lives in the parity-guarded
 * commission-core (and its SQL twin, which is what actually priced these rows);
 * a second implementation here is the divergence that guard exists to prevent,
 * and a plain `price * (1 + rate)` would both skip the rounding and surface
 * binary-float artefacts — 100 x 1.1 is 110.00000000000001. `commission_rate`
 * stays on the wire for the "guests pay N% above your price" line, which is all
 * the host projection needs it for.
 */
export function guestFacingPrice(service: {
  price: number
  guest_price?: number
}): number {
  if (typeof service.guest_price === 'number' && Number.isFinite(service.guest_price)) {
    return service.guest_price
  }
  return Number(service.price) || 0
}
