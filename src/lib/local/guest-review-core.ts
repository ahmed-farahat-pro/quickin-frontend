// What makes a host→guest review submittable — pure, and DELIBERATELY free of
// runtime imports so `node --test` can load it as-is (see resort-core.ts,
// README → Testing).
//
// The backend validates the same three things and returns a 400 with a message
// (createGuestReview in quickin-backend's lib/local/reviews.ts). This is not a
// substitute for that check — it is what lets the form disable its own button
// instead of teaching the host the rules one failed round-trip at a time, which
// is how iOS and Android already behave.

/** Ratings are whole stars, 1 through 5. Zero means "not picked yet". */
export const MIN_RATING = 1
export const MAX_RATING = 5

/** Long enough for a real note about a guest, short enough that the column and
 *  the card that renders it both stay sane. Matches the listing review cap. */
export const MAX_COMMENT_LENGTH = 1000

export interface GuestReviewDraft {
  rating: number
  comment?: string | null
}

/**
 * Why this draft cannot be submitted, or null when it can.
 *
 * Returns a KEY, not a sentence: the four locales' wording lives in the message
 * catalogs, and a core module that returned English would put a fifth copy of
 * it here.
 *
 *   'rating_required' — no star picked yet (the initial state of the form)
 *   'rating_range'    — a star count outside 1–5, or a fractional one
 *   'comment_long'    — over MAX_COMMENT_LENGTH characters
 *
 * The comment itself is optional: a host who wants to leave four stars and
 * nothing else is allowed to, on every platform.
 */
export function guestReviewProblem(draft: GuestReviewDraft): string | null {
  const rating = Number(draft.rating)
  if (!rating) return 'rating_required'
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    return 'rating_range'
  }
  // Trimmed before measuring, because trailing whitespace is what the submit
  // strips anyway — failing on characters that are about to be removed would
  // block a comment that is, once sent, well inside the cap.
  const comment = (draft.comment ?? '').trim()
  if (comment.length > MAX_COMMENT_LENGTH) return 'comment_long'
  return null
}

/** Convenience for the submit button's `disabled`. */
export function canSubmitGuestReview(draft: GuestReviewDraft): boolean {
  return guestReviewProblem(draft) === null
}

/**
 * The body to POST to `/api/local/guest-reviews`.
 *
 * An empty comment is sent as null rather than '': the column is nullable, and
 * a row holding an empty string renders as a review with a blank body instead
 * of a rating on its own.
 */
export function guestReviewBody(bookingId: string, draft: GuestReviewDraft): {
  booking_id: string
  rating: number
  comment: string | null
} {
  const comment = (draft.comment ?? '').trim()
  return {
    booking_id: bookingId,
    rating: Number(draft.rating),
    comment: comment.length > 0 ? comment : null,
  }
}
