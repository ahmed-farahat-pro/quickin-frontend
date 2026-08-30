// Unit tests for src/lib/local/reservation-filter-core.ts — the GUEST's reservation
// status chips: which ones exist, which one a reservation is filed behind, and the
// count each is badged with.
//
// The reported defect: the guest's Trips list had NO status filters at all. Every
// reservation — waiting on the host, waiting on a transfer, paid, cancelled, refunded
// — rendered in one flat list.
//
// Two halves matter here and are tested apart on purpose:
//
//   • What this module does DIFFERENTLY from host-booking-filter-core.ts: `under_review`
//     and `completed` are chips of their own rather than folded away. Those two are the
//     whole reason a separate module exists.
//   • What it does IDENTICALLY: the cancelled/refunded split, the clamping, the
//     unknown-status fallback. The last describe() imports the host module and asserts
//     the two agree on every shared input, because a host and a guest reading one
//     reservation must never see it filed differently.
//
// Offline: no database, no network, no DOM. Run with `npm test`.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  RESERVATION_FILTER_ORDER,
  reservationBucketFor,
  reservationFilterCounts,
  reservationFilterMatches,
} from '../../src/lib/local/reservation-filter-core.ts'
import { hostBookingBucketFor } from '../../src/lib/local/host-booking-filter-core.ts'
import { PAYMENT_STAGES } from '../../src/lib/local/payment-flow-core.ts'

describe('RESERVATION_FILTER_ORDER', () => {
  test('leads with All and walks the guest lifecycle to the ways it ends', () => {
    assert.deepEqual(RESERVATION_FILTER_ORDER, [
      'all',
      'pending',
      'awaiting_payment',
      'under_review',
      'confirmed',
      'completed',
      'rejected',
      'cancelled',
      'refunded',
      'partially_refunded',
    ])
  })

  test('keeps Rejected apart from Cancelled — a host caused one, the guest the other', () => {
    assert.ok(RESERVATION_FILTER_ORDER.includes('rejected'))
    assert.ok(RESERVATION_FILTER_ORDER.includes('cancelled'))
  })
})

describe('reservationBucketFor — the statuses', () => {
  test('pending files by status', () => {
    assert.equal(reservationBucketFor({ status: 'pending', wasPaid: false }), 'pending')
  })

  test('a pending booking is pending whatever its payment stage says — the host has not answered', () => {
    // A guest can upload a transfer before the host has even replied.
    assert.equal(reservationBucketFor({ status: 'pending', paymentStage: 'under_review', wasPaid: false }), 'pending')
    assert.equal(reservationBucketFor({ status: 'pending', paymentStage: 'paid', wasPaid: false }), 'pending')
  })

  test('rejected files by status, ahead of any payment reading', () => {
    assert.equal(reservationBucketFor({ status: 'rejected', paymentStage: 'awaiting_payment', wasPaid: false }), 'rejected')
  })

  test('status is read case- and whitespace-insensitively', () => {
    assert.equal(reservationBucketFor({ status: '  PENDING ', wasPaid: false }), 'pending')
    assert.equal(reservationBucketFor({ status: 'Cancelled', refundPercent: 100, wasPaid: true }), 'refunded')
  })

  test('the American spelling of cancelled is still a cancellation', () => {
    assert.equal(reservationBucketFor({ status: 'canceled', refundPercent: 100, wasPaid: true }), 'refunded')
  })

  // Asymmetric failure modes: a row behind no chip is a booking the guest never finds.
  test('an unrecognised status reads as Pending rather than vanishing off every chip', () => {
    assert.equal(reservationBucketFor({ status: 'archived', wasPaid: false }), 'pending')
    assert.equal(reservationBucketFor({ status: '', wasPaid: false }), 'pending')
    assert.equal(reservationBucketFor({ wasPaid: false }), 'pending')
    assert.equal(reservationBucketFor({ status: null, wasPaid: false }), 'pending')
  })
})

