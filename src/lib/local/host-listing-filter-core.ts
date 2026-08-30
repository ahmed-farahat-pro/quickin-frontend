// The host dashboard's listing status filter: which chips exist, in what order,
// and how many of the host's listings sit behind each one — pure, and
// DELIBERATELY free of runtime imports so `node --test` can load it as-is (see
// the note at the top of resort-core.ts, and README → Testing).
//
// The chip row is a navigation aid, and a chip that does not say how much is
// behind it makes the host click it to find out — every time, including the
// times the answer is "nothing". iOS has badged its chips with the count since
// the filter shipped (HostListingFilterBar in HostDashboardView.swift); this
// module is what lets the web say the same numbers, from the same rules.

/**
 * The state a host listing is shown in — the union of moderation and visibility.
 * These are the wire names the web filter uses; `hostVisibilityState()` in
 * host-visibility-core.ts computes the state itself, and page.tsx maps its
 * `live` onto `approved` here.
 */
export type HostListingStatus = 'approved' | 'pending' | 'rejected' | 'deactivated' | 'blocked'

/** A chip in the filter row: every status, plus the "All" catch-all. */
export type HostListingFilter = 'all' | HostListingStatus

/**
 * The chips, in display order.
 *
 * 'blocked' is deliberately NOT a chip. It is rare, it is nothing the host can
 * act on, and a filter that usually selects nothing is a filter people learn to
 * ignore. Those cards still carry their badge and still appear under "All".
 * iOS and Android omit it from their chip rows for the same reason.
 */
export const HOST_LISTING_FILTER_ORDER: readonly HostListingFilter[] = [
  'all',
  'approved',
  'pending',
  'rejected',
  'deactivated',
]

/** Every status a listing can be counted under — the chip order plus 'blocked',
 *  which is counted even though no chip shows it. Doubles as the guard that keeps
 *  a value the UI does not know (or a literal 'all') out of the tally below. */
const COUNTED_STATUSES: readonly HostListingStatus[] = [
  'approved',
  'pending',
  'rejected',
  'deactivated',
  'blocked',
]

/** `true` when a listing in `status` belongs behind the `filter` chip. */
export function hostListingFilterMatches(filter: HostListingFilter, status: HostListingStatus): boolean {
  return filter === 'all' || filter === status
}

/**
 * How many listings sit behind each chip, counted from the statuses of the
 * host's listings.
 *
 * Every filter gets an entry — including 'blocked', which has no chip — so the
 * caller cannot read an undefined count off a chip that ships later. 'all' is
 * the total; whether that number is worth showing is the chip row's call, not
 * this function's (iOS renders "All" bare, so the other clients do too).
 */
export function hostListingFilterCounts(
  statuses: readonly HostListingStatus[]
): Record<HostListingFilter, number> {
  const counts: Record<HostListingFilter, number> = {
    all: statuses.length,
    approved: 0,
    pending: 0,
    rejected: 0,
    deactivated: 0,
    blocked: 0,
  }
  for (const status of statuses) {
    // A status the UI does not know still counts under "All" (and still renders,
    // under "All"), it just cannot invent a key here.
    if (COUNTED_STATUSES.includes(status)) counts[status] += 1
  }
  return counts
}
