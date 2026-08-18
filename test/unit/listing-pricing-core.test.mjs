// Unit tests for src/lib/local/listing-pricing-core.ts — the weekend rate a host
// types on /host/new and /host/:id/edit.
//
// Offline: no database, no network, no server. Run with `npm test`.
// Note the explicit `.ts` extension — Node 22 strips types, but its ESM resolver
// needs the extension. listing-pricing-core.ts has no relative imports, which is
// what makes it loadable here at all. See README → Testing.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { checkWeekendPrice, weekendPriceMessage } from '../../src/lib/local/listing-pricing-core.ts'

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
