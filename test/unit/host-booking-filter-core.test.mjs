// Unit tests for src/lib/local/host-booking-filter-core.ts — the host
// reservations status filter: which chips exist, which bucket a reservation
// falls into, and the count each chip is badged with.
//
// Offline: no database, no network. Run with `npm test`.
// The explicit `.ts` extension is required — Node strips types but its ESM
// resolver needs the extension, and host-booking-filter-core.ts has no relative
// imports, which is what makes it loadable here. See the backend README → Testing.
//
// The tests that matter most are the ones asserting a cancelled or rejected
// reservation NEVER lands under "Awaiting payment". That chip is a to-do list of
// money still owed to the host; a dead booking sitting in it is a host chasing a
// guest for a stay that no longer exists.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  BOOKING_STATUSES,
  HOST_BOOKING_FILTER_ORDER,
  hostBookingBucketFor,
  hostBookingFilterCounts,
  hostBookingFilterMatches,
} from '../../src/lib/local/host-booking-filter-core.ts'
import { PAYMENT_STAGES, everPaid, paymentStageFor } from '../../src/lib/local/payment-flow-core.ts'

describe('HOST_BOOKING_FILTER_ORDER', () => {
  test('leads with All, then the host lifecycle in reading order', () => {
    assert.deepEqual(HOST_BOOKING_FILTER_ORDER, [
      'all',
      'pending',
      'awaiting_payment',
      'confirmed',
      'rejected',
      'cancelled',
      'refunded',
      'partially_refunded',
    ])
  })

  test('rejected and cancelled are separate chips', () => {
    // A host declined the one and a guest cancelled the other. Folding them
    // together would make both counts lie.
    assert.ok(HOST_BOOKING_FILTER_ORDER.includes('rejected'))
    assert.ok(HOST_BOOKING_FILTER_ORDER.includes('cancelled'))
  })

  test('every chip except All is a bucket some reservation can reach', () => {
    const reachable = new Set([
      hostBookingBucketFor({ status: 'pending' }),
      hostBookingBucketFor({ status: 'confirmed', paymentStage: 'awaiting_payment' }),
      hostBookingBucketFor({ status: 'confirmed', paymentStage: 'paid' }),
      hostBookingBucketFor({ status: 'rejected' }),
      hostBookingBucketFor({ status: 'cancelled', refundPercent: 0, wasPaid: true }),
      hostBookingBucketFor({ status: 'cancelled', refundPercent: 100, wasPaid: true }),
      hostBookingBucketFor({ status: 'cancelled', refundPercent: 50, wasPaid: true }),
    ])
    for (const chip of HOST_BOOKING_FILTER_ORDER) {
      if (chip === 'all') continue
      assert.ok(reachable.has(chip), `no reservation can reach the ${chip} chip`)
    }
  })
})

describe('vocabulary stays in step with the modules it mirrors', () => {
  test('BOOKING_STATUSES matches the backend list', () => {
    // Mirrored from BOOKING_STATUSES in the backend's admin.ts, which is what
    // the write path validates against.
    assert.deepEqual([...BOOKING_STATUSES], ['pending', 'confirmed', 'completed', 'rejected', 'cancelled'])
  })

  test('every payment stage is one this module handles', () => {
    // The stage type here is restated rather than imported (a core with a
    // relative import is one node --test cannot load). This is the guard that
    // the restatement has not drifted from payment-flow-core.
    assert.deepEqual([...PAYMENT_STAGES], [
      'not_payable',
      'awaiting_payment',
      'under_review',
      'paid',
      'rejected',
    ])
    for (const stage of PAYMENT_STAGES) {
      const bucket = hostBookingBucketFor({ status: 'confirmed', paymentStage: stage })
      assert.ok(
        bucket === 'confirmed' || bucket === 'awaiting_payment',
        `stage ${stage} produced ${bucket}`
      )
    }
  })
})