// The two chips this module exists to add.
describe('reservationBucketFor — what the guest needs and the host does not', () => {
  test('a submitted screenshot is Under review, NOT Awaiting payment', () => {
    // The host module folds this into awaiting_payment; for a guest that reads as
    // "you still owe us", which is what makes people pay a second time.
    assert.equal(reservationBucketFor({ status: 'confirmed', paymentStage: 'under_review', wasPaid: false }), 'under_review')
  })

  test('completed is its own chip — a guest goes looking for their trip history', () => {
    assert.equal(reservationBucketFor({ status: 'completed', paymentStage: 'paid', wasPaid: false }), 'completed')
  })

  test('a completed stay keeps its chip whatever the payment stage now says', () => {
    for (const stage of PAYMENT_STAGES) {
      assert.equal(reservationBucketFor({ status: 'completed', paymentStage: stage, wasPaid: false }), 'completed', stage)
    }
  })
})

describe('reservationBucketFor — the confirmed split', () => {
  test('confirmed and paid is Confirmed', () => {
    assert.equal(reservationBucketFor({ status: 'confirmed', paymentStage: 'paid', wasPaid: false }), 'confirmed')
  })

  test('every other stage on a confirmed booking means the guest still owes', () => {
    for (const stage of ['awaiting_payment', 'rejected', 'not_payable']) {
      assert.equal(reservationBucketFor({ status: 'confirmed', paymentStage: stage, wasPaid: false }), 'awaiting_payment', stage)
    }
  })

  test('a rejected screenshot is Awaiting payment — still payable, the guest re-uploads', () => {
    assert.equal(reservationBucketFor({ status: 'confirmed', paymentStage: 'rejected', wasPaid: false }), 'awaiting_payment')
  })

  test('a missing stage is not a decision — it reads as still owing, never as paid', () => {
    assert.equal(reservationBucketFor({ status: 'confirmed', wasPaid: false }), 'awaiting_payment')
    assert.equal(reservationBucketFor({ status: 'confirmed', paymentStage: null, wasPaid: false }), 'awaiting_payment')
  })

  test('every stage the payment core can produce lands somewhere', () => {
    for (const stage of PAYMENT_STAGES) {
      const bucket = reservationBucketFor({ status: 'confirmed', paymentStage: stage, wasPaid: false })
      assert.ok(RESERVATION_FILTER_ORDER.includes(bucket), `${stage} → ${bucket}`)
    }
  })
})

describe('reservationBucketFor — how a cancellation splits', () => {
  test('100% back is Refunded', () => {
    assert.equal(reservationBucketFor({ status: 'cancelled', refundPercent: 100, wasPaid: true }), 'refunded')
  })

  test('part of it back is Partially refunded', () => {
    for (const pct of [1, 25, 50, 99]) {
      assert.equal(reservationBucketFor({ status: 'cancelled', refundPercent: pct, wasPaid: true }), 'partially_refunded', `${pct}%`)
    }
  })

  test('nothing back is a plain Cancelled, not a refund of zero', () => {
    assert.equal(reservationBucketFor({ status: 'cancelled', refundPercent: 0, wasPaid: true }), 'cancelled')
  })

  test('a cancellation from before the refund ladder shipped reads as Cancelled', () => {
    assert.equal(reservationBucketFor({ status: 'cancelled', refundPercent: null, wasPaid: true }), 'cancelled')
    assert.equal(reservationBucketFor({ status: 'cancelled', wasPaid: true }), 'cancelled')
  })

  // ⚠️ The bug the wasPaid argument was added for. `refund_percent` is stamped from the
  // listing's cancellation policy the moment a guest cancels, whether or not anything
  // was ever paid — verified against the live endpoint: cancelling a pending, UNPAID
  // booking a fortnight out wrote `refund_percent = 100`, and the guest's own Trips
  // list told them the stay had been "Refunded". Money back that was never money in.
  test('a booking cancelled before the guest ever paid is Cancelled, not Refunded', () => {
    for (const pct of [1, 50, 99, 100]) {
      assert.equal(
        reservationBucketFor({ status: 'cancelled', refundPercent: pct, wasPaid: false }),
        'cancelled',
        `${pct}% of nothing is not a refund`
      )
    }
  })

  test('wasPaid only gates the refund chips — it cannot move a live booking', () => {
    assert.equal(reservationBucketFor({ status: 'confirmed', paymentStage: 'paid', wasPaid: false }), 'confirmed')
    assert.equal(reservationBucketFor({ status: 'completed', paymentStage: 'paid', wasPaid: false }), 'completed')
    assert.equal(reservationBucketFor({ status: 'pending', wasPaid: false }), 'pending')
    assert.equal(reservationBucketFor({ status: 'rejected', wasPaid: false }), 'rejected')
  })

  test('a percentage outside 0–100, or not a number, cannot mis-file a row', () => {
    const at = (refundPercent) => reservationBucketFor({ status: 'cancelled', refundPercent, wasPaid: true })
    assert.equal(at(140), 'refunded')
    assert.equal(at(-20), 'cancelled')
    assert.equal(at(Number.NaN), 'cancelled')
    assert.equal(at(Number.POSITIVE_INFINITY), 'cancelled')
  })
})

