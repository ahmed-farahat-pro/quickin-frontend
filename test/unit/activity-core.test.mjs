// Unit tests for src/lib/local/activity-core.ts — the activity feed, audit trail and
// alert-centre rules behind /ops (F1–F4).
//
// Offline: no database, no network. Run with `npm test`.
// The explicit `.ts` extension is required — Node strips types but its ESM resolver
// needs the extension, and activity-core.ts has no relative imports, which is what
// makes it loadable here. See the backend README → Testing.
//
// The test that matters most is "an operator never sees an alert they can't act on":
// the alert centre is the one surface that aggregates across every module, so it is
// the easiest place to accidentally leak the existence of a queue someone was never
// granted.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  EVENT_KINDS,
  ACTIVITY_SORTS,
  ALERT_SOURCES,
  DEFAULT_ACTIVITY_LIMIT,
  MAX_ACTIVITY_LIMIT,
  MAX_QUERY_LENGTH,
  ActivityInputError,
  isEventKind,
  eventLabel,
  eventTone,
  parseActivityFilter,
  wantsKind,
  branchLimit,
  parseAuditFilter,
  auditActionLabel,
  isFailureAction,
  actorLabel,
  alertsFor,
  alertTotal,
  waitingLabel,
} from '../../src/lib/local/activity-core.ts'

const q = (obj = {}) => (key) => (key in obj ? String(obj[key]) : null)

describe('event kinds', () => {
  test('the feed covers exactly the six derived events plus login', () => {
    assert.equal(EVENT_KINDS.length, 7)
    assert.ok(EVENT_KINDS.includes('login'), 'login is the only non-derived kind')
    for (const k of EVENT_KINDS) assert.equal(isEventKind(k), true)
  })

  test('rejects anything else', () => {
    for (const v of [null, undefined, '', 'SIGNUP', 'signup; DROP TABLE users', 7]) {
      assert.equal(isEventKind(v), false)
    }
  })

  test('every kind has a label and a tone', () => {
    for (const k of EVENT_KINDS) {
      assert.ok(eventLabel(k).length > 0)
      assert.ok(['green', 'amber', 'red', 'neutral'].includes(eventTone(k)))
    }
    assert.equal(eventTone('booking_cancelled'), 'red')
    assert.equal(eventTone('payment_approved'), 'green')
  })
})

describe('parseActivityFilter', () => {
  test('defaults to everything, newest first', () => {
    const f = parseActivityFilter(q())
    assert.deepEqual(f.kinds, [])
    assert.equal(f.q, null)
    assert.equal(f.sort, 'recent')
    assert.equal(f.limit, DEFAULT_ACTIVITY_LIMIT)
    assert.equal(f.offset, 0)
  })

  test('accepts a comma-separated kind list', () => {
    const f = parseActivityFilter(q({ kind: 'signup,login' }))
    assert.deepEqual(f.kinds, ['signup', 'login'])
  })

  test('rejects an unknown kind rather than silently ignoring it', () => {
    assert.throws(() => parseActivityFilter(q({ kind: 'signup,teleport' })), ActivityInputError)
  })

  test('validates the date window', () => {
    const f = parseActivityFilter(q({ from: '2026-01-01', to: '2026-06-30' }))
    assert.equal(f.from, '2026-01-01')
    assert.throws(() => parseActivityFilter(q({ from: '01-01-2026' })), ActivityInputError)
    assert.throws(() => parseActivityFilter(q({ from: '2026-06-30', to: '2026-01-01' })), ActivityInputError)
  })

  test('clamps limit and offset', () => {
    assert.equal(parseActivityFilter(q({ limit: '10' })).limit, 10)
    assert.throws(() => parseActivityFilter(q({ limit: '0' })), ActivityInputError)
    assert.throws(() => parseActivityFilter(q({ limit: String(MAX_ACTIVITY_LIMIT + 1) })), ActivityInputError)
    assert.throws(() => parseActivityFilter(q({ offset: '-1' })), ActivityInputError)
    assert.throws(() => parseActivityFilter(q({ limit: '5.5' })), ActivityInputError)
  })

  test('rejects an over-long search term', () => {
    assert.throws(() => parseActivityFilter(q({ q: 'a'.repeat(MAX_QUERY_LENGTH + 1) })), ActivityInputError)
  })

  test('rejects an unknown sort', () => {
    for (const s of ACTIVITY_SORTS) assert.equal(parseActivityFilter(q({ sort: s })).sort, s)
    assert.throws(() => parseActivityFilter(q({ sort: 'at; DROP TABLE users' })), ActivityInputError)
  })
})

describe('wantsKind / branchLimit — the UNION shape', () => {
  test('no kind filter runs every branch', () => {
    const f = parseActivityFilter(q())
    for (const k of EVENT_KINDS) assert.equal(wantsKind(f, k), true)
  })

  test('a kind filter skips the branches it excludes', () => {
    const f = parseActivityFilter(q({ kind: 'signup' }))
    assert.equal(wantsKind(f, 'signup'), true)
    assert.equal(wantsKind(f, 'booking_created'), false)
  })

  test('each branch fetches enough to satisfy the page on its own', () => {
    // A page deep into a single-kind result must not come up short because one
    // branch only fetched `limit` rows.
    const f = parseActivityFilter(q({ limit: '50', offset: '100' }))
    assert.equal(branchLimit(f), 150)
  })

  test('branchLimit is capped so a huge offset cannot ask for an unbounded scan', () => {
    const f = parseActivityFilter(q({ limit: '50', offset: '1000000' }))
    assert.ok(branchLimit(f) <= MAX_ACTIVITY_LIMIT + 1000)
  })
})