describe('hostBookingBucketFor', () => {
  test('a request waiting on the host is pending', () => {
    assert.equal(hostBookingBucketFor({ status: 'pending' }), 'pending')
  })

  test('pending wins even when payment columns say otherwise', () => {
    // A guest can upload a transfer screenshot before the host has replied.
    // That is still a request waiting on the host, not money waiting on the guest.
    assert.equal(
      hostBookingBucketFor({ status: 'pending', paymentStage: 'under_review' }),
      'pending'
    )
  })

  test('confirmed and paid is confirmed', () => {
    assert.equal(hostBookingBucketFor({ status: 'confirmed', paymentStage: 'paid' }), 'confirmed')
  })

  test('confirmed but not paid is awaiting payment', () => {
    for (const stage of ['awaiting_payment', 'under_review', 'rejected', 'not_payable']) {
      assert.equal(
        hostBookingBucketFor({ status: 'confirmed', paymentStage: stage }),
        'awaiting_payment',
        `stage ${stage}`
      )
    }
  })

  test('a missing payment stage reads as unpaid, not paid', () => {
    // A client that has not wired the payment columns through must not have
    // every confirmed reservation silently claim the money arrived.
    assert.equal(hostBookingBucketFor({ status: 'confirmed' }), 'awaiting_payment')
    assert.equal(hostBookingBucketFor({ status: 'confirmed', paymentStage: null }), 'awaiting_payment')
  })

  test('completed folds into confirmed', () => {
    assert.equal(hostBookingBucketFor({ status: 'completed', paymentStage: 'paid' }), 'confirmed')
  })

  test('a host decline is rejected, whatever the payment said', () => {
    assert.equal(hostBookingBucketFor({ status: 'rejected' }), 'rejected')
    assert.equal(hostBookingBucketFor({ status: 'rejected', paymentStage: 'paid' }), 'rejected')
  })

  test('a dead reservation is never awaiting payment', () => {
    // The regression this whole ordering exists to prevent: "Awaiting payment"
    // is a to-do list of money still coming, so a cancelled or rejected booking
    // must never appear in it.
    for (const status of ['cancelled', 'rejected']) {
      for (const stage of PAYMENT_STAGES) {
        assert.notEqual(
          hostBookingBucketFor({ status, paymentStage: stage, refundPercent: 40, wasPaid: true }),
          'awaiting_payment',
          `${status} + ${stage}`
        )
      }
    }
  })

  test('an unknown status reads as pending rather than vanishing', () => {
    // bookings.status has no check constraint. A row that matches no chip is a
    // reservation the host never sees; one under Pending is one they dismiss.
    assert.equal(hostBookingBucketFor({ status: 'expired' }), 'pending')
    assert.equal(hostBookingBucketFor({ status: '' }), 'pending')
    assert.equal(hostBookingBucketFor({}), 'pending')
    assert.equal(hostBookingBucketFor({ status: null }), 'pending')
  })

  test('status is read case- and whitespace-insensitively', () => {
    assert.equal(hostBookingBucketFor({ status: '  Cancelled ' }), 'cancelled')
    assert.equal(hostBookingBucketFor({ status: 'REJECTED' }), 'rejected')
  })

  test('the American spelling of cancelled is understood', () => {
    assert.equal(hostBookingBucketFor({ status: 'canceled', refundPercent: 100, wasPaid: true }), 'refunded')
  })
})

