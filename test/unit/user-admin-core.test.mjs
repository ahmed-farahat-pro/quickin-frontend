// Unit tests for src/lib/local/user-admin-core.ts — the account lifecycle and the
// list-filter contract behind the /ops Users screens (D1–D4).
//
// Offline: no database, no network. Run with `npm test`.
// The explicit `.ts` extension is required — Node strips types but its ESM
// resolver needs the extension, and user-admin-core.ts has no relative imports,
// which is what makes it loadable here. See the backend README → Testing.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCOUNT_STATUSES,
  USER_STATUS_FILTERS,
  USER_ROLE_FILTERS,
  USER_SORTS,
  USER_STATUS_ACTIONS,
  DEFAULT_USER_LIMIT,
  MAX_USER_LIMIT,
  MAX_QUERY_LENGTH,
  MAX_REASON_LENGTH,
  UserInputError,
  normalizeStatus,
  normalizeReason,
  statusLabel,
  statusTone,
  nextStatusFor,
  requiresSuperAdmin,
  hidesListings,
  blockedLoginMessage,
  parseUserListFilter,
  buildUserListWhere,
  orderBySql,
} from '../../src/lib/local/user-admin-core.ts'

/** Build the `get` callback parseUserListFilter expects from a plain object. */
const q = (obj = {}) => (key) => (key in obj ? String(obj[key]) : null)

describe('normalizeStatus', () => {
  test('passes the three known statuses through', () => {
    for (const s of ACCOUNT_STATUSES) assert.equal(normalizeStatus(s), s)
  })

  test('is case- and whitespace-tolerant', () => {
    assert.equal(normalizeStatus('  BLOCKED '), 'blocked')
    assert.equal(normalizeStatus('Removed'), 'removed')
  })

  test('reads anything unknown as active, so nobody is locked out by a bad value', () => {
    for (const v of [null, undefined, '', '   ', 'garbage', 42, {}]) {
      assert.equal(normalizeStatus(v), 'active')
    }
  })
})

describe('normalizeReason', () => {
  test('trims, and empty becomes null', () => {
    assert.equal(normalizeReason('  spamming hosts  '), 'spamming hosts')
    assert.equal(normalizeReason(''), null)
    assert.equal(normalizeReason('   '), null)
    assert.equal(normalizeReason(null), null)
    assert.equal(normalizeReason(undefined), null)
  })

  test('caps at MAX_REASON_LENGTH rather than rejecting', () => {
    const long = 'x'.repeat(MAX_REASON_LENGTH + 50)
    assert.equal(normalizeReason(long).length, MAX_REASON_LENGTH)
  })
})

describe('status presentation', () => {
  test('labels and tones cover every status', () => {
    assert.equal(statusLabel('active'), 'Active')
    assert.equal(statusLabel('blocked'), 'Blocked')
    assert.equal(statusLabel('removed'), 'Removed')
    assert.equal(statusTone('active'), 'green')
    assert.equal(statusTone('blocked'), 'amber')
    assert.equal(statusTone('removed'), 'red')
  })
})

describe('nextStatusFor — the full transition matrix', () => {
  // from → action → expected result, or null where the transition is illegal.
  const MATRIX = {
    active: { block: 'blocked', unblock: null, remove: 'removed', restore: null },
    blocked: { block: null, unblock: 'active', remove: 'removed', restore: null },
    removed: { block: null, unblock: null, remove: null, restore: 'active' },
  }

  for (const from of ACCOUNT_STATUSES) {
    for (const action of USER_STATUS_ACTIONS) {
      const expected = MATRIX[from][action]
      test(`${from} + ${action} → ${expected ?? 'rejected'}`, () => {
        if (expected) {
          assert.equal(nextStatusFor(from, action), expected)
        } else {
          assert.throws(() => nextStatusFor(from, action), UserInputError)
        }
      })
    }
  }

  test('an unknown action is rejected, not silently applied', () => {
    assert.throws(() => nextStatusFor('active', 'obliterate'), UserInputError)
  })
})

describe('requiresSuperAdmin / hidesListings', () => {
  test('only restore needs a super admin', () => {
    assert.equal(requiresSuperAdmin('restore'), true)
    assert.equal(requiresSuperAdmin('block'), false)
    assert.equal(requiresSuperAdmin('unblock'), false)
    assert.equal(requiresSuperAdmin('remove'), false)
  })

  test('both non-active states hide listings', () => {
    assert.equal(hidesListings('active'), false)
    assert.equal(hidesListings('blocked'), true)
    assert.equal(hidesListings('removed'), true)
  })
})

describe('blockedLoginMessage', () => {
  test('distinguishes suspended from closed', () => {
    assert.match(blockedLoginMessage('blocked'), /suspended/i)
    assert.match(blockedLoginMessage('removed'), /closed/i)
  })

  test('always points at support', () => {
    for (const s of ['blocked', 'removed']) {
      assert.match(blockedLoginMessage(s), /support@quickin\.app/)
    }
  })
})

