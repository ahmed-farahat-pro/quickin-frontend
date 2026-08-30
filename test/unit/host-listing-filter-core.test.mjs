// Unit tests for src/lib/local/host-listing-filter-core.ts — the host
// dashboard's listing status chips: which ones exist, what each selects, and
// the count each one is badged with.
//
// Offline: no database, no network, no DOM. Run with `npm test`.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  HOST_LISTING_FILTER_ORDER,
  hostListingFilterCounts,
  hostListingFilterMatches,
} from '../../src/lib/local/host-listing-filter-core.ts'

describe('HOST_LISTING_FILTER_ORDER', () => {
  test('leads with All and offers the four states a host can act on', () => {
    assert.deepEqual(HOST_LISTING_FILTER_ORDER, ['all', 'approved', 'pending', 'rejected', 'deactivated'])
  })

  test('has no chip for blocked — the host cannot clear it', () => {
    assert.equal(HOST_LISTING_FILTER_ORDER.includes('blocked'), false)
  })
})

describe('hostListingFilterMatches', () => {
  test('All takes everything, blocked listings included', () => {
    for (const status of ['approved', 'pending', 'rejected', 'deactivated', 'blocked']) {
      assert.equal(hostListingFilterMatches('all', status), true)
    }
  })

  test('a status chip takes only its own status', () => {
    assert.equal(hostListingFilterMatches('pending', 'pending'), true)
    assert.equal(hostListingFilterMatches('pending', 'approved'), false)
    assert.equal(hostListingFilterMatches('deactivated', 'rejected'), false)
  })
})

describe('hostListingFilterCounts', () => {
  test('counts each status and totals them under All', () => {
    const counts = hostListingFilterCounts([
      'approved',
      'approved',
      'pending',
      'rejected',
      'deactivated',
      'deactivated',
      'deactivated',
    ])
    assert.equal(counts.all, 7)
    assert.equal(counts.approved, 2)
    assert.equal(counts.pending, 1)
    assert.equal(counts.rejected, 1)
    assert.equal(counts.deactivated, 3)
    assert.equal(counts.blocked, 0)
  })

  test('a status with nothing in it counts zero rather than going missing — a chip badged 0 is the answer, not a reason to click', () => {
    const counts = hostListingFilterCounts(['approved'])
    for (const key of HOST_LISTING_FILTER_ORDER) {
      assert.equal(typeof counts[key], 'number', `${key} has no count`)
    }
    assert.equal(counts.pending, 0)
    assert.equal(counts.rejected, 0)
    assert.equal(counts.deactivated, 0)
  })

  test('no listings at all means every chip reads zero', () => {
    const counts = hostListingFilterCounts([])
    assert.deepEqual(counts, { all: 0, approved: 0, pending: 0, rejected: 0, deactivated: 0, blocked: 0 })
  })

  test('a blocked listing counts under All but under no chip of its own', () => {
    const counts = hostListingFilterCounts(['approved', 'blocked'])
    assert.equal(counts.all, 2)
    assert.equal(counts.approved, 1)
    assert.equal(counts.blocked, 1)
  })

  test('the chip counts (minus All) always add up to at most the total', () => {
    const counts = hostListingFilterCounts(['approved', 'pending', 'blocked'])
    const chipped = HOST_LISTING_FILTER_ORDER.filter((k) => k !== 'all').reduce((sum, k) => sum + counts[k], 0)
    assert.equal(chipped, 2)
    assert.ok(chipped <= counts.all)
  })

  test('an unknown status still counts under All and invents no key', () => {
    const counts = hostListingFilterCounts(['approved', 'archived'])
    assert.equal(counts.all, 2)
    assert.equal(counts.approved, 1)
    assert.equal(Object.keys(counts).length, 6)
  })

  test('a status literally named all cannot inflate its own chip', () => {
    const counts = hostListingFilterCounts(['all', 'approved'])
    assert.equal(counts.all, 2)
    assert.equal(counts.approved, 1)
  })
})