describe('parseAuditFilter', () => {
  test('defaults', () => {
    const f = parseAuditFilter(q())
    assert.deepEqual([f.q, f.action, f.targetType, f.from, f.to], [null, null, null, null, null])
    assert.equal(f.limit, DEFAULT_ACTIVITY_LIMIT)
  })

  test('accepts a well-formed action and target type', () => {
    const f = parseAuditFilter(q({ action: 'document_viewed', target_type: 'user' }))
    assert.equal(f.action, 'document_viewed')
    assert.equal(f.targetType, 'user')
  })

  test('refuses anything that is not a plain slug', () => {
    for (const bad of ["user'; DROP TABLE staff_audit_log --", 'User Blocked', 'a-b', '*']) {
      assert.throws(() => parseAuditFilter(q({ action: bad })), ActivityInputError)
      assert.throws(() => parseAuditFilter(q({ target_type: bad })), ActivityInputError)
    }
  })
})

describe('audit labels', () => {
  test('known actions get real sentences', () => {
    assert.equal(auditActionLabel('user_blocked'), 'Blocked a user')
    assert.equal(auditActionLabel('document_viewed'), 'Opened a document')
    assert.equal(auditActionLabel('create_staff'), 'Created a staff account')
  })

  test('an unmapped action is humanised rather than shown raw or blank', () => {
    // A future feature adds an action before anyone updates the map.
    assert.equal(auditActionLabel('widget_frobnicated'), 'Widget frobnicated')
    assert.equal(auditActionLabel(''), 'Unknown action')
  })

  test('failures are detectable for red styling', () => {
    for (const a of ['login_failed', 'change_password_failed', 'login_blocked', 'login_deactivated']) {
      assert.equal(isFailureAction(a), true, a)
    }
    for (const a of ['login', 'user_blocked', 'document_viewed']) {
      assert.equal(isFailureAction(a), false, a)
    }
  })

  test('actorLabel unwraps the staff: convention', () => {
    assert.match(actorLabel('staff:18136ecd-cbd0-4d74'), /^staff 18136ecd/)
    assert.equal(actorLabel(null), 'system')
    assert.equal(actorLabel('admin'), 'admin')
  })
})

describe('alertsFor — the permission boundary', () => {
  const COUNTS = {
    pending_verifications: 3,
    pending_applications: 1,
    pending_listings: 2,
    disputed_payments: 5,
    open_reports: 4,
    pending_resort_submissions: 6,
  }

  test('a super admin sees every non-zero queue', () => {
    const a = alertsFor(COUNTS, { modules: [], isSuperAdmin: true })
    assert.equal(a.length, ALERT_SOURCES.length)
    assert.equal(alertTotal(a), 21)
  })

  test('an operator NEVER sees an alert for a module they do not hold', () => {
    const a = alertsFor(COUNTS, { modules: ['verifications'] })
    assert.deepEqual(a.map((x) => x.key), ['pending_verifications'])
    // The dispute count must not leak through the total either.
    assert.equal(alertTotal(a), 3)
  })

  test('no modules at all means no alerts', () => {
    assert.deepEqual(alertsFor(COUNTS, { modules: [] }), [])
    assert.equal(alertTotal(alertsFor(COUNTS, { modules: [] })), 0)
  })

  test('zero-count queues are dropped, so the centre is never a wall of calm zeroes', () => {
    const a = alertsFor({ ...COUNTS, disputed_payments: 0 }, { modules: [], isSuperAdmin: true })
    assert.equal(a.some((x) => x.key === 'disputed_payments'), false)
  })

  test('missing, null and negative counts are treated as zero', () => {
    const a = alertsFor({ open_reports: null, pending_listings: -4 }, { modules: [], isSuperAdmin: true })
    assert.deepEqual(a, [])
  })

  test('every alert carries the module that gates it and a link that clears it', () => {
    for (const s of ALERT_SOURCES) {
      assert.ok(s.module.length > 0, `${s.key} needs a module`)
      assert.match(s.href, /^\/ops/, `${s.key} must link into /ops`)
    }
  })
})

describe('waitingLabel', () => {
  const NOW = Date.parse('2026-08-06T12:00:00Z')

  test('scales from minutes to days', () => {
    assert.equal(waitingLabel('2026-08-06T11:59:30Z', NOW), 'just now')
    assert.equal(waitingLabel('2026-08-06T11:30:00Z', NOW), '30 min')
    assert.equal(waitingLabel('2026-08-06T09:00:00Z', NOW), '3 hours')
    assert.equal(waitingLabel('2026-08-05T11:00:00Z', NOW), '1 day')
    assert.equal(waitingLabel('2026-08-01T12:00:00Z', NOW), '5 days')
  })

  test('singular where it should be', () => {
    assert.equal(waitingLabel('2026-08-06T11:00:00Z', NOW), '1 hour')
  })

  test('missing or unparseable input degrades quietly', () => {
    for (const v of [null, undefined, '', 'not a date']) assert.equal(waitingLabel(v, NOW), '—')
  })
})
