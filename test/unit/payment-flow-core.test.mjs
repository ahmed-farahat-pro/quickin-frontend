// Unit tests for src/lib/local/payment-flow-core.ts — where a booking sits in the
// Instapay payment flow, and what an admin's decision writes.
//
// Offline: no database, no network. Run with `npm test`.
// The explicit `.ts` extension is required — Node strips types but its ESM resolver
// needs the extension, and payment-flow-core.ts has no relative imports, which is what
// makes it loadable here. See the backend README → Testing.
//
// The test that matters most is "a submitted proof is never awaiting_payment". The web
// used to read a derived paid/unpaid field, so a guest who had already transferred was
// shown Pay now again — this is the guard against that coming back.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  PROOF_STATUSES,
  PAYMENT_STATES,
  PAYMENT_STAGES,
  PAYMENT_REVIEW_ACTIONS,
  MAX_PROOF_CHARS,
  MAX_REJECT_REASON,
  PaymentProofError,
  isPaymentReviewAction,
  normalizePaymentState,
  normalizeProofStatus,
  paymentStageFor,
  canPay,
  stageLabelKey,
  stageTone,
  outcomeFor,
  normalizeRejectReason,
  assertProofImage,
} from '../../src/lib/local/payment-flow-core.ts'

const confirmed = (over = {}) => ({ status: 'confirmed', payment_state: 'unpaid', ...over })

describe('vocabulary', () => {
  test('normalizePaymentState falls back to unpaid, never to paid', () => {
    for (const s of PAYMENT_STATES) assert.equal(normalizePaymentState(s), s)
    for (const v of [null, undefined, '', 'garbage', 'PAID ', 7]) {
      const out = normalizePaymentState(v)
      if (v === 'PAID ') assert.equal(out, 'paid', 'trims and lowercases')
      else assert.equal(out, 'unpaid')
    }
  })

  test('normalizeProofStatus returns null when there is no proof', () => {
    for (const s of PROOF_STATUSES) assert.equal(normalizeProofStatus(s), s)
    for (const v of [null, undefined, '', 'approved-ish']) assert.equal(normalizeProofStatus(v), null)
  })

  test('isPaymentReviewAction gates the admin route body', () => {
    for (const a of PAYMENT_REVIEW_ACTIONS) assert.equal(isPaymentReviewAction(a), true)
    for (const v of ['approve', 'uphold', 'delete', '', null]) assert.equal(isPaymentReviewAction(v), false)
  })
})

describe('paymentStageFor', () => {
  test('a confirmed booking with nothing paid is awaiting payment', () => {
    assert.equal(paymentStageFor(confirmed()), 'awaiting_payment')
  })

  test('A SUBMITTED PROOF IS NEVER awaiting_payment — the double-pay bug', () => {
    // Every shape the submitted state can arrive in.
    assert.equal(paymentStageFor(confirmed({ payment_state: 'submitted' })), 'under_review')
    assert.equal(paymentStageFor(confirmed({ payment_proof_status: 'submitted' })), 'under_review')
    assert.equal(
      paymentStageFor(confirmed({ payment_state: 'submitted', payment_proof_status: 'submitted' })),
      'under_review',
    )
    // And the guest must not be invited to pay again.
    assert.equal(canPay(confirmed({ payment_state: 'submitted' })), false)
  })

  test('a dispute is also under review — the guest is waiting on us', () => {
    assert.equal(paymentStageFor(confirmed({ payment_state: 'disputed' })), 'under_review')
    assert.equal(paymentStageFor(confirmed({ payment_proof_status: 'disputed' })), 'under_review')
  })

  test('paid wins over everything', () => {
    assert.equal(paymentStageFor(confirmed({ payment_state: 'paid' })), 'paid')
    assert.equal(paymentStageFor(confirmed({ payment_proof_status: 'approved' })), 'paid')
    assert.equal(paymentStageFor(confirmed({ paid_at: '2026-08-01T00:00:00Z' })), 'paid')
    // Even mid-dispute, an approved proof means the money landed.
    assert.equal(paymentStageFor(confirmed({ payment_state: 'paid', payment_proof_status: 'disputed' })), 'paid')
  })

  test('a rejected screenshot is fixable, not fatal', () => {
    const b = confirmed({ payment_state: 'rejected', payment_proof_status: 'rejected' })
    assert.equal(paymentStageFor(b), 'rejected')
    assert.equal(canPay(b), true, 'the guest can upload a clearer photo')
  })

  test('payment only opens once the host has confirmed the reservation', () => {
    assert.equal(paymentStageFor({ status: 'pending', payment_state: 'unpaid' }), 'not_payable')
    assert.equal(canPay({ status: 'pending' }), false)
  })

  test('a dead booking is never payable, whatever its payment columns say', () => {
    for (const status of ['cancelled', 'rejected']) {
      assert.equal(paymentStageFor({ status, payment_state: 'unpaid' }), 'not_payable')
      assert.equal(canPay({ status, payment_state: 'rejected' }), false)
      // ...but if it was genuinely paid before being cancelled, say so.
      assert.equal(paymentStageFor({ status, payment_state: 'paid' }), 'paid')
    }
  })

  test('every stage has a label key and a tone', () => {
    for (const s of PAYMENT_STAGES) {
      assert.match(stageLabelKey(s), /^payment\./)
      assert.ok(['green', 'amber', 'red', 'neutral'].includes(stageTone(s)))
    }
    assert.equal(stageTone('paid'), 'green')
    assert.equal(stageTone('under_review'), 'amber')
    assert.equal(stageTone('rejected'), 'red')
  })
})

