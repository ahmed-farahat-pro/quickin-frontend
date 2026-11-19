// The host pricing calendar's selection and paging rules — pure, so the web
// editor, the unit tests and the iOS/Android ports can all agree on them.
//
// Selection is "tap start, tap end", the same on a phone and a laptop:
//
//   • tap an unselected day   → it is selected and becomes the pending ANCHOR;
//   • tap another day         → every editable day between the anchor and it is
//                               added, and the anchor is cleared;
//   • tap the anchor again    → it stays selected on its own (a single day), so a
//                               host can still pick days that aren't consecutive;
//   • tap a selected day while nothing is pending → it is removed.
//
// Selections ACCUMULATE: finishing one range and tapping a fresh day starts the
// next range alongside it. Booked and past days inside a range are skipped,
// never refused — a host pricing "all of December" routinely crosses a booking.
//
// Kept apart from date-pricing-core.ts on purpose: that file is mirrored
// byte-for-byte into the backend and parity-checked. None of this is a pricing
// rule, so none of it belongs there.

//
// Self-contained (no imports) so `node --test` can load it directly. The limits
// — days per save, months ahead — are passed in by the caller from
// date-pricing-core, which stays the one place they are defined.

const DAY_MS = 86_400_000
const ISO = /^\d{4}-\d{2}-\d{2}$/

function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !ISO.test(v)) return false
  const t = Date.parse(`${v}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v
}
function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
}
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

export interface TapState {
  selected: ReadonlySet<string>
  /** The first day of a range still waiting for its end, or null. */
  anchor: string | null
}

export interface TapResult {
  selected: Set<string>
  anchor: string | null
  /** The range the tap would have made is longer than one save accepts. The
   *  selection is left unchanged and the anchor stays pending. */
  tooLong?: boolean
}

/** Every editable day from `a` to `b` inclusive, in either order. Empty when the
 *  span exceeds `maxDays` — the caller decides what to say about that. */
export function rangeDays(
  a: string,
  b: string,
  isEditable: (date: string) => boolean,
  maxDays: number
): string[] {
  if (!isIsoDate(a) || !isIsoDate(b)) return []
  const [from, to] = a <= b ? [a, b] : [b, a]
  const n = daysBetween(from, to)
  if (n + 1 > maxDays) return []
  const out: string[] = []
  for (let i = 0; i <= n; i++) {
    const d = addDays(from, i)
    if (isEditable(d)) out.push(d)
  }
  return out
}

/** Apply one tap to the selection. See the header for the rules. */
export function tapDay(
  state: TapState,
  date: string,
  isEditable: (date: string) => boolean,
  maxDays: number
): TapResult {
  const selected = new Set(state.selected)
  if (!isEditable(date)) return { selected, anchor: state.anchor }

  // An anchor that is no longer selected (cleared by "Select month", say) is
  // not pending any more.
  const anchor = state.anchor && selected.has(state.anchor) ? state.anchor : null

  if (anchor === null) {
    if (selected.has(date)) {
      selected.delete(date)
      return { selected, anchor: null }
    }
    selected.add(date)
    return { selected, anchor: date }
  }

  if (date === anchor) return { selected, anchor: null }

  const [from, to] = anchor <= date ? [anchor, date] : [date, anchor]
  if (daysBetween(from, to) + 1 > maxDays) return { selected, anchor, tooLong: true }
  for (const d of rangeDays(from, to, isEditable, maxDays)) selected.add(d)
  return { selected, anchor: null }
}

export interface SelectionRun {
  start: string
  end: string
  /** Days in the run — each day prices the night that starts on it. */
  days: number
}

/** Consecutive selected days grouped into runs, earliest first — what the panel
 *  summarises as "Dec 20 – Dec 27". */
export function selectionRuns(dates: Iterable<string>): SelectionRun[] {
  const sorted = [...new Set(dates)].filter(isIsoDate).sort()
  const runs: SelectionRun[] = []
  for (const d of sorted) {
    const last = runs.at(-1)
    if (last && addDays(last.end, 1) === d) {
      last.end = d
      last.days++
    } else {
      runs.push({ start: d, end: d, days: 1 })
    }
  }
  return runs
}

/** Where a day sits in its run, for drawing a range as one connected band:
 *  'single' | 'start' | 'middle' | 'end', or null when not selected. Week rows
 *  break the band visually, so the caller rounds row edges itself. */
export type RunPosition = 'single' | 'start' | 'middle' | 'end'

export function runPosition(selected: ReadonlySet<string>, date: string): RunPosition | null {
  if (!selected.has(date) || !isIsoDate(date)) return null
  const prev = selected.has(addDays(date, -1))
  const next = selected.has(addDays(date, 1))
  if (prev && next) return 'middle'
  if (prev) return 'end'
  if (next) return 'start'
  return 'single'
}

/** Lowest and highest current nightly price across the selection, so the panel
 *  can say "currently 3,500 – 4,200" before the host types anything. */
export function priceSpan(
  dates: Iterable<string>,
  days: Readonly<Record<string, { price: number } | undefined>>
): { min: number; max: number } | null {
  let min = Infinity
  let max = -Infinity
  for (const d of dates) {
    const p = days[d]?.price
    if (typeof p !== 'number' || !Number.isFinite(p)) continue
    if (p < min) min = p
    if (p > max) max = p
  }
  return min === Infinity ? null : { min, max }
}

/**
 * The first month the calendar may show, as an offset from the current month.
 * With `visible` months side by side, the last page must still end inside the
 * API's horizon — so two-up stops one page earlier than one-up.
 */
export function clampMonthOffset(
  offset: number,
  visible: number,
  horizon: number
): number {
  const max = Math.max(0, horizon - Math.max(1, visible))
  if (!Number.isFinite(offset)) return 0
  return Math.min(max, Math.max(0, Math.trunc(offset)))
}

/**
 * A finished touch gesture → which way to page, or null for "not a swipe".
 * Horizontal travel must pass `threshold` AND dominate vertical travel, so a
 * slightly diagonal scroll never flips the month. In a right-to-left layout the
 * calendar reads the other way, so the directions mirror.
 */
export function swipeDirection(
  dx: number,
  dy: number,
  rtl = false,
  threshold = 48
): 'next' | 'prev' | null {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return null
  const leftward = dx < 0
  return leftward !== rtl ? 'next' : 'prev'
}
