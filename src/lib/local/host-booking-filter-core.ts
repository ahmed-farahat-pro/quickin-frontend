// The host reservations status filter: which chips exist, in what order, and
// which one a given reservation sits behind — pure, and DELIBERATELY free of
// runtime imports so `node --test` can load it as-is (see the note at the top of
// resort-core.ts, and README → Testing).
//
// The sibling of host-listing-filter-core.ts, and built the same way: the web
// renders the chip row from these rules, iOS and Android port them natively, and
// the counts come from one function so the three cannot disagree about how many
// reservations sit behind a chip.
//
// WHY THIS IS NOT JUST `b.status`
// -------------------------------
// `bookings.status` holds only five values (pending | confirmed | completed |
// rejected | cancelled). Three of the buckets a host actually thinks in are
// derived from OTHER columns:
//
//   • "Awaiting payment"     — status is confirmed but the money has not landed;
//                              that lives in bookings.payment_status + the latest
//                              payment_proofs row, which paymentStageFor() in
//                              payment-flow-core.ts already folds into a stage.
//   • "Refunded" /           — a cancellation carries bookings.refund_percent
//     "Partially refunded"     (0–100), set from the listing's cancellation
//                              policy at the moment the guest cancels.
//
// So the bucket is a function of (status, payment stage, refund percent), not of
// any single column. This module owns that fold, and NOTHING else re-derives it.
//
// The payment stage is passed IN rather than computed here on purpose: deriving
// it means reading payment_status against the latest proof, `paymentStageFor` is
// already the single source of truth for that, and this file cannot import it —
// a core module with a relative import is one `node --test` refuses to load.
// Callers hand us the stage; we never second-guess it.

/**
 * The bucket a reservation is shown under. One reservation is in exactly one
 * bucket, so the counts below always sum to the total.
 */
export type HostBookingBucket =
  | 'pending'
  | 'awaiting_payment'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'

/** A chip in the filter row: every bucket, plus the "All" catch-all. */
export type HostBookingFilter = 'all' | HostBookingBucket

/**
 * The chips, in display order — the host's reservation lifecycle left to right:
 * waiting on them, waiting on the guest's money, live, then the three ways a
 * reservation ends.
 *
 * "Rejected" (the host declined the request) is its own chip rather than being
 * folded into "Cancelled". They are separate values in the database, a host
 * caused one and a guest the other, and StatusBadge has always rendered them
 * apart — merging them here would make both counts lie.
 */
export const HOST_BOOKING_FILTER_ORDER: readonly HostBookingFilter[] = [
  'all',
  'pending',
  'awaiting_payment',
  'confirmed',
  'rejected',
  'cancelled',
  'refunded',
  'partially_refunded',
]

/** Every bucket that can be counted — the chip order minus the 'all' catch-all.
 *  Doubles as the guard that keeps a literal 'all' out of the tally below. */
const COUNTED_BUCKETS: readonly HostBookingBucket[] = [
  'pending',
  'awaiting_payment',
  'confirmed',
  'rejected',
  'cancelled',
  'refunded',
  'partially_refunded',
]

/**
 * The five values `bookings.status` is allowed to hold, mirrored from
 * BOOKING_STATUSES in the backend's admin.ts.
 *
 * The column is plain text with NO check constraint, so this list is advisory:
 * `hostBookingBucketFor` treats anything it does not recognise as pending
 * (see below) rather than dropping the row.
 */
export const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'completed',
  'rejected',
  'cancelled',
] as const
export type BookingStatus = (typeof BOOKING_STATUSES)[number]

/**
 * The payment stage, as produced by `paymentStageFor` in payment-flow-core.ts.
 * Restated (not imported) for the reason at the top of this file; the two lists
 * must stay in step, which the unit tests assert.
 */
export type HostBookingPaymentStage =
  | 'not_payable'
  | 'awaiting_payment'
  | 'under_review'
  | 'paid'
  | 'rejected'

/** What the fold needs to know about one reservation. */
export interface HostBookingBucketInput {
  /** `bookings.status`. */
  status?: string | null
  /** The stage from `paymentStageFor(booking)` — never re-derived here. */
  paymentStage?: HostBookingPaymentStage | null
  /** `bookings.refund_percent` (0–100), null when the booking was never cancelled. */
  refundPercent?: number | null
  /**
   * Whether money ever reached us — from `everPaid()` in payment-flow-core.ts, never
   * re-derived here and never guessed from `paymentStage` (which says `not_payable`
   * for everything cancelled, and so cannot answer this).
   *
   * REQUIRED, deliberately. It was added after a never-paid cancellation was found
   * filing under "Refunded", and an optional field would have let a call site keep
   * the bug by saying nothing.
   */
  wasPaid: boolean
}

