// Unit tests for src/lib/local/host-earnings-core.ts — how a payout row is
// classified once cancellations and refunds are folded back in, and what the
// platform's cut came to.
//
// Offline: no database, no network, no DOM. Run with `npm test`.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  commissionPercent,
  earningsRowState,
  hasNoEarnings,
  isSettled,
  platformCommission,
  refundPercentOf,
} from '../../src/lib/local/host-earnings-core.ts'

describe('earningsRowState', () => {
  test('passes the two wire statuses through when nothing was cancelled', () => {
    assert.equal(earningsRowState({ status: 'paid_out' }), 'paid_out')
    assert.equal(earningsRowState({ status: 'upcoming' }), 'upcoming')
  })

  test('a fully refunded cancellation is refunded, not paid out', () => {
    // The wire says 'paid_out' for every cancellation — see the module header.
    assert.equal(
      earningsRowState({ status: 'paid_out', cancelled: true, refund_percent: 100 }),
      'refunded',
    )
  })

  test('a part-refunded cancellation is told apart from a whole one', () => {
    assert.equal(
      earningsRowState({ status: 'paid_out', cancelled: true, refund_percent: 50 }),
      'partially_refunded',
    )
  })

  test('a cancellation the host kept whole is neither refunded nor paid out', () => {
    assert.equal(
      earningsRowState({ status: 'paid_out', cancelled: true, refund_percent: 0 }),
      'cancelled_kept',
    )
    // No refund_percent at all means the same thing.
    assert.equal(
      earningsRowState({ status: 'paid_out', cancelled: true }),
      'cancelled_kept',
    )
  })

  test('an unknown status reads as upcoming, never as settled money', () => {
    assert.equal(earningsRowState({ status: 'something_new' }), 'upcoming')
    assert.equal(earningsRowState({ status: '' }), 'upcoming')
  })
})

describe('refundPercentOf', () => {
  test('a missing percent is no refund, not unknown', () => {
    assert.equal(refundPercentOf({ status: 'paid_out' }), 0)
    assert.equal(refundPercentOf({ status: 'paid_out', refund_percent: null }), 0)
  })

  test('clamps to 0–100 and ignores junk', () => {
    assert.equal(refundPercentOf({ status: 'paid_out', refund_percent: 140 }), 100)
    assert.equal(refundPercentOf({ status: 'paid_out', refund_percent: -5 }), 0)
    assert.equal(refundPercentOf({ status: 'paid_out', refund_percent: Number.NaN }), 0)
  })
})

describe('isSettled', () => {
  test('only an upcoming row is still owed', () => {
    assert.equal(isSettled({ status: 'upcoming' }), false)
    assert.equal(isSettled({ status: 'paid_out' }), true)
    assert.equal(isSettled({ status: 'paid_out', cancelled: true, refund_percent: 100 }), true)
  })
})

describe('platformCommission', () => {
  test('is the gap between what guests paid and what the host earns', () => {
    assert.equal(
      platformCommission({ totalEarned: 1000, guestPaid: 1100, commissionRate: 0.1 }),
      100,
    )
  })

  test('is derived from the totals, NOT from the live rate', () => {
    // The rate says 50%, but these bookings priced at 10%. The two totals are
    // what is on screen, so the commission has to agree with them.
    assert.equal(
      platformCommission({ totalEarned: 1000, guestPaid: 1100, commissionRate: 0.5 }),
      100,
    )
  })

  test('never goes negative when guestPaid was not recorded', () => {
    assert.equal(
      platformCommission({ totalEarned: 1000, guestPaid: 0, commissionRate: 0.1 }),
      0,
    )
  })
})

describe('commissionPercent', () => {
  test('turns the 0–1 fraction into whole percent', () => {
    assert.equal(commissionPercent(0.1), 10)
    assert.equal(commissionPercent(0.125), 13)
  })

  test('no rate is 0, not NaN', () => {
    assert.equal(commissionPercent(0), 0)
    assert.equal(commissionPercent(Number.NaN), 0)
  })
})

describe('hasNoEarnings', () => {
  test('true only when there is neither a booking nor a pound', () => {
    assert.equal(
      hasNoEarnings({ bookingsCount: 0, totalEarned: 0, guestPaid: 0, commissionRate: 0.1 }),
      true,
    )
    assert.equal(
      hasNoEarnings({ bookingsCount: 2, totalEarned: 0, guestPaid: 0, commissionRate: 0.1 }),
      false,
    )
    assert.equal(
      hasNoEarnings({ bookingsCount: 0, totalEarned: 500, guestPaid: 550, commissionRate: 0.1 }),
      false,
    )
  })
})
