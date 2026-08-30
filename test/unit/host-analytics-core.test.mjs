// Unit tests for src/lib/local/host-analytics-core.ts — the trend bars' scaling
// and the derived figures the analytics dashboard renders.
//
// Offline: no database, no network, no DOM. Run with `npm test`.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  averageRating,
  conversionPercent,
  hasNoAnalytics,
  monthLabel,
  trendBars,
} from '../../src/lib/local/host-analytics-core.ts'

describe('trendBars', () => {
  test('scales every bar against the tallest month', () => {
    const bars = trendBars([
      { month: '2026-01', bookings: 1, revenue: 500 },
      { month: '2026-02', bookings: 4, revenue: 2000 },
      { month: '2026-03', bookings: 2, revenue: 1000 },
    ])
    assert.deepEqual(bars.map((b) => b.height), [0.25, 1, 0.5])
  })

  test('an all-zero series is a flat baseline, not full-height bars', () => {
    // The bug this guards: `revenue / max` with max === 0 is NaN, and a naive
    // `|| 1` fallback draws every empty month at full height.
    const bars = trendBars([
      { month: '2026-01', bookings: 0, revenue: 0 },
      { month: '2026-02', bookings: 0, revenue: 0 },
    ])
    assert.deepEqual(bars.map((b) => b.height), [0, 0])
  })

  test('a single month fills the chart', () => {
    const bars = trendBars([{ month: '2026-05', bookings: 3, revenue: 900 }])
    assert.deepEqual(bars.map((b) => b.height), [1])
  })

  test('an empty series produces no bars rather than throwing', () => {
    assert.deepEqual(trendBars([]), [])
  })

  test('clamps a negative month instead of inverting the chart', () => {
    const bars = trendBars([
      { month: '2026-01', bookings: 0, revenue: -100 },
      { month: '2026-02', bookings: 2, revenue: 400 },
    ])
    assert.deepEqual(bars.map((b) => b.revenue), [0, 400])
    assert.deepEqual(bars.map((b) => b.height), [0, 1])
  })

  test('keeps the months in the order the backend sent them', () => {
    const bars = trendBars([
      { month: '2026-01', bookings: 1, revenue: 100 },
      { month: '2026-02', bookings: 1, revenue: 300 },
    ])
    assert.deepEqual(bars.map((b) => b.month), ['2026-01', '2026-02'])
  })
})

describe('conversionPercent', () => {
  test('turns the 0–1 fraction into whole percent', () => {
    assert.equal(conversionPercent(0.5), 50)
    assert.equal(conversionPercent(0.333), 33)
  })

  test('cannot exceed 100 even if the division overshoots', () => {
    assert.equal(conversionPercent(1), 100)
    assert.equal(conversionPercent(1.0000000000000002), 100)
  })

  test('no bookings is 0, not NaN', () => {
    assert.equal(conversionPercent(0), 0)
    assert.equal(conversionPercent(Number.NaN), 0)
  })
})

describe('averageRating', () => {
  test('is null when nobody has reviewed yet', () => {
    // 0 with no reviews behind it is the empty case, not a zero-star average.
    assert.equal(averageRating(0, 0), null)
    assert.equal(averageRating(4.5, 0), null)
  })

  test('is the average once there is a review', () => {
    assert.equal(averageRating(4.5, 12), 4.5)
  })
})

describe('hasNoAnalytics', () => {
  test('listings alone are not data to draw', () => {
    assert.equal(
      hasNoAnalytics({ listings: 3, totalBookings: 0, revenue: 0, reviewCount: 0 }),
      true,
    )
  })

  test('any booking, pound or review is enough', () => {
    assert.equal(
      hasNoAnalytics({ listings: 0, totalBookings: 1, revenue: 0, reviewCount: 0 }),
      false,
    )
    assert.equal(
      hasNoAnalytics({ listings: 0, totalBookings: 0, revenue: 250, reviewCount: 0 }),
      false,
    )
    assert.equal(
      hasNoAnalytics({ listings: 0, totalBookings: 0, revenue: 0, reviewCount: 2 }),
      false,
    )
  })
})

describe('monthLabel', () => {
  test('names the month the string actually says', () => {
    // The bug this guards: `new Date('2026-03')` is midnight UTC, which is
    // February in any timezone behind UTC — every bar silently one off.
    assert.equal(monthLabel('2026-03', 'en-US'), 'Mar')
    assert.equal(monthLabel('2026-01', 'en-US'), 'Jan')
    assert.equal(monthLabel('2026-12', 'en-US'), 'Dec')
  })

  test('accepts the full timestamp form the backend may send', () => {
    assert.equal(monthLabel('2026-07-01T00:00:00.000Z', 'en-US'), 'Jul')
  })

  test('falls back to the raw string rather than rendering Invalid Date', () => {
    assert.equal(monthLabel('not-a-month', 'en-US'), 'not-a-month')
    assert.equal(monthLabel('', 'en-US'), '')
  })
})
