// Unit tests for src/lib/local/overview-trends-core.ts — the metric whitelist,
// range math and series filling behind the /ops Overview's card → graph panel.
//
// Offline: no database, no network. Run with `npm test`.
// The explicit `.ts` extension is required — Node strips types but its ESM resolver
// needs the extension, and overview-trends-core.ts has no relative imports, which is
// what makes it loadable here. See the README → Testing.
//
// Two tests matter more than the rest:
//
//  * "the last cumulative point equals the card" — the whole interaction is a tile
//    that opens its own history, so a line ending anywhere other than the number
//    that was clicked makes the panel look broken even when the SQL is right. The
//    baseline is what buys that, and it is the easiest thing to drop.
//  * "a metric with no meaningful total never reports one" — the queue metrics count
//    what is pending, and nothing records when an item left the queue. A running
//    total there is a number nobody can reconcile.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  RANGE_IDS,
  RANGES,
  DEFAULT_RANGE,
  METRIC_IDS,
  METRICS,
  TrendInputError,
  parseRange,
  parseMetric,
  toDateString,
  bucketsFor,
  windowFor,
  buildSeries,
  seriesDelta,
  publicMetrics,
} from '../../src/lib/local/overview-trends-core.ts'

const AUG_8 = new Date('2026-08-08T13:45:00Z')

describe('parseRange / parseMetric', () => {
  test('empty input falls back to the defaults', () => {
    assert.equal(parseRange(null), DEFAULT_RANGE)
    assert.equal(parseRange(''), DEFAULT_RANGE)
    assert.equal(parseRange(undefined), DEFAULT_RANGE)
    assert.equal(parseMetric(null), 'users')
  })

  test('every advertised id round-trips', () => {
    for (const id of RANGE_IDS) assert.equal(parseRange(id), id)
    for (const id of METRIC_IDS) assert.equal(parseMetric(id), id)
  })

  test('anything else is a 400, not a silent default', () => {
    // Silently defaulting would let a typo'd querystring quietly return a
    // different metric than the caller asked for.
    assert.throws(() => parseRange('all'), TrendInputError)
    assert.throws(() => parseRange('30D'), TrendInputError)
    assert.throws(() => parseMetric('published'), TrendInputError)
    assert.throws(() => parseMetric('users; DROP TABLE users'), TrendInputError)
  })
})

