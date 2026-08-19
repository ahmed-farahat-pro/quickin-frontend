// Unit tests for src/lib/local/listing-pricing-core.ts — the weekend rate a host
// types on /host/new and /host/:id/edit.
//
// Offline: no database, no network, no server. Run with `npm test`.
// Note the explicit `.ts` extension — Node 22 strips types, but its ESM resolver
// needs the extension. listing-pricing-core.ts has no relative imports, which is
// what makes it loadable here at all. See README → Testing.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  DAYS_IN_WEEK,
  DEFAULT_WEEKEND_DAYS,
  checkWeekendDays,
  checkWeekendPrice,
  normalizeWeekendDays,
  resolveWeekendSchedule,
  weekendDaysMessage,
  weekendPriceMessage,
} from '../../src/lib/local/listing-pricing-core.ts'

/** The rejection under test; fails loudly if a value was accepted instead. */
function problemOf(input) {
  const r = checkWeekendPrice(input)
  assert.equal(r.ok, false, `${JSON.stringify(input)} was accepted: ${JSON.stringify(r)}`)
  return r.problem
}

/** The accepted value; fails loudly if the value was rejected instead. */
function valueOf(input) {
  const r = checkWeekendPrice(input)
  assert.equal(r.ok, true, `${JSON.stringify(input)} was rejected: ${JSON.stringify(r)}`)
  return r.value
}

describe('checkWeekendPrice — the bug this module exists for', () => {
  test('0 is refused, in every shape a client can send it', () => {
    // The reported bug: the field took 0, the listing saved, and the weekend
    // days stayed lit with no rate behind them. Every layer coerced it to NULL.
    assert.equal(problemOf(0), 'notPositive')
    assert.equal(problemOf('0'), 'notPositive')
    assert.equal(problemOf('0.0'), 'notPositive')
    assert.equal(problemOf('00'), 'notPositive')
    assert.equal(problemOf(-0), 'notPositive')
  })

  test('a negative rate is refused too — same mistake, louder', () => {
    assert.equal(problemOf(-1), 'notPositive')
    assert.equal(problemOf('-250'), 'notPositive')
  })

  test('the refusal says which problem it is, so clients can word it', () => {
    assert.equal(weekendPriceMessage('notPositive'), 'Weekend price must be greater than 0')
    assert.equal(weekendPriceMessage('notANumber'), 'Weekend price must be a number')
  })
})

describe('checkWeekendPrice — empty still means "no weekend rate"', () => {
  // The field is optional and clearing it is how a host turns weekend pricing
  // off. If any of these started failing, an existing host could no longer save
  // a listing at all — a far worse bug than the one being fixed.
  test('undefined, null and blank all clear it without an error', () => {
    assert.equal(valueOf(undefined), null)
    assert.equal(valueOf(null), null)
    assert.equal(valueOf(''), null)
    assert.equal(valueOf('   '), null)
  })

  test('null is what iOS and Android send to turn weekend pricing off', () => {
    // HostService.swift / BookingService.kt both send NSNull / JSONObject.NULL
    // when the rate is nil or <= 0 — they must never be answered with a 400.
    assert.deepEqual(checkWeekendPrice(null), { ok: true, value: null })
  })
})

describe('checkWeekendPrice — a real rate still gets through', () => {
  test('numbers and numeric strings are the same rate', () => {
    assert.equal(valueOf(1500), 1500)
    assert.equal(valueOf('1500'), 1500)
    assert.equal(valueOf(' 1500 '), 1500)
  })

  test('fractions and the smallest positive rate are prices', () => {
    assert.equal(valueOf('0.5'), 0.5)
    assert.equal(valueOf(1), 1)
  })
})

describe('checkWeekendPrice — what is not a number', () => {
  test('text is refused rather than coerced to 0', () => {
    // This is the trap the old code fell into: Number('abc') is NaN and
    // Number('') is 0, and both used to end up as "no weekend price".
    assert.equal(problemOf('abc'), 'notANumber')
    assert.equal(problemOf('1,500'), 'notANumber')
    assert.equal(problemOf('1500 EGP'), 'notANumber')
    assert.equal(problemOf(Number.NaN), 'notANumber')
    assert.equal(problemOf(Number.POSITIVE_INFINITY), 'notANumber')
  })

  test('JSON shapes that Number() would happily turn into a price are refused', () => {
    // Number(true) is 1, Number([]) is 0, Number(['1500']) is 1500 — none of
    // these is a rate a host typed, and a mobile client sending one has a bug
    // that should be visible rather than stored.
    assert.equal(problemOf(true), 'notANumber')
    assert.equal(problemOf([]), 'notANumber')
    assert.equal(problemOf(['1500']), 'notANumber')
    assert.equal(problemOf({}), 'notANumber')
  })
})

// ---------------------------------------------------------------------------
// checkWeekendDays — the days that rate applies to
// ---------------------------------------------------------------------------

