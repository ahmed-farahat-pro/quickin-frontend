// The guest booking calendar's nightly prices — the pure rules behind them.
//
// The reserve calendar paints each day's price from the public
// `GET /api/local/listings/:id/calendar`, one month per request, and greys out
// the days a guest cannot book. The server owns every price (commission
// included); this module only decides what a cell looks like and which months to
// ask for. No runtime imports, so `node --test` loads it as-is
// (test/unit/booking-calendar-core.test.mjs).

/** One day of GET /api/local/listings/:id/calendar, as a public reader sees it. */
export interface GuestCalendarDay {
  date: string
  price: number
  source: 'custom' | 'weekend' | 'monthly' | 'base'
  status: 'available' | 'blocked' | 'booked'
}

/** How a night's price compares to the listing's standard nightly rate. */
export type PriceTone = 'lower' | 'base' | 'higher'

/**
 * Compare a night to the base rate, not to its neighbours: a weekend in a month
 * that is cheap overall is still "cheaper than usual", and the guest reading the
 * calendar is asking exactly that. Within 1 EGP counts as the base price, so a
 * rounding step on the server never paints a plain night as a deal.
 */
export function priceTone(price: number, base: number): PriceTone {
  if (!Number.isFinite(price) || !Number.isFinite(base) || base <= 0) return 'base'
  if (price < base - 1) return 'lower'
  if (price > base + 1) return 'higher'
  return 'base'
}

/** `2500` → `"2,500"`. Whole units only: the cell has no room for piasters, and
 *  the exact figure is on the quote below the calendar. */
export function formatDayPrice(amount: number): string {
  if (!Number.isFinite(amount)) return ''
  return Math.round(amount).toLocaleString('en-US')
}

/** `YYYY-MM` for the month a date falls in — the cache key for one fetch. */
export function monthKey(year: number, monthIndex: number): string {
  const d = new Date(Date.UTC(year, monthIndex, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** First and last day of a `YYYY-MM` month, inclusive — the `start`/`end` the
 *  calendar endpoint takes. */
export function monthWindow(key: string): { start: string; end: string } {
  const [y, m] = key.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { start: `${key}-01`, end: `${key}-${String(last).padStart(2, '0')}` }
}

/**
 * The months to have loaded while `count` months are on screen from `first`:
 * those, plus the next one, so tapping "next" lands on prices that are already
 * there instead of a row of blanks.
 */
export function monthsToLoad(first: Date, count: number): string[] {
  const keys: string[] = []
  for (let i = 0; i <= count; i++) keys.push(monthKey(first.getFullYear(), first.getMonth() + i))
  return keys
}

/** Days a guest cannot pick: booked by someone else, or closed by the host. */
export function unavailableDates(days: GuestCalendarDay[]): string[] {
  return days.filter((d) => d.status !== 'available').map((d) => d.date)
}
