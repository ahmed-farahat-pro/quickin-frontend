// Unit tests for src/lib/local/calendar-selection-core.ts — the host calendar's
// tap-start/tap-end selection, run grouping and month paging, without a DOM.
//
// Offline: no database, no network, no browser. Run with `npm test`.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  clampMonthOffset,
  priceSpan,
  rangeDays,
  runPosition,
  selectionRuns,
  swipeDirection,
  tapDay,
} from '../../src/lib/local/calendar-selection-core.ts'

const all = () => true
const CAP = 800
const sorted = (s) => [...s].sort()

describe('tapDay', () => {
  test('first tap selects the day and makes it the pending anchor', () => {
    const r = tapDay({ selected: new Set(), anchor: null }, '2026-12-20', all, CAP)
    assert.deepEqual(sorted(r.selected), ['2026-12-20'])
    assert.equal(r.anchor, '2026-12-20')
  })

  test('second tap fills the range and clears the anchor', () => {
    const r = tapDay({ selected: new Set(['2026-12-20']), anchor: '2026-12-20' }, '2026-12-23', all, CAP)
    assert.deepEqual(sorted(r.selected), ['2026-12-20', '2026-12-21', '2026-12-22', '2026-12-23'])
    assert.equal(r.anchor, null)
  })

  test('the end may come before the anchor', () => {
    const r = tapDay({ selected: new Set(['2026-12-23']), anchor: '2026-12-23' }, '2026-12-21', all, CAP)
    assert.deepEqual(sorted(r.selected), ['2026-12-21', '2026-12-22', '2026-12-23'])
  })

  test('tapping the anchor again keeps it as a single day', () => {
    const r = tapDay({ selected: new Set(['2026-12-20']), anchor: '2026-12-20' }, '2026-12-20', all, CAP)
    assert.deepEqual(sorted(r.selected), ['2026-12-20'])
    assert.equal(r.anchor, null)
  })

  test('with nothing pending, tapping a selected day removes it', () => {
    const r = tapDay({ selected: new Set(['2026-12-20', '2026-12-21']), anchor: null }, '2026-12-21', all, CAP)
    assert.deepEqual(sorted(r.selected), ['2026-12-20'])
    assert.equal(r.anchor, null)
  })

  test('ranges accumulate: a fresh tap starts a second range beside the first', () => {
    const r = tapDay({ selected: new Set(['2026-12-01', '2026-12-02']), anchor: null }, '2026-12-10', all, CAP)
    assert.deepEqual(sorted(r.selected), ['2026-12-01', '2026-12-02', '2026-12-10'])
    assert.equal(r.anchor, '2026-12-10')
  })

  test('booked days inside a range are skipped, not refused', () => {
    const editable = (d) => d !== '2026-12-22'
    const r = tapDay({ selected: new Set(['2026-12-20']), anchor: '2026-12-20' }, '2026-12-24', editable, CAP)
    assert.deepEqual(sorted(r.selected), ['2026-12-20', '2026-12-21', '2026-12-23', '2026-12-24'])
  })

  test('tapping an uneditable day changes nothing', () => {
    const r = tapDay({ selected: new Set(['2026-12-20']), anchor: '2026-12-20' }, '2026-12-22', (d) => d !== '2026-12-22', CAP)
    assert.deepEqual(sorted(r.selected), ['2026-12-20'])
    assert.equal(r.anchor, '2026-12-20')
  })

  test('a stale anchor (no longer selected) is ignored', () => {
    const r = tapDay({ selected: new Set(), anchor: '2026-12-20' }, '2026-12-25', all, CAP)
    assert.deepEqual(sorted(r.selected), ['2026-12-25'])
    assert.equal(r.anchor, '2026-12-25')
  })

  test('a range past the per-save cap is refused and the anchor stays pending', () => {
    const r = tapDay({ selected: new Set(['2026-12-01']), anchor: '2026-12-01' }, '2026-12-11', all, 5)
    assert.equal(r.tooLong, true)
    assert.deepEqual(sorted(r.selected), ['2026-12-01'])
    assert.equal(r.anchor, '2026-12-01')
  })

  test('does not mutate the input set', () => {
    const before = new Set(['2026-12-20'])
    tapDay({ selected: before, anchor: '2026-12-20' }, '2026-12-22', all, CAP)
    assert.deepEqual(sorted(before), ['2026-12-20'])
  })
})

describe('rangeDays', () => {
  test('is inclusive, order-independent, and crosses month ends', () => {
    assert.deepEqual(rangeDays('2027-01-02', '2026-12-30', all, CAP), [
      '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02',
    ])
  })
  test('is empty past the cap or for bad input', () => {
    assert.deepEqual(rangeDays('2026-12-01', '2026-12-10', all, 3), [])
    assert.deepEqual(rangeDays('nope', '2026-12-10', all, CAP), [])
  })
})

describe('selectionRuns / runPosition', () => {
  test('groups consecutive days, across a month boundary', () => {
    assert.deepEqual(selectionRuns(['2026-12-31', '2027-01-01', '2026-12-05', '2026-12-30']), [
      { start: '2026-12-05', end: '2026-12-05', days: 1 },
      { start: '2026-12-30', end: '2027-01-01', days: 3 },
    ])
    assert.deepEqual(selectionRuns([]), [])
  })

  test('labels each day by where it sits in its run', () => {
    const s = new Set(['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-09'])
    assert.equal(runPosition(s, '2026-12-01'), 'start')
    assert.equal(runPosition(s, '2026-12-02'), 'middle')
    assert.equal(runPosition(s, '2026-12-03'), 'end')
    assert.equal(runPosition(s, '2026-12-09'), 'single')
    assert.equal(runPosition(s, '2026-12-04'), null)
  })
})

describe('priceSpan', () => {
  test('min and max over the selection, ignoring unloaded days', () => {
    const days = { a: { price: 4200 }, b: { price: 3500 }, c: undefined }
    assert.deepEqual(priceSpan(['a', 'b', 'c'], days), { min: 3500, max: 4200 })
    assert.equal(priceSpan(['c'], days), null)
  })
})

describe('clampMonthOffset', () => {
  test('keeps the last page inside the horizon', () => {
    assert.equal(clampMonthOffset(-3, 1, 24), 0)
    assert.equal(clampMonthOffset(30, 1, 24), 23)
    assert.equal(clampMonthOffset(30, 2, 24), 22)
    assert.equal(clampMonthOffset(5, 2, 24), 5)
    assert.equal(clampMonthOffset(Number.NaN, 2, 24), 0)
  })
})

describe('swipeDirection', () => {
  test('a leftward swipe goes forward, rightward goes back', () => {
    assert.equal(swipeDirection(-80, 10), 'next')
    assert.equal(swipeDirection(80, 10), 'prev')
  })
  test('mirrors in right-to-left layouts', () => {
    assert.equal(swipeDirection(-80, 10, true), 'prev')
    assert.equal(swipeDirection(80, 10, true), 'next')
  })
  test('short or mostly-vertical gestures are not swipes', () => {
    assert.equal(swipeDirection(-30, 0), null)
    assert.equal(swipeDirection(-80, 70), null)
  })
})