/**
 * Which bucket a reservation belongs in.
 *
 * Order matters, and it is the host's reading order rather than the database's:
 *
 *  1. Pending wins outright — a request waiting on the host is the one thing
 *     they must act on, whatever its payment columns say.
 *  2. Rejected and cancelled are terminal, so they are read before payment: a
 *     dead reservation must never surface under "Awaiting payment", which is a
 *     to-do list for money that is still coming.
 *  3. A cancellation splits three ways on the refund (see below).
 *  4. Everything still alive splits on the payment stage: paid → Confirmed,
 *     anything else → Awaiting payment.
 *
 * `completed` folds into Confirmed. A completed stay is a confirmed one that has
 * finished; it is reachable only from confirmed, the guest has paid, and giving
 * finished stays their own chip was not part of what was asked for. If a "Past"
 * bucket is ever wanted, it splits off here and nowhere else.
 *
 * An unrecognised status reads as PENDING rather than being dropped. The column
 * has no check constraint, and the failure modes are not symmetric: a row that
 * vanishes from every chip is a reservation the host never learns about, while
 * one that shows up under Pending is merely a row they look at and dismiss.
 */
export function hostBookingBucketFor(booking: HostBookingBucketInput): HostBookingBucket {
  const status = String(booking.status ?? '').trim().toLowerCase()

  if (status === 'rejected') return 'rejected'
  if (status === 'cancelled' || status === 'canceled') {
    return cancelledBucketFor(booking.refundPercent, booking.wasPaid)
  }
  if (status === 'confirmed' || status === 'completed') {
    return booking.paymentStage === 'paid' ? 'confirmed' : 'awaiting_payment'
  }
  // 'pending', and anything the vocabulary does not cover.
  return 'pending'
}

/**
 * How a cancellation splits between Cancelled / Refunded / Partially refunded.
 *
 * `refund_percent` is written by cancelBooking from the listing's cancellation
 * policy, and it is a PERCENT OF THE TOTAL, not a flag — 100 means the whole
 * stay came back, 1–99 means the policy kept a slice, and 0 (the strict-policy
 * or day-of-check-in case) means nothing came back at all.
 *
 * A null percent is a cancellation from before the refund ladder shipped. It
 * reads as plain "Cancelled" — the honest answer, since no refund was recorded.
 * Percents outside 0–100 are clamped rather than trusted.
 *
 * `wasPaid` is asked FIRST, and it is the whole reason this is not a one-line read of
 * the column. `refund_percent` is stamped from the listing's cancellation policy the
 * moment a guest cancels, whether or not a single pound was ever paid — so a pending,
 * never-paid booking cancelled a fortnight out carries `refund_percent = 100`. Splitting
 * on the column alone called that "Refunded": money back that was never money in, shown
 * to the guest who never paid it and to the host who never received it.
 */
function cancelledBucketFor(refundPercent: number | null | undefined, wasPaid: boolean): HostBookingBucket {
  // Nothing went out, so nothing came back — whatever the policy stamped on the way out.
  if (!wasPaid) return 'cancelled'
  if (refundPercent == null || !Number.isFinite(refundPercent)) return 'cancelled'
  const pct = Math.max(0, Math.min(100, refundPercent))
  if (pct >= 100) return 'refunded'
  if (pct > 0) return 'partially_refunded'
  return 'cancelled'
}

/** `true` when a reservation in `bucket` belongs behind the `filter` chip. */
export function hostBookingFilterMatches(filter: HostBookingFilter, bucket: HostBookingBucket): boolean {
  return filter === 'all' || filter === bucket
}

/**
 * How many reservations sit behind each chip.
 *
 * Every filter gets an entry, zeros included, so the caller cannot read an
 * undefined count off a chip. 'all' is the total; whether that number is worth
 * showing is the chip row's call, not this function's — iOS renders "All" bare,
 * so the other clients do too.
 */
export function hostBookingFilterCounts(
  buckets: readonly HostBookingBucket[]
): Record<HostBookingFilter, number> {
  const counts: Record<HostBookingFilter, number> = {
    all: buckets.length,
    pending: 0,
    awaiting_payment: 0,
    confirmed: 0,
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
