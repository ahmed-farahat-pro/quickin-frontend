// Unit tests for src/lib/resort-choice.ts — the resort dropdown's form rule.
//
// Offline: no database, no network, no browser. Run with `npm test`.
// Note the explicit `.ts` extension — Node 22 strips types, but its ESM resolver
// needs the extension. resort-choice.ts has no relative imports, which is what
// makes it loadable here at all. See README → Testing.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { OTHER_RESORT, isResortNameMissing } from '../../src/lib/resort-choice.ts'

describe('OTHER_RESORT', () => {
  test('is the `__other__` sentinel the analytics filters also use', () => {
    // Both surfaces mean "free text, not a catalog row". A drift here would let a
    // listing be saved under a sentinel the /ops resort filter cannot select.
    assert.equal(OTHER_RESORT, '__other__')
  })
})

describe('isResortNameMissing', () => {
  test('blocks "Other" with an empty name — the bug this rule exists for', () => {
    assert.equal(isResortNameMissing(OTHER_RESORT, ''), true)
  })

  test('blocks a name that is only whitespace', () => {
    // The form used to send `resort_name: undefined` for these, which the server
    // reads as "no resort chosen" — the host's answer vanished silently.
    assert.equal(isResortNameMissing(OTHER_RESORT, '   '), true)
    assert.equal(isResortNameMissing(OTHER_RESORT, '\n\t '), true)
  })

  test('allows "Other" once a name is typed', () => {
    assert.equal(isResortNameMissing(OTHER_RESORT, 'Hacienda Bay'), false)
    assert.equal(isResortNameMissing(OTHER_RESORT, '  Marassi  '), false, 'padding is trimmed downstream, not rejected')
  })

  test('allows a name in any script — the catalog is Egypt-first', () => {
    assert.equal(isResortNameMissing(OTHER_RESORT, 'هاسيندا باي'), false)
  })

  // The other half, and the one that matters more: this rule must never block a
  // host who did not pick "Other". An over-eager check here would make the whole
  // create form unsubmittable for every listing outside a compound.
  test('never blocks the no-resort choice, even with stale text in the box', () => {
    assert.equal(isResortNameMissing('', ''), false)
    assert.equal(isResortNameMissing('', '   '), false)
    // The box is hidden when the dropdown moves off "Other", but its state
    // survives — the rule must key off the dropdown, not the leftover text.
    assert.equal(isResortNameMissing('', 'typed then switched away'), false)
  })

  test('never blocks a catalog resort picked from the dropdown', () => {
    assert.equal(isResortNameMissing('8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f', ''), false)
  })
})