describe('how a cancellation splits on the refund', () => {
  test('a full refund is refunded', () => {
    assert.equal(hostBookingBucketFor({ status: 'cancelled', refundPercent: 100, wasPaid: true }), 'refunded')
  })

  test('a partial refund is partially refunded', () => {
    for (const pct of [1, 25, 50, 99]) {
      assert.equal(
        hostBookingBucketFor({ status: 'cancelled', refundPercent: pct, wasPaid: true }),
        'partially_refunded',
        `${pct}%`
      )
    }
  })

  test('a strict-policy cancellation with nothing back is plain cancelled', () => {
    assert.equal(hostBookingBucketFor({ status: 'cancelled', refundPercent: 0, wasPaid: true }), 'cancelled')
  })

  test('a cancellation from before the refund ladder is plain cancelled', () => {
    // Legacy rows have no refund_percent. Reporting them as "Refunded" would
    // tell the host money moved when nothing was ever recorded.
    assert.equal(hostBookingBucketFor({ status: 'cancelled', refundPercent: null, wasPaid: true }), 'cancelled')
    assert.equal(hostBookingBucketFor({ status: 'cancelled', wasPaid: true }), 'cancelled')
  })

  test('a nonsense percent is clamped, not trusted', () => {
    assert.equal(hostBookingBucketFor({ status: 'cancelled', refundPercent: 140, wasPaid: true }), 'refunded')
    assert.equal(hostBookingBucketFor({ status: 'cancelled', refundPercent: -5, wasPaid: true }), 'cancelled')
    assert.equal(hostBookingBucketFor({ status: 'cancelled', refundPercent: NaN, wasPaid: true }), 'cancelled')
  })

  // ⚠️ The bug this argument was added for. `refund_percent` is stamped from the
  // listing's cancellation policy the moment a guest cancels, whether or not anything
  // was ever paid — verified against the live endpoint: cancelling a pending, UNPAID
  // booking a fortnight out wrote `refund_percent = 100`. Splitting on the column alone
  // called that "Refunded", to a host who had never received a pound.
  test('a cancellation of a booking nobody ever paid for is plain cancelled', () => {
    for (const pct of [1, 50, 99, 100]) {
      assert.equal(
        hostBookingBucketFor({ status: 'cancelled', refundPercent: pct, wasPaid: false }),
        'cancelled',
        `${pct}% of nothing is not a refund`
      )
    }
  })

  test('wasPaid only gates the refund chips — it cannot move a live booking', () => {
    assert.equal(
      hostBookingBucketFor({ status: 'confirmed', paymentStage: 'paid', wasPaid: false }),
      'confirmed'
    )
    assert.equal(hostBookingBucketFor({ status: 'pending', wasPaid: false }), 'pending')
    assert.equal(hostBookingBucketFor({ status: 'rejected', wasPaid: false }), 'rejected')
  })

  test('the refund only splits a cancellation, never a live booking', () => {
    // refund_percent is only ever written alongside a cancellation, but a stray
    // value must not pull a live reservation out of its bucket.
    assert.equal(
      hostBookingBucketFor({ status: 'confirmed', paymentStage: 'paid', refundPercent: 100, wasPaid: true }),
      'confirmed'
    )
    assert.equal(hostBookingBucketFor({ status: 'pending', refundPercent: 50, wasPaid: true }), 'pending')
  })
})

describe('hostBookingFilterMatches', () => {
  test('All takes every bucket', () => {
    for (const chip of HOST_BOOKING_FILTER_ORDER) {
      if (chip === 'all') continue
      assert.ok(hostBookingFilterMatches('all', chip), chip)
    }
  })

  test('a bucket chip takes only its own bucket', () => {
    assert.ok(hostBookingFilterMatches('refunded', 'refunded'))
    assert.equal(hostBookingFilterMatches('refunded', 'partially_refunded'), false)
    assert.equal(hostBookingFilterMatches('cancelled', 'rejected'), false)
  })
})

