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
// The days are deliberately not part of this rule. `DEFAULT_WEEKEND_DAYS` is
// pre-selected on both forms, so "days chosen but no price" is the *normal*
// state of a listing with no weekend rate, not an error.
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
