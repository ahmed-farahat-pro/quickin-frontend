// The host analytics dashboard's derived numbers: the trend bars' heights, the
// conversion percent, and whether there is anything to draw at all — pure, and
// DELIBERATELY free of runtime imports so `node --test` can load it as-is (see
// resort-core.ts, README → Testing).
//
// The endpoint returns totals and a raw monthly series; everything a chart
// needs beyond that is arithmetic, and arithmetic done inline in a component is
// arithmetic nobody tests. The two cases that actually break a bar chart — every
// month zero, and a single month — are the ones this module exists to pin down.

/** One point of `GET /api/local/host/analytics` → `byMonth`. */
export interface AnalyticsMonthLike {
  /** 'YYYY-MM', as the backend's date_trunc produces it. */
  month: string
  bookings: number
  revenue: number
}

/** A month, plus the 0–1 height its bar should be drawn at. */
export interface TrendBar extends AnalyticsMonthLike {
  /** Share of the tallest month's revenue. 0 when every month is empty. */
  height: number
}

/**
 * The monthly series with each bar's height resolved against the tallest month.
 *
 * Scaled to the maximum rather than to a fixed ceiling so a host earning
 * hundreds and a host earning millions both get a readable chart. When every
 * month is zero every height is 0 — a flat baseline, not the 1/1 = full-height
 * bars a naive `revenue / max` would draw once max is also 0.
 *
 * Negative revenue cannot happen (a refund reduces the month, never past zero)
 * but is clamped anyway: one bad row should not invert the whole chart.
 */
export function trendBars(months: readonly AnalyticsMonthLike[]): TrendBar[] {
  const safe = months.map((m) => ({
    month: m.month,
    bookings: Number(m.bookings) || 0,
    revenue: Math.max(0, Number(m.revenue) || 0),
  }))
  const max = safe.reduce((hi, m) => (m.revenue > hi ? m.revenue : hi), 0)
  return safe.map((m) => ({ ...m, height: max > 0 ? m.revenue / max : 0 }))
}

/**
 * The conversion rate as a whole-number percent.
 *
 * The wire sends a 0–1 fraction (paid ÷ total bookings). Clamped because a host
 * whose only booking was paid reads 1, and floating-point division of equal
 * integers has been known to land a hair above it.
 */
export function conversionPercent(rate: number): number {
  const n = Number(rate)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(Math.min(1, n) * 100)
}

/**
 * The average rating, or null when there is nothing to average.
 *
 * The backend sends 0 both for "no reviews yet" and for a rating that rounded
 * to zero — impossible, since the minimum a review can carry is 1 — so a 0 with
 * no reviews behind it is the empty case, and a star row is the wrong way to
 * say "nobody has reviewed you". The caller renders a dash instead.
 */
export function averageRating(avg: number, reviewCount: number): number | null {
  if (!reviewCount || reviewCount <= 0) return null
  const n = Number(avg)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** The totals half of `GET /api/local/host/analytics`. */
export interface AnalyticsTotalsLike {
  listings: number
  totalBookings: number
  revenue: number
  reviewCount: number
}

/**
 * True when the host has nothing to look at yet.
 *
 * Listings alone do NOT count: a host with three listings and no bookings has
 * an empty dashboard, and showing them six zeroes and a flat chart is worse
 * than saying so. Any booking, any revenue or any review is enough to draw.
 */
export function hasNoAnalytics(totals: AnalyticsTotalsLike): boolean {
  return (
    (Number(totals.totalBookings) || 0) === 0 &&
    (Number(totals.revenue) || 0) === 0 &&
    (Number(totals.reviewCount) || 0) === 0
  )
}

/**
 * 'YYYY-MM' → a short label for the axis, in `locale`.
 *
 * Parsed as UTC noon on the first: `new Date('2026-03')` is midnight UTC, which
 * in any timezone behind it is February, and a chart whose months are each one
 * off is a bug that survives review because every bar is still there.
 */
export function monthLabel(month: string, locale = 'en-US'): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(month))
  if (!m) return String(month)
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1, 12))
  if (Number.isNaN(date.getTime())) return String(month)
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(date)
}
