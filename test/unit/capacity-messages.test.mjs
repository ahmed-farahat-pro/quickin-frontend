// Unit tests for the copy the capacity rule renders — src/messages/{en,ar,es,fr}.json,
// key `hostPage.create.errors.capacity.*`.
//
// The rule itself is tested in listing-capacity-policy.test.mjs; this suite tests the
// other half, which nothing else covers: the two host forms turn a
// `ListingCapacityProblem` into a copy key and hand it named placeholders, and next-intl
// resolves that against four dictionaries. A key present in `en` and missing from `ar`
// renders the literal string `hostPage.create.errors.capacity.tooManyForType` to a host —
// no error, no build failure, just the key path where the sentence should be. A
// placeholder the form does not pass throws at render instead.
//
// Both halves are checked here because the ceiling rule ADDED two keys and a placeholder
// (`max`, `propertyType`), and the four files are edited by hand.
//
// Offline: no database, no network, no server. Run with `npm test`.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const LOCALES = ['en', 'ar', 'es', 'fr']

/** The dictionaries, loaded once. */
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(new URL(`../../src/messages/${l}.json`, import.meta.url), 'utf8'))])
)

const capacity = (locale) => messages[locale].hostPage.create.errors.capacity

/** The `{name}` placeholders a sentence expects. */
function placeholders(sentence) {
  return new Set([...sentence.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))
}

/**
 * Every value the two host forms pass to `t()` for a capacity problem. A sentence may use
 * any subset of these; it may not reach for anything else.
 */
const PASSED = new Set(['field', 'min', 'max', 'propertyType'])

/** One key per `ListingCapacityProblemCode`, plus the per-type variant of `tooMany`. */
const KEYS = ['required', 'notWhole', 'tooFew', 'tooMany', 'tooManyForType']

describe('the capacity error copy', () => {
  test('every locale carries every key', () => {
    // A missing key is silent: next-intl renders the key path itself.
    for (const locale of LOCALES) {
      for (const key of KEYS) {
        assert.equal(typeof capacity(locale)[key], 'string', `${locale}.${key}`)
        assert.ok(capacity(locale)[key].trim().length > 0, `${locale}.${key} is empty`)
      }
    }
  })

  test('no locale carries a key the others do not', () => {
    // Drift in the other direction: a key added to `en` alone, or one left behind after a
    // rename, is dead copy that a translator will keep maintaining.
    for (const locale of LOCALES) {
      assert.deepEqual(
        Object.keys(capacity(locale)).sort(),
        [...KEYS].sort(),
        `${locale} has a different key set`
      )
    }
  })

  test('every sentence only reaches for values the forms actually pass', () => {
    // next-intl throws at render on an unknown placeholder, so this is the difference
    // between a form that shows an error and a form that crashes while showing one.
    for (const locale of LOCALES) {
      for (const key of KEYS) {
        for (const name of placeholders(capacity(locale)[key])) {
          assert.ok(PASSED.has(name), `${locale}.${key} uses {${name}}, which no form passes`)
        }
      }
    }
  })

  test('the ceiling sentences name the number the host has to get under', () => {
    // A "too many" message whose whole content is "invalid" tells a host nothing. The
    // number IS the message.
    for (const locale of LOCALES) {
      assert.ok(placeholders(capacity(locale).tooMany).has('max'), `${locale}.tooMany`)
      assert.ok(placeholders(capacity(locale).tooManyForType).has('max'), `${locale}.tooManyForType`)
    }
  })

  test('the per-type sentence names the type, and the plain one does not', () => {
    // The form picks `tooManyForType` only when the policy named a type, and passes the
    // TRANSLATED label — so the placeholder has to be there to receive it. `tooMany` is
    // the sentence for the three fields with no per-type rule; naming a type there would
    // state a rule that does not exist.
    for (const locale of LOCALES) {
      assert.ok(
        placeholders(capacity(locale).tooManyForType).has('propertyType'),
        `${locale}.tooManyForType must name the type`
      )
      assert.ok(
        !placeholders(capacity(locale).tooMany).has('propertyType'),
        `${locale}.tooMany must not name a type`
      )
    }
  })

  test('the floor sentences still name the floor', () => {
    // The half that already worked, kept honest: `tooFew` is the only code that needs
    // `min`, and it must not have quietly picked up `max` in the edit.
    for (const locale of LOCALES) {
      assert.ok(placeholders(capacity(locale).tooFew).has('min'), `${locale}.tooFew`)
      assert.ok(!placeholders(capacity(locale).tooFew).has('max'), `${locale}.tooFew`)
    }
  })

  test('each locale is written in its own language, not left as English', () => {
    // A copy-paste that forgets to translate is easy to miss in a diff of four files.
    for (const locale of LOCALES.filter((l) => l !== 'en')) {
      for (const key of ['tooMany', 'tooManyForType']) {
        assert.notEqual(
          capacity(locale)[key],
          capacity('en')[key],
          `${locale}.${key} is still the English string`
        )
      }
    }
  })
})
