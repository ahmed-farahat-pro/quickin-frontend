// The GUEST's reservation status filter: which chips /reservations offers, which one
// a reservation sits behind, and the count each is badged with — pure, and
// DELIBERATELY free of runtime imports so `node --test` can load it as-is (see the
// note at the top of resort-core.ts, and README → Testing).
//
// The guest-side sibling of host-booking-filter-core.ts, and built the same way: the
// web renders the chip row from these rules, iOS and Android port them natively
// (ReservationFilter.swift / ReservationFilter.kt), and the counts come from one
// function so the three cannot disagree.
//
// WHAT THE GUEST NEEDS THAT THE HOST DOES NOT
// -------------------------------------------
// The two modules answer the same question for different readers, so they deliberately
// share their fold everywhere they can and part in exactly two places:
//
//   • "Payment under review" is a chip here, folded into "Awaiting payment" there. To
//     a host those are one to-do ("no money yet"); to the GUEST they are opposites —
//     one means "send the transfer", the other means "we have it, sit tight". A guest
//     shown "Awaiting payment" for a screenshot they already uploaded pays twice.
//   • "Completed" is a chip here, folded into "Confirmed" there. A guest's finished
//     stays are their trip history, which is a thing people go looking for; a host's
//     are just old rows.
//
// Everything else — the cancelled/refunded/partially-refunded split, the clamping, the
// unknown-status fallback — is the SAME rule as the host module, on purpose. A host
// and a guest looking at one reservation must never see it filed differently.
//
// The payment stage is passed IN rather than computed here, exactly as in the host
// module: deriving it means reading payment_status against the latest proof,
// `paymentStageFor` in payment-flow-core.ts is already the single source of truth for
// that, and this file cannot import it — a core module with a relative import is one
// `node --test` refuses to load. Callers hand us the stage; we never second-guess it.

/**
 * The bucket a reservation is shown under. One reservation is in exactly one bucket,
 * so the counts below always sum to the total.
 */
export type ReservationBucket =
  | 'pending'
  | 'awaiting_payment'
  | 'under_review'
  | 'confirmed'
  | 'completed'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'

/** A chip in the filter row: every bucket, plus the "All" catch-all. */
export type ReservationFilter = 'all' | ReservationBucket

/**
 * The chips, in display order — the guest's reservation lifecycle left to right:
 * waiting on the host, waiting on their own transfer, waiting on us, live, done, then
 * the ways a reservation ends. Mirrors HOST_BOOKING_FILTER_ORDER with the two
 * guest-only chips slotted into the same story.
 *
 * "Rejected" (the host declined) stays its own chip rather than folding into
 * "Cancelled", for the same reason it does on the host side: they are separate values
 * in the database, a host caused one and the guest the other, and StatusBadge has
 * always rendered them apart.
 */
export const RESERVATION_FILTER_ORDER: readonly ReservationFilter[] = [
  'all',
  'pending',
  'awaiting_payment',
  'under_review',
  'confirmed',
  'completed',
  'rejected',
  'cancelled',
  'refunded',
  'partially_refunded',
]

/** Every bucket that can be counted — the chip order minus the 'all' catch-all.
 *  Doubles as the guard that keeps a literal 'all' out of the tally below. */
const COUNTED_BUCKETS: readonly ReservationBucket[] = [
  'pending',
  'awaiting_payment',
  'under_review',
  'confirmed',
  'completed',
  'rejected',
  'cancelled',
  'refunded',
  'partially_refunded',
]

/**
 * The payment stage, as produced by `paymentStageFor` in payment-flow-core.ts.
 * Restated (not imported) for the reason at the top of this file; the two lists must
 * stay in step, which the unit tests assert.
 */
export type ReservationPaymentStage =
  | 'not_payable'
  | 'awaiting_payment'
  | 'under_review'
  | 'paid'
  | 'rejected'

/** What the fold needs to know about one reservation. */
export interface ReservationBucketInput {
  /** `bookings.status`. */
  status?: string | null
  /** The stage from `paymentStageFor(booking)` — never re-derived here. */
  paymentStage?: ReservationPaymentStage | null
  /** `bookings.refund_percent` (0–100), null when the booking was never cancelled. */
  refundPercent?: number | null
  /**
   * Whether money ever reached us — from `everPaid()` in payment-flow-core.ts, never
   * re-derived here and never guessed from `paymentStage` (which says `not_payable`
   * for everything cancelled, and so cannot answer this).
   *
   * REQUIRED, deliberately: an optional field would let a call site keep the bug by
   * saying nothing. Same field, same reason, as the host module.
   */
  wasPaid: boolean
}