describe('parseUserListFilter', () => {
  test('defaults with no params at all', () => {
    const f = parseUserListFilter(q())
    assert.deepEqual(f, {
      q: null,
      status: 'all',
      role: 'all',
      from: null,
      to: null,
      sort: 'recent',
      limit: DEFAULT_USER_LIMIT,
      offset: 0,
    })
  })

  test('trims the search term, and blank means no search', () => {
    assert.equal(parseUserListFilter(q({ q: '  ahmed  ' })).q, 'ahmed')
    assert.equal(parseUserListFilter(q({ q: '   ' })).q, null)
  })

  test('rejects an over-long search term', () => {
    const long = 'a'.repeat(MAX_QUERY_LENGTH + 1)
    assert.throws(() => parseUserListFilter(q({ q: long })), UserInputError)
    // Exactly at the limit is fine.
    assert.equal(parseUserListFilter(q({ q: 'a'.repeat(MAX_QUERY_LENGTH) })).q.length, MAX_QUERY_LENGTH)
  })

  test('accepts every allowed enum value', () => {
    for (const s of USER_STATUS_FILTERS) assert.equal(parseUserListFilter(q({ status: s })).status, s)
    for (const r of USER_ROLE_FILTERS) assert.equal(parseUserListFilter(q({ role: r })).role, r)
    for (const s of USER_SORTS) assert.equal(parseUserListFilter(q({ sort: s })).sort, s)
  })

  test('rejects unknown enum values instead of falling back', () => {
    assert.throws(() => parseUserListFilter(q({ status: 'banned' })), UserInputError)
    assert.throws(() => parseUserListFilter(q({ role: 'admin' })), UserInputError)
    assert.throws(() => parseUserListFilter(q({ sort: 'id; DROP TABLE users' })), UserInputError)
  })

  test('clamps and validates limit / offset', () => {
    assert.equal(parseUserListFilter(q({ limit: '10' })).limit, 10)
    assert.equal(parseUserListFilter(q({ limit: String(MAX_USER_LIMIT) })).limit, MAX_USER_LIMIT)
    assert.throws(() => parseUserListFilter(q({ limit: '0' })), UserInputError)
    assert.throws(() => parseUserListFilter(q({ limit: String(MAX_USER_LIMIT + 1) })), UserInputError)
    assert.throws(() => parseUserListFilter(q({ limit: '12.5' })), UserInputError)
    assert.throws(() => parseUserListFilter(q({ limit: 'lots' })), UserInputError)
    assert.throws(() => parseUserListFilter(q({ offset: '-1' })), UserInputError)
    assert.equal(parseUserListFilter(q({ offset: '100' })).offset, 100)
  })

  test('validates the joined-between window', () => {
    const f = parseUserListFilter(q({ from: '2026-01-01', to: '2026-06-30' }))
    assert.equal(f.from, '2026-01-01')
    assert.equal(f.to, '2026-06-30')
    assert.throws(() => parseUserListFilter(q({ from: '01-01-2026' })), UserInputError)
    assert.throws(() => parseUserListFilter(q({ from: '2026-06-30', to: '2026-01-01' })), UserInputError)
  })
})

describe('buildUserListWhere', () => {
  test('no filters → no clauses', () => {
    const { where, params } = buildUserListWhere(parseUserListFilter(q()))
    assert.deepEqual(where, [])
    assert.deepEqual(params, [])
  })

  test('search binds one wrapped term reused across all three columns', () => {
    const { where, params } = buildUserListWhere(parseUserListFilter(q({ q: 'ahmed' })))
    assert.equal(params.length, 1)
    assert.equal(params[0], '%ahmed%')
    assert.match(where[0], /u\.email ILIKE \$1/)
    assert.match(where[0], /full_name.*ILIKE \$1/)
    assert.match(where[0], /phone.*ILIKE \$1/)
  })

  test('status and role filters', () => {
    const blocked = buildUserListWhere(parseUserListFilter(q({ status: 'blocked' })))
    assert.match(blocked.where[0], /account_status.*= \$1/)
    assert.deepEqual(blocked.params, ['blocked'])

    // 'all' adds nothing; role is a literal boolean test with no bind.
    const host = buildUserListWhere(parseUserListFilter(q({ role: 'host' })))
    assert.deepEqual(host.params, [])
    assert.match(host.where[0], /is_host.*= true/)

    const guest = buildUserListWhere(parseUserListFilter(q({ role: 'guest' })))
    assert.match(guest.where[0], /is_host.*= false/)
  })

  test('the `to` bound widens to include the whole final day', () => {
    const { where } = buildUserListWhere(parseUserListFilter(q({ to: '2026-06-30' })))
    assert.match(where[0], /interval '1 day'/)
  })

  test('placeholders honour startIndex so the caller can prepend binds', () => {
    const { where, params } = buildUserListWhere(parseUserListFilter(q({ q: 'x', status: 'blocked' })), 5)
    assert.equal(params.length, 2)
    assert.match(where[0], /\$5/)
    assert.match(where[1], /\$6/)
  })

  test('numbering stays contiguous across every filter at once', () => {
    const filter = parseUserListFilter(q({ q: 'a', status: 'active', from: '2026-01-01', to: '2026-02-01' }))
    const { where, params } = buildUserListWhere(filter)
    const used = where.join(' ').match(/\$\d+/g).map((s) => Number(s.slice(1)))
    // Every bind is referenced, and the highest index equals the param count.
    assert.equal(Math.max(...used), params.length)
    assert.equal(new Set(used).size, params.length)
  })
})

describe('orderBySql — the injection guard', () => {
  test('every whitelisted sort maps to a fragment', () => {
    for (const s of USER_SORTS) assert.ok(orderBySql(s).length > 0)
  })

  test('an unknown sort throws rather than reaching SQL', () => {
    assert.throws(() => orderBySql('created_at; DROP TABLE users'), UserInputError)
    assert.throws(() => orderBySql(''), UserInputError)
  })

  test('fragments never contain a semicolon or a comment marker', () => {
    for (const s of USER_SORTS) {
      assert.doesNotMatch(orderBySql(s), /[;]|--/)
    }
  })
})
