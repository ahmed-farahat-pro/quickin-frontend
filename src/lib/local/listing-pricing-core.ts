// Listing pricing input rules — the weekend rate a host types on `/host/new` and
// `/host/:id/edit`, and the same rate the mobile apps PATCH.
//
// Weekend pricing is optional: an empty field means "no weekend rate", and that
// is what clears it. What is NOT optional is that a rate the host actually typed
// has to be money. `0` used to be swallowed silently at every layer — the form
// coerced it away, `createListing` wrote NULL — so the listing saved with the
// weekend-day pills still lit up and no weekend price behind them. The host had
// no way to tell the rate they entered had been dropped. A refusal is the only
// honest answer: 0 is either a typo or a misunderstanding of the field, and both
// deserve to be said out loud.
//
// The days are deliberately not part of *that* rule. `DEFAULT_WEEKEND_DAYS` is
// pre-selected on both forms, so "days chosen but no price" is the *normal*
// state of a listing with no weekend rate, not an error. They have a rule of
// their own further down, and it asks a different question: not whether a rate
// was typed, but whether what was lit up is still a weekend.
//
// No runtime imports, so `node --test` can import this file directly — see
// README → Testing. db.ts and the forms import the core, never the reverse.

/** How a typed weekend price can fail. Clients switch on this, not on text. */
export type WeekendPriceProblem =
  /** Not a number at all — `abc`, `1,500`, `--`. */
  | 'notANumber'
  /** A number, but not a price — `0`, `-200`. */
  | 'notPositive'

export type WeekendPriceResult =
  /** `null` = the host left it empty, i.e. no weekend rate (clears a stored one). */
  | { ok: true; value: number | null }
  | { ok: false; problem: WeekendPriceProblem }

/**
 * Validate what the host typed (or what a client sent) for `weekend_price`.
 *
 * Empty is fine and means "no weekend rate": `undefined`, `null`, `''` and a
 * blank string all answer `{ ok: true, value: null }`. Anything else must parse
 * to a finite number greater than zero.
 */
export function checkWeekendPrice(input: unknown): WeekendPriceResult {
  if (input === undefined || input === null) return { ok: true, value: null }
  if (typeof input === 'string' && input.trim() === '') return { ok: true, value: null }
  // `Number(true)` is 1 and `Number([])` is 0 — neither is a price a host typed.
  if (typeof input !== 'number' && typeof input !== 'string') return { ok: false, problem: 'notANumber' }
  const n = Number(input)
  if (!Number.isFinite(n)) return { ok: false, problem: 'notANumber' }
  if (n <= 0) return { ok: false, problem: 'notPositive' }
  return { ok: true, value: n }
}

/** English message for a rejected weekend price — what the API answers with. */
export function weekendPriceMessage(problem: WeekendPriceProblem): string {
  return problem === 'notPositive'
    ? 'Weekend price must be greater than 0'
    : 'Weekend price must be a number'
}

// ---------------------------------------------------------------------------
// Which days count as the weekend
// ---------------------------------------------------------------------------
//
// A weekend is a *part* of the week. The day pills let a host light up all seven
// and save, which prices every night at the weekend rate and leaves the nightly
// price — the field right above it, the one the whole listing is advertised on —
// applying to nothing. A host doing that almost certainly means "my rate is X",
// and the field for that is `price_per_night`.
//
// So: at most six of seven. Zero days is still fine and still means nothing is a
// weekend (see the note above about days without a rate), and every day but one
// is a strange weekend but an honest one — the line is only drawn where the
// nightly price stops existing.

/** Days in a week — the ceiling `weekend_days` has to stay under. */
export const DAYS_IN_WEEK = 7

/** How a weekend-day set can fail. Clients switch on this, not on text. */
export type WeekendDaysProblem =
  /** All seven days chosen, which leaves `price_per_night` unreachable. */
  | 'wholeWeek'
  /** A rate was typed, but no day was left lit to charge it on — see
   *  resolveWeekendSchedule. Shape alone can't raise this one: an empty set is
   *  perfectly fine until a rate turns up beside it. */
  | 'noDaysChosen'

export type WeekendDaysResult =
  /** The cleaned set: 0..6 integers, deduped, ascending. May be empty. */
  | { ok: true; value: number[] }
  | { ok: false; problem: WeekendDaysProblem }

/**
 * Clean a day set without judging it: keep whole days in 0..6 (Postgres DOW,
 * `0`=Sun … `6`=Sat), drop everything else, drop repeats, sort ascending.
 *
 * Repeats are dropped here rather than tolerated because they are what a
 * whole-week set can hide behind — `[5, 5, 6]` is two days, not three, and a
 * count taken before deduping would answer the wrong question.
 */
export function normalizeWeekendDays(input: unknown): number[] {
  if (!Array.isArray(input)) return []
  const out: number[] = []
  for (const raw of input) {
    // `Number(true)` is 1 and `Number(null)` is 0 — Monday and Sunday out of
    // nothing. Only a number or a numeric string is a day.
    if (typeof raw !== 'number' && typeof raw !== 'string') continue
    const n = Number(raw)
    // Not floored: `3.7` is a typo, not Wednesday.
    if (!Number.isInteger(n) || n < 0 || n > DAYS_IN_WEEK - 1) continue
    if (!out.includes(n)) out.push(n)
  }
  return out.sort((a, b) => a - b)
}