/**
 * Which bucket a reservation belongs in.
 *
 * Order matters, and it is the guest's reading order:
 *
 *  1. Rejected and cancelled are terminal, so they are read BEFORE payment — a dead
 *     reservation must never surface under "Awaiting payment", which is a list of
 *     money the guest still owes.
 *  2. A cancellation splits three ways on the refund.
 *  3. `completed` is read before the payment split: the stay happened, and what its
 *     payment columns say now cannot change that.
 *  4. Everything still alive splits on the payment stage — and unlike the host module,
 *     `under_review` keeps its own bucket instead of folding into awaiting payment.
 *
 * An unrecognised status reads as PENDING rather than being dropped, matching the host
 * module. The column has no check constraint, and the failure modes are not symmetric:
 * a row that matches no chip is a reservation the guest never finds again, while one
 * under Pending is merely a row they glance at.
 */
export function reservationBucketFor(booking: ReservationBucketInput): ReservationBucket {
  const status = String(booking.status ?? '').trim().toLowerCase()

  if (status === 'rejected') return 'rejected'
  if (status === 'cancelled' || status === 'canceled') {
    return cancelledBucketFor(booking.refundPercent, booking.wasPaid)
  }
  // The stay happened. A completed booking is the guest's trip history whatever the
  // payment columns say now — and historical rows must not lose it retroactively.
  if (status === 'completed') return 'completed'
  if (status === 'confirmed') {
    if (booking.paymentStage === 'paid') return 'confirmed'
    // The guest has uploaded their transfer and is waiting on US. Telling them this is
    // "awaiting payment" is what makes people pay a second time.
    if (booking.paymentStage === 'under_review') return 'under_review'
    // 'awaiting_payment', 'rejected' (re-upload a clearer screenshot — still payable,
    // per canPay), and the 'not_payable' a confirmed booking should never reach.
    return 'awaiting_payment'
  }
  // 'pending', and anything the vocabulary does not cover.
  return 'pending'
}

/**
 * How a cancellation splits between Cancelled / Refunded / Partially refunded.
 *
 * Byte-for-byte the host module's rule, and that is the point — a host and a guest
 * looking at the same cancelled reservation must read the same word.
 *
 * `refund_percent` is written by cancelBooking from the listing's cancellation policy,
 * and it is a PERCENT OF THE TOTAL, not a flag — 100 means the whole stay came back,
 * 1–99 means the policy kept a slice, and 0 (the strict-policy or day-of-check-in
 * case) means nothing came back at all.
 *
 * A null percent is a cancellation from before the refund ladder shipped. It reads as
 * plain "Cancelled" — the honest answer, since no refund was recorded. Percents
 * outside 0–100 are clamped rather than trusted.
 *
 * `wasPaid` is asked FIRST, and it is the whole reason this is not a one-line read of
 * the column. `refund_percent` is stamped from the listing's cancellation policy the
 * moment a guest cancels, whether or not a single pound was ever paid — so a pending,
 * never-paid booking cancelled a fortnight out carries `refund_percent = 100`. Splitting
 * on the column alone told that guest their stay had been "Refunded".
 */
function cancelledBucketFor(refundPercent: number | null | undefined, wasPaid: boolean): ReservationBucket {
  // Nothing went out, so nothing came back — whatever the policy stamped on the way out.
  if (!wasPaid) return 'cancelled'
  if (refundPercent == null || !Number.isFinite(refundPercent)) return 'cancelled'
  const pct = Math.max(0, Math.min(100, refundPercent))
  if (pct >= 100) return 'refunded'
  if (pct > 0) return 'partially_refunded'
  return 'cancelled'
}

/** `true` when a reservation in `bucket` belongs behind the `filter` chip. */
export function reservationFilterMatches(filter: ReservationFilter, bucket: ReservationBucket): boolean {
  return filter === 'all' || filter === bucket
}

/**
 * How many reservations sit behind each chip.
 *
 * Every filter gets an entry, zeros included, so the caller cannot read an undefined
 * count off a chip. 'all' is the total; whether that number is worth showing is the
 * chip row's call, not this function's — every client renders "All" bare.
 */
export function reservationFilterCounts(
  buckets: readonly ReservationBucket[]
): Record<ReservationFilter, number> {
  const counts: Record<ReservationFilter, number> = {
    all: buckets.length,
    pending: 0,
    awaiting_payment: 0,
    under_review: 0,
    confirmed: 0,
    completed: 0,
    rejected: 0,
    cancelled: 0,
    refunded: 0,
    partially_refunded: 0,
  }
  for (const bucket of buckets) {
    if (COUNTED_BUCKETS.includes(bucket)) counts[bucket] += 1
  }
  return counts
}