describe('the metric whitelist', () => {
  test('every id has a spec, and every spec is on the whitelist', () => {
    // METRICS is interpolated into SQL as identifiers, so a key that is not a
    // validated MetricId is the one way user input could reach a fragment.
    assert.deepEqual(Object.keys(METRICS).sort(), [...METRIC_IDS].sort())
  })

  test('the three history-less cards are absent', () => {
    // listings has no published_at, and bookings has no status-change stamps, so
    // these cannot be charted honestly. If one ever appears here, the SQL behind
    // it is answering a different question than the tile it opened from.
    for (const absent of ['published', 'pending_bookings', 'confirmed']) {
      assert.equal(METRIC_IDS.includes(absent), false, `${absent} must not be chartable`)
    }
  })

  test('queue metrics are flagged non-cumulative and say why', () => {
    for (const id of ['applications', 'verifications']) {
      assert.equal(METRICS[id].cumulative, false)
      assert.ok(METRICS[id].note, `${id} must explain what its line actually counts`)
    }
  })

  test('every metric dates its rows by a column that can be NULL-safe', () => {
    // hosts/verified fall back to created_at precisely so a row with no decision
    // stamp is still counted once — otherwise the line ends below its card.
    assert.match(METRICS.hosts.at, /COALESCE\(/)
    assert.match(METRICS.verified.at, /COALESCE\(/)
    assert.match(METRICS.paid.at, /COALESCE\(/)
  })

  test('paid is decided by payment_status, never by paid_at IS NOT NULL', () => {
    // THE paid_at TRAP: a refund sets paid_at = NULL, so that predicate silently
    // drops refunded rows. adminStats shipped with exactly that bug once.
    assert.match(METRICS.paid.where, /payment_status/)
    assert.doesNotMatch(String(METRICS.paid.where), /paid_at\s+IS\s+NOT\s+NULL/i)
  })
})

describe('publicMetrics', () => {
  test('carries every metric, keyed identically to the series', () => {
    // The client looks up metrics[metric] with the same id it indexes series by; a
    // missing key silently drops the chart title and the Total/New toggle.
    assert.deepEqual(Object.keys(publicMetrics()).sort(), [...METRIC_IDS].sort())
  })

  test('strips the SQL — the browser never receives a table or column map', () => {
    for (const m of Object.values(publicMetrics())) {
      assert.deepEqual(Object.keys(m).sort(), ['cumulative', 'label', 'note'])
    }
  })

  test('note is null rather than undefined, so it survives JSON', () => {
    // JSON.stringify drops undefined keys entirely; the client types note as
    // `string | null` and would read undefined off a missing property instead.
    assert.equal(publicMetrics().users.note, null)
    assert.equal(typeof publicMetrics().applications.note, 'string')
  })

  test('label and cumulative match METRICS exactly', () => {
    for (const id of METRIC_IDS) {
      assert.equal(publicMetrics()[id].label, METRICS[id].label, id)
      assert.equal(publicMetrics()[id].cumulative, METRICS[id].cumulative, id)
    }
  })
})

describe('bucketsFor', () => {
  test('daily ranges end on today and are dense', () => {
    const b = bucketsFor('7d', AUG_8)
    assert.equal(b.length, 7)
    assert.equal(b[6], '2026-08-08')
    assert.equal(b[0], '2026-08-02')
    assert.deepEqual(b, [...new Set(b)], 'no duplicate buckets')
  })

  test('every advertised range produces exactly its bucket count', () => {
    for (const id of RANGE_IDS) {
      assert.equal(bucketsFor(id, AUG_8).length, RANGES[id].buckets, id)
    }
  })

  test('monthly buckets are month starts, ending on the current month', () => {
    const b = bucketsFor('12mo', AUG_8)
    assert.equal(b.length, 12)
    assert.equal(b[11], '2026-08-01')
    assert.equal(b[0], '2025-09-01')
    for (const bucket of b) assert.ok(bucket.endsWith('-01'), `${bucket} is not a month start`)
  })

  test('crossing a year boundary does not produce month 0 or 13', () => {
    const b = bucketsFor('12mo', new Date('2026-01-15T00:00:00Z'))
    assert.equal(b[11], '2026-01-01')
    assert.equal(b[0], '2025-02-01')
  })

  test('crossing a month boundary backwards keeps real dates', () => {
    // March 1 minus 7 days must land in February, and in a leap year that is the
    // 29th — the arithmetic is in epoch milliseconds precisely so it cannot
    // produce a "February 30th".
    const b = bucketsFor('7d', new Date('2028-03-01T06:00:00Z'))
    assert.equal(b[0], '2028-02-24')
    assert.equal(b[6], '2028-03-01')
  })

  test('the time of day never shifts the buckets', () => {
    const early = bucketsFor('30d', new Date('2026-08-08T00:00:01Z'))
    const late = bucketsFor('30d', new Date('2026-08-08T23:59:59Z'))
    assert.deepEqual(early, late)
  })
})

describe('windowFor', () => {
  test('the window is half-open and covers the whole last day', () => {
    const w = windowFor('7d', AUG_8)
    assert.equal(w.from, '2026-08-02')
    // Exclusive end is TOMORROW, so anything stamped today is inside the range.
    // An inclusive `<= today` on a timestamptz column would drop every row after
    // midnight — which is all of them.
    assert.equal(w.toExclusive, '2026-08-09')
  })

  test('a monthly window ends at the start of next month', () => {
    const w = windowFor('12mo', AUG_8)
    assert.equal(w.from, '2025-09-01')
    assert.equal(w.toExclusive, '2026-09-01')
  })

  test('a December window rolls into the next year', () => {
    const w = windowFor('12mo', new Date('2026-12-20T00:00:00Z'))
    assert.equal(w.toExclusive, '2027-01-01')
  })

  test('from matches the first bucket, so the baseline cutoff cannot drift', () => {
    for (const id of RANGE_IDS) {
      assert.equal(windowFor(id, AUG_8).from, bucketsFor(id, AUG_8)[0], id)
    }
  })
})

describe('buildSeries', () => {
  const buckets = ['2026-08-06', '2026-08-07', '2026-08-08']

  test('fills empty buckets with zero rather than omitting them', () => {
    // A sparse cumulative series is not just ugly: joining across a gap draws a
    // straight line through days that did not happen.
    const s = buildSeries(buckets, [{ bucket: '2026-08-07', count: 4 }], 0, true)
    assert.deepEqual(s.map((p) => p.count), [0, 4, 0])
    assert.deepEqual(s.map((p) => p.total), [0, 4, 4])
  })

  test('the running total starts from the baseline, not from zero', () => {
    const s = buildSeries(buckets, [{ bucket: '2026-08-08', count: 2 }], 300, true)
    assert.deepEqual(s.map((p) => p.total), [300, 300, 302])
  })

  test('the last cumulative point equals the number on the card', () => {
    // The tile shows 340 users. 12 of them arrived inside the window, so 328 is
    // the baseline — and the line must end exactly on 340, or clicking a tile
    // produces a chart that visibly disagrees with it.
    const rows = [
      { bucket: '2026-08-06', count: 5 },
      { bucket: '2026-08-08', count: 7 },
    ]
    const s = buildSeries(buckets, rows, 328, true)
    assert.equal(s[s.length - 1].total, 340)
  })

  test('a non-cumulative metric never reports a total', () => {
    const s = buildSeries(buckets, [{ bucket: '2026-08-07', count: 9 }], 500, false)
    assert.deepEqual(s.map((p) => p.total), [null, null, null])
    assert.deepEqual(s.map((p) => p.count), [0, 9, 0])
  })

  test('counts arriving as strings are coerced, not concatenated', () => {
    // node-postgres hands back ::int as a number, but a COUNT(*) without the cast
    // arrives as a string — and '5' + '7' is '57'.
    const s = buildSeries(buckets, [{ bucket: '2026-08-06', count: '5' }, { bucket: '2026-08-07', count: '7' }], 0, true)
    assert.deepEqual(s.map((p) => p.total), [5, 12, 12])
  })

  test('rows for a bucket off the axis are ignored, not appended', () => {
    // Possible only if the clock ticked between building the axis and running the
    // query. Dropping the row keeps the axis ordered; appending it would draw a
    // point out of sequence.
    const s = buildSeries(buckets, [{ bucket: '2026-08-09', count: 99 }], 10, true)
    assert.equal(s.length, 3)
    assert.deepEqual(s.map((p) => p.total), [10, 10, 10])
  })

  test('duplicate rows for one bucket are summed', () => {
    const s = buildSeries(buckets, [{ bucket: '2026-08-06', count: 2 }, { bucket: '2026-08-06', count: 3 }], 0, true)
    assert.equal(s[0].count, 5)
  })

  test('no rows at all still yields a dense series pinned to the baseline', () => {
    const s = buildSeries(buckets, [], 42, true)
    assert.deepEqual(s.map((p) => p.total), [42, 42, 42])
    assert.deepEqual(s.map((p) => p.count), [0, 0, 0])
  })
})

describe('seriesDelta', () => {
  test('sums the per-bucket counts, so it is right in both modes', () => {
    const cumulative = buildSeries(['a', 'b'], [], 100, true)
    assert.equal(seriesDelta(cumulative), 0, 'a flat total is zero growth, not 200')

    const s = buildSeries(['2026-08-06', '2026-08-07'], [{ bucket: '2026-08-07', count: 6 }], 100, true)
    assert.equal(seriesDelta(s), 6)
  })
})

describe('toDateString', () => {
  test('is UTC, so a late-evening local time does not roll the date back', () => {
    assert.equal(toDateString(new Date('2026-08-08T23:30:00Z')), '2026-08-08')
    assert.equal(toDateString(new Date('2026-01-01T00:00:00Z')), '2026-01-01')
  })
})
