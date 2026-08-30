// Unit tests for src/lib/local/guest-review-core.ts — what the host→guest
// review form will let through, and the body it posts.
//
// Offline: no database, no network, no DOM. Run with `npm test`.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_COMMENT_LENGTH,
  canSubmitGuestReview,
  guestReviewBody,
  guestReviewProblem,
} from '../../src/lib/local/guest-review-core.ts'

describe('guestReviewProblem', () => {
  test('an untouched form is blocked on the rating, not the comment', () => {
    assert.equal(guestReviewProblem({ rating: 0 }), 'rating_required')
  })

  test('accepts each of the five whole stars', () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      assert.equal(guestReviewProblem({ rating }), null)
    }
  })

  test('refuses a rating outside 1–5', () => {
    assert.equal(guestReviewProblem({ rating: 6 }), 'rating_range')
    assert.equal(guestReviewProblem({ rating: -1 }), 'rating_range')
  })

  test('refuses half stars — the column holds whole ones', () => {
    assert.equal(guestReviewProblem({ rating: 4.5 }), 'rating_range')
  })

  test('the comment is optional', () => {
    assert.equal(guestReviewProblem({ rating: 4 }), null)
    assert.equal(guestReviewProblem({ rating: 4, comment: '' }), null)
    assert.equal(guestReviewProblem({ rating: 4, comment: null }), null)
  })

  test('refuses a comment over the cap', () => {
    assert.equal(
      guestReviewProblem({ rating: 4, comment: 'x'.repeat(MAX_COMMENT_LENGTH + 1) }),
      'comment_long',
    )
  })

  test('measures the comment after trimming, so padding cannot block a valid one', () => {
    const padded = ` ${'x'.repeat(MAX_COMMENT_LENGTH)}   `
    assert.equal(guestReviewProblem({ rating: 4, comment: padded }), null)
  })

  test('exactly at the cap is allowed', () => {
    assert.equal(
      guestReviewProblem({ rating: 5, comment: 'x'.repeat(MAX_COMMENT_LENGTH) }),
      null,
    )
  })
})

describe('canSubmitGuestReview', () => {
  test('mirrors guestReviewProblem for the button state', () => {
    assert.equal(canSubmitGuestReview({ rating: 0 }), false)
    assert.equal(canSubmitGuestReview({ rating: 3, comment: 'Lovely guest' }), true)
  })
})

describe('guestReviewBody', () => {
  test('sends the booking id, the rating and the trimmed comment', () => {
    assert.deepEqual(guestReviewBody('b-1', { rating: 5, comment: '  Great stay  ' }), {
      booking_id: 'b-1',
      rating: 5,
      comment: 'Great stay',
    })
  })

  test('an empty comment is sent as null, never as an empty string', () => {
    // A row holding '' renders as a review with a blank body instead of a
    // rating on its own.
    assert.deepEqual(guestReviewBody('b-2', { rating: 4, comment: '   ' }), {
      booking_id: 'b-2',
      rating: 4,
      comment: null,
    })
    assert.equal(guestReviewBody('b-3', { rating: 4 }).comment, null)
  })
})
