// Unit tests for src/lib/local/currency-core.ts — the display currency a guest
// reads prices in, and the conversion behind it.
//
// The property that matters most here is the one the money depends on: a
// conversion is never allowed to invent a number. When a rate is missing the
// original price has to survive untouched, because "no rate" and "rate of zero"
// are the same input shape and only one of them is a price.
//
// Offline: no database, no network, no server. Run with `npm test`.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  BASE_CURRENCY,
  CURRENCY_SYMBOLS,
  DEFAULT_DISPLAY_CURRENCY,
  DEFAULT_EGP_PER_UNIT,
  DISPLAY_CURRENCIES,
  DISPLAY_CURRENCY_COOKIE,
  convertAmount,
  currencyName,
  displayPrice,
  isDisplayCurrency,
  parseRateOverrides,
  ratesWith,
  resolveDisplayCurrency,
  roundForDisplay,
} from '../../src/lib/local/currency-core.ts'

describe('the currency list', () => {
  test('is priced in the currency listings are priced in', () => {
    assert.equal(BASE_CURRENCY, 'EGP')
    assert.equal(DEFAULT_DISPLAY_CURRENCY, 'EGP')
    assert.equal(DEFAULT_EGP_PER_UNIT.EGP, 1)
  })

  test('every offered currency has a rate and a symbol', () => {
    for (const code of DISPLAY_CURRENCIES) {
      assert.ok(DEFAULT_EGP_PER_UNIT[code] > 0, `${code} has no rate`)
      assert.ok(CURRENCY_SYMBOLS[code], `${code} has no symbol`)
    }
  })

  test('the cookie is the one the proxy and the provider both name', () => {
    assert.equal(DISPLAY_CURRENCY_COOKIE, 'qk_currency')
  })
})

describe('resolveDisplayCurrency', () => {
  test('accepts a code however it was typed into the cookie', () => {
    assert.equal(resolveDisplayCurrency('USD'), 'USD')
    assert.equal(resolveDisplayCurrency('usd'), 'USD')
    assert.equal(resolveDisplayCurrency('  eur '), 'EUR')
  })

  test('falls back rather than leaving prices in a currency with no rate', () => {
    // A currency we do not carry, a currency that does not exist, and the two
    // ways a cookie is absent — all of them are EGP, never a blank price.
    assert.equal(resolveDisplayCurrency('JPY'), 'EGP')
    assert.equal(resolveDisplayCurrency('nonsense'), 'EGP')
    assert.equal(resolveDisplayCurrency(''), 'EGP')
    assert.equal(resolveDisplayCurrency(null), 'EGP')
    assert.equal(resolveDisplayCurrency(undefined), 'EGP')
  })

  test('isDisplayCurrency is exact — the resolver is the forgiving one', () => {
    assert.equal(isDisplayCurrency('USD'), true)
    assert.equal(isDisplayCurrency('usd'), false)
    assert.equal(isDisplayCurrency('JPY'), false)
    assert.equal(isDisplayCurrency(null), false)
    assert.equal(isDisplayCurrency(42), false)
  })
})

describe('parseRateOverrides', () => {
  test('reads a deploy-time table', () => {
    assert.deepEqual(parseRateOverrides('{"USD": 50.25, "eur": "55"}'), {
      USD: 50.25,
      EUR: 55,
    })
  })

  test('a malformed blob is ignored whole, not half-applied', () => {
    assert.deepEqual(parseRateOverrides('{"USD": 50,'), {})
    assert.deepEqual(parseRateOverrides('[50]'), {})
    assert.deepEqual(parseRateOverrides('"USD"'), {})
    assert.deepEqual(parseRateOverrides(''), {})
    assert.deepEqual(parseRateOverrides(undefined), {})
  })

  test('one bad entry drops alone and leaves the good ones standing', () => {
    // The failure this guards: a single typo taking down five working rates and
    // silently reverting every price on the site to the built-in snapshot.
    assert.deepEqual(
      parseRateOverrides(
        '{"USD": 50, "DOLLARS": 50, "EUR": 0, "GBP": -60, "SAR": "abc", "AED": null}',
      ),
      { USD: 50 },
    )
  })

  test('zero is not a rate — it would divide every price into Infinity', () => {
    assert.deepEqual(parseRateOverrides('{"USD": 0}'), {})
    const rates = ratesWith(parseRateOverrides('{"USD": 0}'))
    assert.equal(rates.USD, DEFAULT_EGP_PER_UNIT.USD)
  })

  test('ratesWith layers overrides on the snapshot without losing the rest', () => {
    const rates = ratesWith({ USD: 100 })
    assert.equal(rates.USD, 100)
    assert.equal(rates.EUR, DEFAULT_EGP_PER_UNIT.EUR)
    assert.equal(rates.EGP, 1)
  })
})