describe('hostBookingFilterCounts', () => {
  test('each chip is counted, and All holds the total', () => {
    const counts = hostBookingFilterCounts([
      'pending',
      'pending',
      'awaiting_payment',
      'confirmed',
      'confirmed',
      'confirmed',
      'rejected',
      'cancelled',
      'refunded',
      'partially_refunded',
    ])
    assert.equal(counts.all, 10)
    assert.equal(counts.pending, 2)
    assert.equal(counts.awaiting_payment, 1)
    assert.equal(counts.confirmed, 3)
    assert.equal(counts.rejected, 1)
    assert.equal(counts.cancelled, 1)
    assert.equal(counts.refunded, 1)
    assert.equal(counts.partially_refunded, 1)
  })

  test('a chip with nothing behind it reads zero rather than going missing', () => {
    const counts = hostBookingFilterCounts(['pending'])
    for (const chip of HOST_BOOKING_FILTER_ORDER) {
      assert.equal(typeof counts[chip], 'number', chip)
    }
    assert.equal(counts.refunded, 0)
  })

  test('an empty list counts zero everywhere', () => {
    const counts = hostBookingFilterCounts([])
    for (const chip of HOST_BOOKING_FILTER_ORDER) {
      assert.equal(counts[chip], 0, chip)
    }
  })

  test('the bucket counts sum to the total — every reservation is in exactly one', () => {
    const buckets = ['pending', 'confirmed', 'refunded', 'cancelled', 'awaiting_payment', 'confirmed']
    const counts = hostBookingFilterCounts(buckets)
    const summed = HOST_BOOKING_FILTER_ORDER
      .filter((chip) => chip !== 'all')
      .reduce((total, chip) => total + counts[chip], 0)
    assert.equal(summed, counts.all)
  })

  test("a value the UI does not know still counts under All", () => {
    const counts = hostBookingFilterCounts(['pending', 'not_a_bucket'])
    assert.equal(counts.all, 2)
    assert.equal(counts.pending, 1)
  })
})

describe('end to end, against the real payment fold', () => {
  // Composing paymentStageFor with the bucket fold is how every client will use
  // this, so the seam gets its own coverage rather than only the halves.
  const bucketOf = (row) =>
    hostBookingBucketFor({
      status: row.status,
      paymentStage: paymentStageFor(row),
      refundPercent: row.refund_percent,
      wasPaid: everPaid(row),
    })

  test('a guest who has transferred but not been reviewed is still awaiting payment', () => {
    assert.equal(
      bucketOf({ status: 'confirmed', payment_state: 'submitted', payment_proof_status: 'submitted' }),
      'awaiting_payment'
    )
  })

  test('an approved transfer moves the reservation to confirmed', () => {
    assert.equal(
      bucketOf({ status: 'confirmed', payment_state: 'paid', paid_at: '2026-08-01T00:00:00Z' }),
      'confirmed'
    )
  })

  test('a declined screenshot leaves the reservation awaiting payment, not rejected', () => {
    // Rejecting a blurry transfer must not read as the host rejecting the stay.
    assert.equal(
      bucketOf({ status: 'confirmed', payment_state: 'rejected', payment_proof_status: 'rejected' }),
      'awaiting_payment'
    )
  })

  // The bug, end to end and in the shape the database actually produces. Captured from
  // the live endpoint: POST /api/local/bookings/:id/cancel on a pending, never-paid
  // booking wrote exactly this row, and the chip read "Refunded".
  test('a booking cancelled before anyone paid is cancelled, not refunded', () => {
    assert.equal(
      bucketOf({
        status: 'cancelled',
        payment_state: 'unpaid',
        paid_at: null,
        // Stamped by the flexible policy on the way out, with no money behind it.
        refund_percent: 100,
      }),
      'cancelled'
    )
  })

  // ⚠️ The paid_at trap, through the whole composition: a refund clears paid_at, so the
  // ONLY thing that still knows money moved is the payment column.
  test('a legacy refunded booking is still found once paid_at has been wiped', () => {
    assert.equal(
      bucketOf({ status: 'cancelled', payment_state: 'refunded', paid_at: null, refund_percent: 100 }),
      'refunded'
    )
  })

  test('a paid stay that the guest later cancelled reads by its refund', () => {
    assert.equal(
      bucketOf({
        status: 'cancelled',
        payment_state: 'paid',
        paid_at: '2026-08-01T00:00:00Z',
        refund_percent: 50,
      }),
      'partially_refunded'
    )
  })
})
