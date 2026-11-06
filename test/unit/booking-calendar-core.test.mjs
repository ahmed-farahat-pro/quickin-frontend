// Unit tests for src/lib/local/booking-calendar-core.ts — the nightly prices and
// unavailable days painted on the guest reserve calendar.
//
// Offline: no database, no network, no DOM. Run with `npm test`.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatDayPrice,
  monthKey,
  monthWindow,
  monthsToLoad,
  priceTone,
  unavailableDates,
} from '../../src/lib/local/booking-calendar-core.ts'

describe('priceTone', () => {
  test('compares against the base rate', () => {
    assert.equal(priceTone(2500, 2500), 'base')
    assert.equal(priceTone(3500, 2500), 'higher')
    assert.equal(priceTone(2000, 2500), 'lower')
  })

  test('a rounding step is still the base price', () => {
    assert.equal(priceTone(2501, 2500), 'base')
    assert.equal(priceTone(2499, 2500), 'base')
  })

  test('a missing or zero base never paints a day as a deal', () => {
    assert.equal(priceTone(2500, 0), 'base')
    assert.equal(priceTone(2500, NaN), 'base')
    assert.equal(priceTone(NaN, 2500), 'base')
  })
})

describe('formatDayPrice', () => {
  test('groups thousands and drops fractions', () => {
    assert.equal(formatDayPrice(2500), '2,500')
    assert.equal(formatDayPrice(12500), '12,500')
    assert.equal(formatDayPrice(52.4), '52')
  })

  test('blank for junk rather than "NaN"', () => {
    assert.equal(formatDayPrice(NaN), '')
  })
})

describe('months', () => {
  test('monthKey rolls over the year', () => {
    assert.equal(monthKey(2026, 10), '2026-11')
    assert.equal(monthKey(2026, 12), '2027-01')
  })

  test('monthWindow covers the whole month, leap years included', () => {
    assert.deepEqual(monthWindow('2026-11'), { start: '2026-11-01', end: '2026-11-30' })
    assert.deepEqual(monthWindow('2028-02'), { start: '2028-02-01', end: '2028-02-29' })
    assert.deepEqual(monthWindow('2026-12'), { start: '2026-12-01', end: '2026-12-31' })
  })

  test('monthsToLoad is the visible months plus the next one', () => {
    assert.deepEqual(monthsToLoad(new Date(2026, 11, 15), 2), ['2026-12', '2027-01', '2027-02'])
    assert.deepEqual(monthsToLoad(new Date(2026, 10, 1), 1), ['2026-11', '2026-12'])
  })
})

describe('unavailableDates', () => {
  test('booked and blocked days, not available ones', () => {
    const days = [
      { date: '2026-11-06', price: 2500, source: 'base', status: 'available' },
      { date: '2026-11-07', price: 3500, source: 'weekend', status: 'booked' },
      { date: '2026-11-08', price: 2500, source: 'base', status: 'blocked' },
    ]
    assert.deepEqual(unavailableDates(days), ['2026-11-07', '2026-11-08'])
  })
})