describe('roundForDisplay', () => {
  test('big numbers lose their decimals — nobody reads a nightly rate to the cent', () => {
    assert.equal(roundForDisplay(1234.56), 1235)
    assert.equal(roundForDisplay(100.4), 100)
  })

  test('small numbers keep two, so a fee does not round away to nothing', () => {
    assert.equal(roundForDisplay(1.237), 1.24)
    assert.equal(roundForDisplay(0.4), 0.4)
    assert.equal(roundForDisplay(99.994), 99.99)
  })

  test('a non-number is zero, not NaN on the page', () => {
    assert.equal(roundForDisplay(Number.NaN), 0)
    assert.equal(roundForDisplay(Number.POSITIVE_INFINITY), 0)
  })
})

describe('convertAmount', () => {
  const rates = { EGP: 1, USD: 50, EUR: 55 }

  test('goes through EGP', () => {
    assert.equal(convertAmount(5000, 'EGP', 'USD', rates), 100)
    assert.equal(convertAmount(100, 'USD', 'EGP', rates), 5000)
    // 100 USD is 5000 EGP is 90.909… EUR → 90.91 at two decimals.
    assert.equal(convertAmount(100, 'USD', 'EUR', rates), 90.91)
  })

  test('the same currency is returned exactly, decimals and all', () => {
    // Not rounded: this is the stored price, not a conversion of it.
    assert.equal(convertAmount(1234.56, 'USD', 'USD', rates), 1234.56)
    assert.equal(convertAmount(1234.56, 'usd', ' USD ', rates), 1234.56)
  })

  test('a missing rate returns null instead of a made-up number', () => {
    assert.equal(convertAmount(100, 'JPY', 'USD', rates), null)
    assert.equal(convertAmount(100, 'USD', 'JPY', rates), null)
    assert.equal(convertAmount(Number.NaN, 'USD', 'EGP', rates), null)
  })

  test('a blank currency means the base currency, which is what listings use', () => {
    assert.equal(convertAmount(5000, null, 'USD', rates), 100)
    assert.equal(convertAmount(100, 'USD', '', rates), 5000)
  })
})

describe('displayPrice', () => {
  const rates = { EGP: 1, USD: 50 }

  test('an unconverted price is not marked approximate', () => {
    assert.deepEqual(displayPrice(2500, 'EGP', 'EGP', rates), {
      amount: 2500,
      currency: 'EGP',
      approximate: false,
    })
  })

  test('a converted price is always marked approximate', () => {
    assert.deepEqual(displayPrice(2500, 'EGP', 'USD', rates), {
      amount: 50,
      currency: 'USD',
      approximate: true,
    })
  })

  test('a price with no rate is shown as it was stored, and as exact', () => {
    // This is the whole point of the fallback: the guest sees the real price in
    // the real currency. "Approximate" would be a lie — nothing was converted.
    assert.deepEqual(displayPrice(2500, 'JPY', 'USD', rates), {
      amount: 2500,
      currency: 'JPY',
      approximate: false,
    })
    assert.deepEqual(displayPrice(2500, 'EGP', 'JPY', rates), {
      amount: 2500,
      currency: 'EGP',
      approximate: false,
    })
  })

  test('a listing priced in USD converts too — the base is not the only source', () => {
    assert.deepEqual(displayPrice(100, 'USD', 'EGP', rates), {
      amount: 5000,
      currency: 'EGP',
      approximate: true,
    })
  })

  test('zero is exact — an empty quote reads "$0", not "≈ $0"', () => {
    assert.deepEqual(displayPrice(0, 'EGP', 'USD', rates), {
      amount: 0,
      currency: 'USD',
      approximate: false,
    })
  })

  test('a broken amount renders as zero rather than NaN', () => {
    assert.deepEqual(displayPrice(Number.NaN, 'EGP', 'EGP', rates), {
      amount: 0,
      currency: 'EGP',
      approximate: false,
    })
  })
})

describe('currencyName', () => {
  test('localizes the switcher labels', () => {
    assert.match(currencyName('EGP', 'en-US'), /Egyptian/i)
    assert.match(currencyName('USD', 'en-US'), /Dollar/i)
  })

  test('a code ICU cannot name falls back to the code, never to empty', () => {
    assert.equal(currencyName('ZZZ', 'en-US'), 'ZZZ')
  })

  test('a malformed locale tag throws inside Intl — and still yields a label', () => {
    // `new Intl.DisplayNames(['!!'])` is a RangeError, and an exception here
    // would take down the whole switcher over a bad tag.
    assert.equal(currencyName('EGP', '!!'), 'EGP')
  })
})
