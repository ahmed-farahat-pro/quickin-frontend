// Unit tests for src/lib/local/calendar-grid-core.ts — the host calendar's grid
// layout and Airbnb-style selection maths, without a DOM.
//
// Offline: no database, no network, no browser. Run with `npm test`.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  applySweep,
  chunkWindows,
  isDayEditable,
  monthDays,
  monthGrid,
  monthStart,
  selectionStats,
  sweepMode,
  toggleMonthSelection,
} from '../../src/lib/local/date-pricing-core.ts'

const TODAY = '2026-08-21'

describe('monthStart', () => {
  test('walks forward across the year boundary', () => {
    assert.equal(monthStart('2026-08-21', 0), '2026-08-01')
    assert.equal(monthStart('2026-08-21', 4), '2026-12-01')
    assert.equal(monthStart('2026-08-21', 5), '2027-01-01')
    assert.equal(monthStart('2026-08-21', 12), '2027-08-01')
    assert.equal(monthStart('2026-12-31', 1), '2027-01-01')
  })

  test('walks backward too', () => {
    assert.equal(monthStart('2026-01-15', -1), '2025-12-01')
    assert.equal(monthStart('2026-01-15', -13), '2024-12-01')
  })

  test('rejects a bad date rather than producing NaN-01', () => {
    assert.throws(() => monthStart('nope', 1), /invalid date/)
  })
})

describe('monthGrid', () => {
  test('pads the leading blanks so the 1st sits under its weekday', () => {
    // 2026-08-01 is a Saturday (dow 6), so six blanks come first.
    const cells = monthGrid('2026-08-01')
    assert.deepEqual(cells.slice(0, 7), [null, null, null, null, null, null, '2026-08-01'])
    assert.equal(cells.length, 6 + 31)
  })

  test('a month starting on Sunday has no leading blanks', () => {
    // 2026-02-01 is a Sunday.
    const cells = monthGrid('2026-02-01')
    assert.equal(cells[0], '2026-02-01')
    assert.equal(cells.filter((c) => c === null).length, 0)
  })

  test('month lengths are right, leap years included', () => {
    assert.equal(monthDays('2026-02-01').length, 28)
    assert.equal(monthDays('2024-02-01').length, 29)
    assert.equal(monthDays('2026-04-01').length, 30)
    assert.equal(monthDays('2026-12-01').length, 31)
  })

  test('the last cell is the last day of the month, never the next month’s 1st', () => {
    const days = monthDays('2026-08-01')
    assert.equal(days[days.length - 1], '2026-08-31')
    assert.equal(monthDays('2026-02-01').at(-1), '2026-02-28')
    assert.equal(monthDays('2024-02-01').at(-1), '2024-02-29')
  })
})

describe('sweepMode', () => {
  test('pressing an unselected day adds; pressing a selected one removes', () => {
    const selected = new Set(['2026-08-24'])
    assert.equal(sweepMode(selected, '2026-08-25'), 'add')
    assert.equal(sweepMode(selected, '2026-08-24'), 'remove')
  })
})

describe('applySweep', () => {
  test('adds without disturbing what was already selected', () => {
    const next = applySweep(new Set(['2026-08-20']), ['2026-08-24', '2026-08-25'], 'add')
    assert.deepEqual([...next].sort(), ['2026-08-20', '2026-08-24', '2026-08-25'])
  })

  test('removes only what the sweep covered', () => {
    const next = applySweep(new Set(['2026-08-20', '2026-08-24']), ['2026-08-24'], 'remove')
    assert.deepEqual([...next], ['2026-08-20'])
  })

  test('a sweep is idempotent in its own direction', () => {
    // Dragging back and forth over the same day must not flip it — which is why
    // the mode is fixed when the press starts rather than per day.
    const once = applySweep(new Set(), ['2026-08-24'], 'add')
    const twice = applySweep(once, ['2026-08-24'], 'add')
    assert.deepEqual([...twice], ['2026-08-24'])
  })

  test('removing a day that was never selected is a no-op', () => {
    const next = applySweep(new Set(['2026-08-20']), ['2026-09-01'], 'remove')
    assert.deepEqual([...next], ['2026-08-20'])
  })

  test('returns a NEW set, leaving the input untouched', () => {
    const before = new Set(['2026-08-20'])
    const after = applySweep(before, ['2026-08-24'], 'add')
    assert.notEqual(before, after)
    assert.deepEqual([...before], ['2026-08-20'])
  })
})