/**
 * Validate what the host lit up (or what a client sent) for `weekend_days`.
 *
 * Answers the cleaned set, or refuses the one set that cannot mean what it says:
 * all seven days, which is a nightly price wearing a weekend's name.
 */
export function checkWeekendDays(input: unknown): WeekendDaysResult {
  const value = normalizeWeekendDays(input)
  if (value.length >= DAYS_IN_WEEK) return { ok: false, problem: 'wholeWeek' }
  return { ok: true, value }
}

const WEEKEND_DAYS_MESSAGES: Record<WeekendDaysProblem, string> = {
  wholeWeek: 'Weekend pricing cannot apply to all seven days — set the nightly price instead',
  noDaysChosen: 'Pick at least one weekend day, or clear the weekend price',
}

/** English message for a rejected weekend-day set — what the API answers with. */
export function weekendDaysMessage(problem: WeekendDaysProblem): string {
  return WEEKEND_DAYS_MESSAGES[problem]
}

// ---------------------------------------------------------------------------
// The rate and the days, as one thing
// ---------------------------------------------------------------------------
//
// Each half is now well-formed on its own, and a listing could still save with
// a weekend rate that no night can ever be charged at: type a rate, turn every
// day pill off, submit. The storage layer already believed the pair was a pair
// — createListing wrote `price && days.length ? days : null`, and the booking
// quote only reaches for the rate when `weekend_days IS NOT NULL` — so the rate
// went into the row and nothing was ever priced with it. No error, no hint; the
// host leaves believing their weekends are dearer than their weekdays.
//
// That is the same silent drop `0` used to be, arriving through the other half
// of the field, and it gets the same answer: refuse, and say which half to fix.
//
// The asymmetry with the rate is deliberate and stays. Days with no rate is the
// resting state of every listing that doesn't use weekend pricing (both forms
// pre-select DEFAULT_WEEKEND_DAYS before the host has typed anything), so it
// cannot be an error. A rate with no days is not a resting state — it is a
// number the host entered and will never see used.
// ---------------------------------------------------------------------------

/** Days-of-week that count as "weekend" by default (Egypt: Fri=5, Sat=6).
 *  Re-exported by `lib/geo`, which is where the forms and the client-side quote
 *  have always imported it from. */
export const DEFAULT_WEEKEND_DAYS: number[] = [5, 6]

export type WeekendScheduleResult =
  /** What to store in `weekend_days`. `null` = store no days, which is what a
   *  listing with no weekend rate looks like. */
  | { ok: true; days: number[] | null }
  | { ok: false; problem: WeekendDaysProblem }

/**
 * The day set to store beside `price` — the one place that decides what a
 * (rate, days) pair means, so the create door, the edit door and both forms
 * cannot drift apart on it.
 *
 * `supplied` being `undefined` is load-bearing, and is why this takes `unknown`
 * rather than an array: an absent day set and an empty one are different
 * statements, and squashing them together is what left the mobile apps writing
 * NULL days under a real rate.
 *
 * - **absent** (`undefined`) — the client never mentions days, so the host was
 *   never asked. Both mobile apps are here: their pricing screens say "Applied
 *   on Fri + Sat nights" and send `weekend_price` alone. They get
 *   `DEFAULT_WEEKEND_DAYS` — what their own UI promised the host, and what they
 *   silently failed to get before.
 * - **empty** (`[]`) — the client showed the host the day pills and the host
 *   left none lit. That is the web forms, and it is the bug: refuse it rather
 *   than guess Fri+Sat, because a host who cleared every pill on purpose should
 *   not have two put back without being told.
 * - **anything else** — cleaned and judged by `checkWeekendDays`, so a whole
 *   week is still refused here too.
 *
 * `price` is the rate *after* `checkWeekendPrice` has had it — a real number or
 * nothing, never the raw string a host typed.
 *
 * With no rate there is nothing to schedule and the answer is always `null`:
 * clearing the rate clears the days, at every door, and without a word about
 * what the days looked like on the way out.
 */
export function resolveWeekendSchedule(
  price: number | null | undefined,
  supplied: unknown
): WeekendScheduleResult {
  // The rate is consulted first, and nothing about the days is judged without
  // one. That ordering is load-bearing: a listing saved before the whole-week
  // rule existed still loads with all seven pills lit, and clearing the rate is
  // exactly how its host turns weekend pricing off. Judging the shape first
  // would refuse that save and strand them on a form they are in the middle of
  // fixing — and for a day set that is about to be dropped either way.
  if (typeof price !== 'number' || price <= 0) return { ok: true, days: null }
  if (supplied === undefined) return { ok: true, days: [...DEFAULT_WEEKEND_DAYS] }
  const checked = checkWeekendDays(supplied)
  if (!checked.ok) return checked
  if (checked.value.length === 0) return { ok: false, problem: 'noDaysChosen' }
  return { ok: true, days: checked.value }
}