/** The accepted day set; fails loudly if the set was rejected instead. */
function daysOf(input) {
  const r = checkWeekendDays(input)
  assert.equal(r.ok, true, `${JSON.stringify(input)} was rejected: ${JSON.stringify(r)}`)
  return r.value
}

/** The rejection under test; fails loudly if the set was accepted instead. */
function daysProblemOf(input) {
  const r = checkWeekendDays(input)
  assert.equal(r.ok, false, `${JSON.stringify(input)} was accepted: ${JSON.stringify(r)}`)
  return r.problem
}

describe('checkWeekendDays — the bug this rule exists for', () => {
  test('all seven days is refused — it prices the whole week as a weekend', () => {
    // The reported bug: the host lit up every pill and saved, so every night
    // was charged weekend_price and price_per_night — the number the listing is
    // advertised on — applied to no night at all.
    assert.equal(daysProblemOf([0, 1, 2, 3, 4, 5, 6]), 'wholeWeek')
    assert.equal(daysProblemOf(['0', '1', '2', '3', '4', '5', '6']), 'wholeWeek')
    assert.equal(daysProblemOf([6, 5, 4, 3, 2, 1, 0]), 'wholeWeek')
  })

  test('a seven-day set padded with repeats or junk is still seven days', () => {
    // Cleaning has to happen before counting, or `[0..6, 0, 'x']` looks like
    // nine entries and slips past a length check aimed at seven.
    assert.equal(daysProblemOf([0, 1, 2, 3, 4, 5, 6, 6, 0]), 'wholeWeek')
    assert.equal(daysProblemOf([0, 1, 2, 3, 4, 5, 6, 9, 'sat', null]), 'wholeWeek')
  })

  test('the refusal says which problem it is, so clients can word it', () => {
    assert.equal(
      weekendDaysMessage('wholeWeek'),
      'Weekend pricing cannot apply to all seven days — set the nightly price instead'
    )
  })
})

describe('checkWeekendDays — every set short of the whole week still gets in', () => {
  // The half that matters as much: a rule that refused a day set a host means
  // would lock existing listings out of saving, which is worse than the bug.
  test('the Egyptian default, and a single day, are weekends', () => {
    assert.deepEqual(daysOf([5, 6]), [5, 6])
    assert.deepEqual(daysOf([6]), [6])
    assert.deepEqual(daysOf([0]), [0])
  })

  test('six of seven is odd but honest — one day is still on the nightly price', () => {
    assert.deepEqual(daysOf([0, 1, 2, 3, 4, 5]), [0, 1, 2, 3, 4, 5])
    assert.deepEqual(daysOf([1, 2, 3, 4, 5, 6]), [1, 2, 3, 4, 5, 6])
  })

  test('no days at all is not an error — it means nothing is a weekend', () => {
    // Both forms and both mobile apps send an empty set (or no set) when the
    // host turns weekend pricing off. Answering that with a 400 would be the
    // "0 is not empty" bug all over again, from the other side.
    assert.deepEqual(daysOf([]), [])
    assert.deepEqual(daysOf(undefined), [])
    assert.deepEqual(daysOf(null), [])
  })
})

describe('normalizeWeekendDays — what counts as a day', () => {
  test('days come back deduped and in week order', () => {
    assert.deepEqual(normalizeWeekendDays([6, 5, 6]), [5, 6])
    assert.deepEqual(normalizeWeekendDays(['6', 5]), [5, 6])
    // A lexicographic sort would put 10 before 2 — the range check is what keeps
    // that from ever mattering, so assert the range check too.
    assert.deepEqual(normalizeWeekendDays([2, 10, 0]), [0, 2])
  })

  test('anything outside 0..6 is dropped rather than wrapped or clamped', () => {
    assert.deepEqual(normalizeWeekendDays([7, -1, 6]), [6])
    assert.deepEqual(normalizeWeekendDays([DAYS_IN_WEEK]), [])
  })

  test('a fraction is a typo, not a day — it is dropped, not floored', () => {
    // The old filter ran Math.floor first, so 3.7 became Wednesday.
    assert.deepEqual(normalizeWeekendDays([3.7]), [])
    assert.deepEqual(normalizeWeekendDays([5.0, 6]), [5, 6])
  })

  test('JSON shapes Number() would turn into a day are not days', () => {
    // Number(true) is 1 and Number(null) is 0 — Monday and Sunday out of
    // nothing, which is how a client bug becomes a mispriced night.
    assert.deepEqual(normalizeWeekendDays([true, null, {}, [5]]), [])
    assert.deepEqual(normalizeWeekendDays('56'), [])
    assert.deepEqual(normalizeWeekendDays(6), [])
  })
})

// ---------------------------------------------------------------------------
// resolveWeekendSchedule — the rate and the days, judged as one thing
// ---------------------------------------------------------------------------