describe('outcomeFor — what an admin decision writes', () => {
  test('accept marks it paid', () => {
    assert.deepEqual(outcomeFor('accept'), {
      proofStatus: 'approved', paymentState: 'paid', markPaid: true,
    })
  })

  test('reject does NOT mark it paid, and touches no booking status', () => {
    const out = outcomeFor('reject')
    assert.deepEqual(out, { proofStatus: 'rejected', paymentState: 'rejected', markPaid: false })
    // The whole point: a bad screenshot must not cancel a real reservation.
    assert.equal('bookingStatus' in out, false)
  })

  test('a rejected booking round-trips back to payable', () => {
    const after = confirmed({
      payment_state: outcomeFor('reject').paymentState,
      payment_proof_status: outcomeFor('reject').proofStatus,
    })
    assert.equal(canPay(after), true)
  })
})

describe('normalizeRejectReason', () => {
  test('trims, empties to null, and caps', () => {
    assert.equal(normalizeRejectReason('  wrong amount  '), 'wrong amount')
    assert.equal(normalizeRejectReason(''), null)
    assert.equal(normalizeRejectReason(null), null)
    assert.equal(normalizeRejectReason('x'.repeat(MAX_REJECT_REASON + 100)).length, MAX_REJECT_REASON)
  })
})

describe('assertProofImage', () => {
  test('accepts a base64 image and an https link', () => {
    assert.equal(assertProofImage('data:image/jpeg;base64,QUJD'), 'data:image/jpeg;base64,QUJD')
    assert.equal(assertProofImage('https://cdn.example/proof.png'), 'https://cdn.example/proof.png')
  })

  test('rejects an empty or non-image payload', () => {
    for (const v of [null, undefined, '', '   ']) {
      assert.throws(() => assertProofImage(v), PaymentProofError)
    }
    for (const v of ['data:text/html;base64,QUJD', 'javascript:alert(1)', 'QUJD']) {
      assert.throws(() => assertProofImage(v), PaymentProofError)
    }
  })

  test('rejects anything over the 3.5MB cap the server enforces', () => {
    const huge = 'data:image/jpeg;base64,' + 'A'.repeat(MAX_PROOF_CHARS)
    assert.throws(() => assertProofImage(huge), PaymentProofError)
    // Just under is fine.
    const ok = 'data:image/jpeg;base64,' + 'A'.repeat(MAX_PROOF_CHARS - 100)
    assert.equal(assertProofImage(ok).length, MAX_PROOF_CHARS - 100 + 'data:image/jpeg;base64,'.length)
  })
})