describe('toggleMonthSelection', () => {
  const WEEK = ['2026-08-24', '2026-08-25', '2026-08-26']

  test('selects the month when none of it is selected', () => {
    assert.deepEqual([...toggleMonthSelection(new Set(), WEEK)].sort(), WEEK)
  })

  test('selects the rest when the month is only partly selected', () => {
    const partial = new Set(['2026-08-25'])
    assert.deepEqual([...toggleMonthSelection(partial, WEEK)].sort(), WEEK)
  })

  test('CLEARS the month when all of it is already selected', () => {
    // Otherwise a mis-tap costs the host a full month of manual deselection.
    const all = new Set(WEEK)
    assert.deepEqual([...toggleMonthSelection(all, WEEK)], [])
  })

  test('leaves days outside the month alone in both directions', () => {
    const mixed = new Set([...WEEK, '2026-09-10'])
    assert.deepEqual([...toggleMonthSelection(mixed, WEEK)], ['2026-09-10'])
  })

  test('a month with nothing selectable is a no-op', () => {
    const before = new Set(['2026-09-10'])
    assert.deepEqual([...toggleMonthSelection(before, [])], ['2026-09-10'])
  })
})

describe('isDayEditable', () => {
  const available = { status: 'available', source: 'base' }
  const booked = { status: 'booked', source: 'base' }
  const blocked = { status: 'blocked', source: 'custom' }

  test('today is editable, yesterday is not', () => {
    assert.equal(isDayEditable(TODAY, available, TODAY), true)
    assert.equal(isDayEditable('2026-08-20', available, TODAY), false)
  })

  test('a booked night is never editable', () => {
    assert.equal(isDayEditable('2026-08-24', booked, TODAY), false)
  })

  test('a blocked day IS editable — that is how a host reopens it', () => {
    assert.equal(isDayEditable('2026-08-24', blocked, TODAY), true)
  })

  test('a day with no data yet is editable, so a loading month is not inert', () => {
    assert.equal(isDayEditable('2027-03-04', undefined, TODAY), true)
  })

  test('a bad date is not editable', () => {
    assert.equal(isDayEditable('2026-02-30', available, TODAY), false)
    assert.equal(isDayEditable('2026-08-24', available, 'nope'), false)
  })
})

describe('selectionStats', () => {
  const days = {
    '2026-08-24': { status: 'available', source: 'custom' },
    '2026-08-25': { status: 'blocked', source: 'base' },
    '2026-08-26': { status: 'available', source: 'base' },
  }

  test('counts what the action bar needs', () => {
    assert.deepEqual(selectionStats(['2026-08-24', '2026-08-25', '2026-08-26'], days), {
      total: 3, blocked: 1, custom: 1,
    })
  })

  test('a day with no data counts toward the total only', () => {
    // The buttons that would be no-ops stay hidden; the count still tells the
    // host how many nights they are about to change.
    assert.deepEqual(selectionStats(['2027-01-01'], days), { total: 1, blocked: 0, custom: 0 })
  })

  test('an empty selection is all zeroes', () => {
    assert.deepEqual(selectionStats([], days), { total: 0, blocked: 0, custom: 0 })
  })
})

describe('chunkWindows', () => {
  test('splits a span into windows of at most `size` days', () => {
    assert.deepEqual(chunkWindows('2026-01-01', '2026-01-10', 4), [
      { start: '2026-01-01', end: '2026-01-04' },
      { start: '2026-01-05', end: '2026-01-08' },
      { start: '2026-01-09', end: '2026-01-10' },
    ])
  })

  test('windows are contiguous and never overlap — no day fetched twice or missed', () => {
    const windows = chunkWindows('2026-01-01', '2026-12-31', 120)
    assert.equal(windows[0].start, '2026-01-01')
    assert.equal(windows.at(-1).end, '2026-12-31')
    for (let i = 1; i < windows.length; i++) {
      const prevEnd = new Date(`${windows[i - 1].end}T00:00:00Z`).getTime()
      const thisStart = new Date(`${windows[i].start}T00:00:00Z`).getTime()
      assert.equal(thisStart - prevEnd, 86_400_000, `gap before ${windows[i].start}`)
    }
  })

  test('a single day is one window', () => {
    assert.deepEqual(chunkWindows('2026-01-01', '2026-01-01', 120), [
      { start: '2026-01-01', end: '2026-01-01' },
    ])
  })

  test('an already-covered range asks for nothing', () => {
    // The server prefetched through `to`, so the client must issue no requests.
    assert.deepEqual(chunkWindows('2026-02-01', '2026-01-01', 120), [])
    assert.deepEqual(chunkWindows('nope', '2026-01-01', 120), [])
    assert.deepEqual(chunkWindows('2026-01-01', '2026-03-01', 0), [])
  })
})