describe('reservationFilterMatches', () => {
  test('All takes every bucket', () => {
    for (const bucket of RESERVATION_FILTER_ORDER.filter((f) => f !== 'all')) {
      assert.equal(reservationFilterMatches('all', bucket), true)
    }
  })

  test('a chip takes only its own bucket', () => {
    assert.equal(reservationFilterMatches('confirmed', 'confirmed'), true)
    assert.equal(reservationFilterMatches('awaiting_payment', 'under_review'), false)
  })

  test('the refund chips do not double as Cancelled — the buckets are a partition', () => {
    assert.equal(reservationFilterMatches('refunded', 'refunded'), true)
    assert.equal(reservationFilterMatches('cancelled', 'refunded'), false)
  })
})

describe('reservationFilterCounts', () => {
  const sample = [
    reservationBucketFor({ status: 'pending', wasPaid: false }),
    reservationBucketFor({ status: 'pending', wasPaid: false }),
    reservationBucketFor({ status: 'confirmed', paymentStage: 'awaiting_payment', wasPaid: false }),
    reservationBucketFor({ status: 'confirmed', paymentStage: 'under_review', wasPaid: false }),
    reservationBucketFor({ status: 'confirmed', paymentStage: 'paid', wasPaid: false }),
    reservationBucketFor({ status: 'completed', paymentStage: 'paid', wasPaid: false }),
    reservationBucketFor({ status: 'rejected', wasPaid: false }),
    reservationBucketFor({ status: 'cancelled', refundPercent: 0, wasPaid: true }),
    reservationBucketFor({ status: 'cancelled', refundPercent: 50, wasPaid: true }),
    reservationBucketFor({ status: 'cancelled', refundPercent: 100, wasPaid: true }),
  ]

  test('counts each bucket and totals them under All', () => {
    const counts = reservationFilterCounts(sample)
    assert.equal(counts.all, 10)
    assert.equal(counts.pending, 2)
    assert.equal(counts.awaiting_payment, 1)
    assert.equal(counts.under_review, 1)
    assert.equal(counts.confirmed, 1)
    assert.equal(counts.completed, 1)
    assert.equal(counts.rejected, 1)
    assert.equal(counts.cancelled, 1)
    assert.equal(counts.partially_refunded, 1)
    assert.equal(counts.refunded, 1)
  })

  test('a bucket with nothing in it counts zero rather than going missing — a chip badged 0 is the answer, not a reason to tap', () => {
    const counts = reservationFilterCounts([reservationBucketFor({ status: 'confirmed', paymentStage: 'paid', wasPaid: false })])
    for (const key of RESERVATION_FILTER_ORDER) {
      assert.equal(typeof counts[key], 'number', `${key} has no count`)
    }
    assert.equal(counts.refunded, 0)
    assert.equal(counts.pending, 0)
  })

  test('no reservations at all means every chip reads zero', () => {
    const counts = reservationFilterCounts([])
    for (const key of RESERVATION_FILTER_ORDER) assert.equal(counts[key], 0)
  })

  test('a bucket literally named all cannot inflate its own chip', () => {
    const counts = reservationFilterCounts(['all', 'pending'])
    assert.equal(counts.all, 2)
    assert.equal(counts.pending, 1)
  })

  test('a bucket the UI does not know still counts under All and invents no key', () => {
    const counts = reservationFilterCounts(['pending', 'archived'])
    assert.equal(counts.all, 2)
    assert.equal(counts.pending, 1)
    assert.equal(Object.keys(counts).length, RESERVATION_FILTER_ORDER.length)
  })

  // The property that keeps the badge honest: what a chip says is what it shows.
  test('every count equals what its own chip would actually render', () => {
    const counts = reservationFilterCounts(sample)
    for (const key of RESERVATION_FILTER_ORDER) {
      const shown = sample.filter((b) => reservationFilterMatches(key, b)).length
      assert.equal(counts[key], shown, `${key} is badged ${counts[key]} but shows ${shown}`)
    }
  })

  test('the buckets partition All — every reservation is behind exactly one chip', () => {
    const counts = reservationFilterCounts(sample)
    const summed = RESERVATION_FILTER_ORDER.filter((k) => k !== 'all').reduce((sum, k) => sum + counts[k], 0)
    assert.equal(summed, counts.all)
  })
})