/** The day set that would be stored; fails loudly if the pair was refused. */
function scheduleOf(price, supplied) {
  const r = resolveWeekendSchedule(price, supplied)
  assert.equal(r.ok, true, `(${price}, ${JSON.stringify(supplied)}) was refused: ${JSON.stringify(r)}`)
  return r.days
}

/** The refusal under test; fails loudly if the pair was accepted instead. */
function scheduleProblemOf(price, supplied) {
  const r = resolveWeekendSchedule(price, supplied)
  assert.equal(r.ok, false, `(${price}, ${JSON.stringify(supplied)}) was accepted: ${JSON.stringify(r)}`)
  return r.problem
}

describe('resolveWeekendSchedule — the bug this rule exists for', () => {
  test('a rate with every day turned off is refused', () => {
    // The reported bug: the host typed a weekend price, left the day pills
    // unlit, and the listing saved. `weekend_days` went in as NULL, the quote
    // only charges the weekend rate `WHEN weekend_days IS NOT NULL`, and so the
    // rate the host entered was never applied to a single night — silently.
    assert.equal(scheduleProblemOf(2000, []), 'noDaysChosen')
    assert.equal(scheduleProblemOf(0.5, []), 'noDaysChosen')
  })

  test('a set that cleans down to nothing is a set with nothing in it', () => {
    // The days never survive to the row, so a client sending junk must hear the
    // same refusal as one sending `[]` rather than have it read as "absent".
    assert.equal(scheduleProblemOf(2000, [9, -1, 'sat']), 'noDaysChosen')
    assert.equal(scheduleProblemOf(2000, [3.7]), 'noDaysChosen')
    assert.equal(scheduleProblemOf(2000, null), 'noDaysChosen')
  })

  test('the refusal names the half to fix, so clients can word it', () => {
    assert.equal(
      weekendDaysMessage('noDaysChosen'),
      'Pick at least one weekend day, or clear the weekend price'
    )
  })
})

describe('resolveWeekendSchedule — absent days are not empty days', () => {
  // The distinction the old code collapsed, and the reason this takes `unknown`
  // rather than an array. A host who cleared every pill said something; a client
  // that never showed pills at all said nothing.
  test('no day set at all gets the Egyptian default', () => {
    // Both mobile apps: their pricing screens say "Applied on Fri + Sat nights"
    // and PATCH `weekend_price` alone. They used to get NULL days, i.e. a rate
    // that quietly applied to nothing — the reported bug, reached without ever
    // touching a pill.
    assert.deepEqual(scheduleOf(2000, undefined), [5, 6])
    assert.deepEqual(scheduleOf(2000, undefined), [...DEFAULT_WEEKEND_DAYS])
  })

  test('the default is copied, so a caller cannot edit it for everyone else', () => {
    const days = scheduleOf(2000, undefined)
    days.push(0)
    assert.deepEqual(DEFAULT_WEEKEND_DAYS, [5, 6])
  })
})

describe('resolveWeekendSchedule — no rate means no days, never an error', () => {
  // The asymmetry, and the half that would break every existing host if it
  // went: days pre-select on both forms before anything is typed, so "days but
  // no rate" is the resting state of every listing that doesn't use the feature.
  test('days with no rate are dropped quietly, in every shape', () => {
    assert.equal(scheduleOf(null, [5, 6]), null)
    assert.equal(scheduleOf(undefined, [5, 6]), null)
    assert.equal(scheduleOf(0, [5, 6]), null)
    assert.equal(scheduleOf(null, []), null)
    assert.equal(scheduleOf(null, undefined), null)
  })

  test('clearing the rate clears the days even when the days are still lit', () => {
    // This is how all three clients turn weekend pricing off: send the rate as
    // null and leave the pills alone.
    assert.equal(scheduleOf(null, [5, 6]), null)
    assert.equal(scheduleOf('', [5, 6]), null)
  })
})

describe('resolveWeekendSchedule — a real pair still gets through', () => {
  test('a rate with days keeps the cleaned days', () => {
    assert.deepEqual(scheduleOf(2000, [5, 6]), [5, 6])
    assert.deepEqual(scheduleOf(2000, [6]), [6])
    assert.deepEqual(scheduleOf(2000, ['6', 5, 5]), [5, 6])
    assert.deepEqual(scheduleOf(0.5, [0]), [0])
  })

  test('the whole-week rule still applies to a pair', () => {
    // Merging the two rules must not let either one out: a rate plus all seven
    // days is still a nightly price wearing a weekend's name.
    assert.equal(scheduleProblemOf(2000, [0, 1, 2, 3, 4, 5, 6]), 'wholeWeek')
  })

  test('but only while there is a rate to apply it to', () => {
    // The ordering that keeps a legacy all-seven listing rescuable: its host
    // clears the rate to turn weekend pricing off, and the seven days they never
    // chose must not refuse the save that is fixing them. Covered from the other
    // side in "no rate means no days".
    assert.equal(scheduleOf(null, [0, 1, 2, 3, 4, 5, 6]), null)
  })
})
