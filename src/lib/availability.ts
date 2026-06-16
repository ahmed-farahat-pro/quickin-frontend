// Shared availability / date-span helpers for the booking calendar.
//
// All spans are HALF-OPEN [start, end): the `start` day is unavailable but the
// `end` (check-out) day is free again as a new check-in. So a span
// start=2030-01-10 end=2030-01-15 blocks Jan 10,11,12,13,14 but NOT Jan 15.
//
// Dates are passed around as "YYYY-MM-DD" ISO strings (the same format the rest
// of the app and the backend use), which compare correctly with plain string
// `<` / `>=` because the format is zero-padded and lexicographically ordered.

import type { AvailabilitySpan } from './api'

export interface DateRange {
  start: string
  end: string
}

// Add `days` to an ISO date, returning a new ISO date. Used to step a checkout
// day forward/back. Parsed at noon to dodge DST edges near midnight.
export function addDays(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

// Is the single day `iso` inside the half-open span [start, end)?
export function dayInSpan(iso: string, span: DateRange): boolean {
  return iso >= span.start && iso < span.end
}

// Is the day `iso` unavailable per any of the spans (half-open)? This is the
// predicate the guest calendar uses to grey out individual day cells.
export function isDayUnavailable(iso: string, spans: DateRange[]): boolean {
  for (const s of spans) if (dayInSpan(iso, s)) return true
  return false
}

// Would a guest stay of [checkIn, checkOut) overlap any unavailable span?
//
// A guest occupies the NIGHTS checkIn .. checkOut-1 (checkout day itself is
// free). Two half-open ranges [a,b) and [c,d) overlap iff a < d && c < b. We
// reuse that so a selection that *straddles* a blocked span is rejected even
// when both the chosen check-in and check-out days are individually free.
export function rangeOverlapsAny(
  checkIn: string,
  checkOut: string,
  spans: DateRange[]
): boolean {
  if (!checkIn || !checkOut || checkOut <= checkIn) return false
  for (const s of spans) {
    if (checkIn < s.end && s.start < checkOut) return true
  }
  return false
}

// Given a check-in and the unavailable spans, the earliest blocked day strictly
// after check-in (exclusive upper bound for a valid checkout), or null if none.
// A checkout is valid when checkIn < checkout <= firstBlockedAfter.
export function firstBlockedDayAfter(
  checkIn: string,
  spans: DateRange[]
): string | null {
  let best: string | null = null
  for (const s of spans) {
    // The first unavailable night at/after check-in inside this span.
    const firstNight = s.start > checkIn ? s.start : checkIn
    if (firstNight <= checkIn) {
      // span covers check-in itself — handled by per-day disabling upstream
      continue
    }
    if (best === null || firstNight < best) best = firstNight
  }
  return best
}

// Narrow API spans (which may carry extra fields) to bare {start,end} ranges.
export function toRanges(spans: AvailabilitySpan[]): DateRange[] {
  return spans.map((s) => ({ start: s.start, end: s.end }))
}