// ---- Agreement with the host module ----------------------------------------

describe('the guest and host folds agree wherever they must', () => {
  const STATUSES = ['pending', 'confirmed', 'completed', 'rejected', 'cancelled', 'canceled', 'archived', '', null]
  const REFUNDS = [null, 0, 1, 50, 99, 100, 140, -20, Number.NaN]
  const PAID = [true, false]

  test('a cancellation is filed identically on both sides — one reservation, one word', () => {
    for (const status of ['cancelled', 'canceled']) {
      for (const refundPercent of REFUNDS) {
        for (const wasPaid of PAID) {
        const input = { status, refundPercent, wasPaid }
        assert.equal(
          reservationBucketFor(input),
          hostBookingBucketFor(input),
          `${status} @ ${refundPercent} paid=${wasPaid}`
        )
        }
      }
    }
  })

  test('rejected, pending and an unknown status are filed identically too', () => {
    for (const status of ['rejected', 'pending', 'archived', '', null]) {
      for (const paymentStage of PAYMENT_STAGES) {
        const input = { status, paymentStage, wasPaid: true }
        assert.equal(reservationBucketFor(input), hostBookingBucketFor(input), `${status}/${paymentStage}`)
      }
    }
  })

  test('a paid confirmed booking is Confirmed on both sides', () => {
    const input = { status: 'confirmed', paymentStage: 'paid', wasPaid: true }
    assert.equal(reservationBucketFor(input), 'confirmed')
    assert.equal(hostBookingBucketFor(input), 'confirmed')
  })

  // The two deliberate divergences. If either of these ever starts agreeing, the
  // guest has silently lost a chip this module was written to give them.
  test('DIVERGES on under_review: a chip for the guest, awaiting payment for the host', () => {
    const input = { status: 'confirmed', paymentStage: 'under_review', wasPaid: false }
    assert.equal(reservationBucketFor(input), 'under_review')
    assert.equal(hostBookingBucketFor(input), 'awaiting_payment')
  })

  test('DIVERGES on completed: a chip for the guest, folded into confirmed for the host', () => {
    const input = { status: 'completed', paymentStage: 'paid', wasPaid: true }
    assert.equal(reservationBucketFor(input), 'completed')
    assert.equal(hostBookingBucketFor(input), 'confirmed')
  })

  test('and nowhere else — every other input pair folds the same', () => {
    const divergent = []
    for (const status of STATUSES) {
      for (const paymentStage of PAYMENT_STAGES) {
        for (const refundPercent of REFUNDS) {
          for (const wasPaid of PAID) {
          const input = { status, paymentStage, refundPercent, wasPaid }
          const guest = reservationBucketFor(input)
          const host = hostBookingBucketFor(input)
          if (guest === host) continue
          const expected =
            (status === 'confirmed' && paymentStage === 'under_review') || status === 'completed'
          if (!expected) divergent.push(`${status}/${paymentStage}/${refundPercent}/${wasPaid}: ${guest} vs ${host}`)
          }
        }
      }
    }
    assert.deepEqual(divergent, [])
  })
})
