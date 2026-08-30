// Reading a host's earnings rows: what state each payout is in, and what the
// platform's cut actually came to — pure, and DELIBERATELY free of runtime
// imports so `node --test` can load it as-is (see resort-core.ts, README →
// Testing).
//
// The wire only carries two statuses ('paid_out' | 'upcoming') because shipped
// mobile decoders switch on that field and a third value would break them. A
// cancellation the host kept money on therefore arrives as 'paid_out' with
// `cancelled: true` — true to the money, useless as a label, since "Paid out"
// on a stay that will never happen reads as a bug. `earningsRowState` folds the
// flags back into the five states a host can actually be told apart, and every
// surface renders from it rather than re-reading the columns.

/** One row of `GET /api/local/host/earnings` → `recent`. */
export interface EarningsRowLike {
  status: 'paid_out' | 'upcoming' | string
  cancelled?: boolean
  /** 0–100. Only ever non-zero on a refund. */
  refund_percent?: number | null
}

/**
 * The five states a payout row is shown in.
 *
 *   paid_out            — the stay happened and the money is settled
 *   upcoming            — approved and paid, waiting on the stay
 *   refunded            — cancelled, the guest got everything back (host: 0)
 *   partially_refunded  — cancelled, the guest got some back, host kept the rest
 *   cancelled_kept      — cancelled with no refund at all; the host kept it whole
 */
export type EarningsRowState =
  | 'paid_out'
  | 'upcoming'
  | 'refunded'
  | 'partially_refunded'
  | 'cancelled_kept'

/** How much of the guest's money went back on this row, clamped to 0–100.
 *  A null/absent/NaN percent means "never refunded", not "unknown". */
export function refundPercentOf(row: EarningsRowLike): number {
  const raw = row.refund_percent
  if (raw === null || raw === undefined) return 0
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

/**
 * Which of the five states this row sits in.
 *
 * Cancellation wins over the wire status, because the wire status of a
 * cancelled row is 'paid_out' whether or not anything was refunded — see the
 * note at the top. An unrecognised status is read as 'upcoming': the safe
 * direction, since telling a host money has settled when it has not is the
 * worse of the two mistakes.
 */
export function earningsRowState(row: EarningsRowLike): EarningsRowState {
  if (row.cancelled) {
    const pct = refundPercentOf(row)
    if (pct >= 100) return 'refunded'
    if (pct > 0) return 'partially_refunded'
    return 'cancelled_kept'
  }
  return row.status === 'paid_out' ? 'paid_out' : 'upcoming'
}

/** True when this row's money is settled and nothing further is coming. */
export function isSettled(row: EarningsRowLike): boolean {
  return earningsRowState(row) !== 'upcoming'
}

/** The summary half of `GET /api/local/host/earnings`. */
export interface EarningsTotalsLike {
  totalEarned: number
  guestPaid: number
  commissionRate: number
}

/**
 * What the platform took across the counted bookings: the gap between what
 * guests paid and what the host earns.
 *
 * Derived rather than read off `commissionRate`, because the rate is the LIVE
 * one while each booking priced at whatever rate was live when it was made —
 * multiplying by today's rate would quietly disagree with the two totals shown
 * directly above it. Floored at 0 so a backfilled row where guestPaid was never
 * recorded reads as "no commission" instead of a negative number.
 */
export function platformCommission(totals: EarningsTotalsLike): number {
  const gap = Number(totals.guestPaid) - Number(totals.totalEarned)
  return Number.isFinite(gap) && gap > 0 ? gap : 0
}

/**
 * The commission rate as a whole-number percent, for the "guests pay N% above
 * your price" line. The wire sends a 0–1 fraction.
 */
export function commissionPercent(rate: number): number {
  const n = Number(rate)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100)
}

/** True when there is nothing to draw — no money and no rows. Distinct from a
 *  failed load, which the caller reports separately. */
export function hasNoEarnings(totals: EarningsTotalsLike & { bookingsCount: number }): boolean {
  return totals.bookingsCount === 0 && Number(totals.totalEarned) === 0
}
