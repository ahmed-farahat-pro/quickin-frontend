// How a listing's photos and its ownership document are split across requests, so that no single
// request is refused for being too big.
//
// **The bug this exists for.** The host forms posted the whole listing at once, photos included,
// each one a base64 data URL of 300–700 KB. The API runs as a Vercel function and the platform
// refuses a request body over ~4.5 MB **before the function runs at all** — so nothing server-side
// saw the request, there was no `{"error"}` to render, and the host met a bare 413. On iOS, which
// reported it first, that surfaced as "Couldn't create the listing (413)."; here it is
// `errors.createFailed` over a listing that was never attempted. Measured against the deployed
// backend: a 4.19 MB body reaches the function (401 from its own auth), a 4.61 MB body comes back
// 413.
//
// The edit form already knew about the wall — it only sends `images` when the set actually changed
// — but that is a workaround for the text-only edit, not for the host who adds eight photos.
//
// **The fix.** One request per bundle that fits under MAX_REQUEST_BYTES: the create POST (or the
// edit PATCH) carries the first slice, `POST /api/local/listings/:id/images` appends the rest, and
// a large ownership document travels in its own PATCH. Photo quality is untouched — re-encoding
// smaller was the other way to make ten photos fit, and it makes every listing worse to serve a
// limit that has nothing to do with photos.
//
// Two rules the plan cannot break:
//
// 1. **The first request always carries at least one photo.** `checkListingCompleteness` refuses a
//    listing with none, so "send an empty set, then append everything" answers 400.
// 2. **Order is display order.** The deferred photos are the TAIL of the wanted order and the
//    append endpoint puts each batch after the previous one, so the order the host arranged
//    survives being cut into pieces — including on the edit form's replacement path, where the
//    PATCH replaces the set with the prefix and the appends rebuild the rest of it.
//
// Pure: no React, no fetch, no relative imports — it decides only what goes in which request, and
// the last of those is what lets `node --test` load it (see README → Testing). Unit-tested by
// `test/unit/listing-photo-upload.test.mjs`.
//
// KEEP IN SYNC — iOS's `ListingPhotoUpload.swift` and Android's `ListingPhotoUpload.kt` answer the
// same question with the same numbers.

/**
 * The most JSON one request may carry, in bytes.
 *
 * The wall measured on the deployed backend sits between 4.19 MB (passes) and 4.61 MB (413) — i.e.
 * Vercel's documented 4.5 MB body limit. This is deliberately well under it: the margin covers the
 * JSON scaffolding around the photos, and a smaller body is also a shorter upload.
 */
export const MAX_REQUEST_BYTES = 3_500_000

/** What `{"images":[…]}` costs around the photos themselves. */
export const APPEND_OVERHEAD_BYTES = 64

/**
 * What one data URL costs inside a JSON array: the string, its two quotes and the comma after it.
 * Data URLs are base64, so nothing in them escapes — but an https url is measured the same way and
 * costs ~100 bytes, which is the point of the Blob migration.
 */
export function bodyBytes(url: string): number {
  return new TextEncoder().encode(url).length + 3
}

/** Which photos ride along with the first request, and which follow it. */
export interface PhotoUploadPlan {
  /** Photos to send as `images` in the create POST / edit PATCH. Non-empty whenever the host
   *  attached any — see rule 1 above. */
  withRequest: string[]
  /** Follow-up `POST /api/local/listings/:id/images` batches, in display order. */
  appended: string[][]
  /** True when the document did not fit alongside the first body and has to be sent as
   *  `PATCH /api/local/listings/:id { ownership_doc }` afterwards. */
  docDeferred: boolean
}

/** How many photos a plan leaves for the append requests. */
export function appendedCount(plan: PhotoUploadPlan): number {
  return plan.appended.reduce((n, batch) => n + batch.length, 0)
}

/**
 * Plan the requests for one create, or for one full photo-set replacement.
 *
 * `docBytes` is `bodyBytes` of the ownership document (0 when there is none) and `fixedBytes` is
 * the rest of the body — title, address, prices, amenities. Measure it rather than guess: a
 * description is host-written and has no useful upper bound.
 */
export function planPhotoUpload(opts: {
  photos: string[]
  docBytes?: number
  fixedBytes?: number
  budget?: number
}): PhotoUploadPlan {
  const { photos, docBytes = 0, fixedBytes = 0, budget = MAX_REQUEST_BYTES } = opts
  const remaining = [...photos]
  const withRequest: string[] = []
  let used = fixedBytes

  // The cover goes first and unconditionally: a listing with no photo is refused outright, so a
  // photo too big to fit the budget is still better sent — and refused for its own, sayable
  // reason — than withheld here.
  const cover = remaining.shift()
  if (cover !== undefined) {
    withRequest.push(cover)
    used += bodyBytes(cover)
  }

  // The document is what an operator opens to approve the listing, so it travels with the first
  // request whenever it fits — a listing that reaches the queue without it reads as "Ownership
  // document: not added" until the follow-up PATCH lands.
  let docDeferred = docBytes > 0
  if (docBytes > 0 && used + docBytes <= budget) {
    used += docBytes
    docDeferred = false
  }

  // Then as many more photos as fit, so the common case (a few photos, no document) is still
  // exactly one request.
  while (remaining.length && used + bodyBytes(remaining[0]) <= budget) {
    const next = remaining.shift() as string
    withRequest.push(next)
    used += bodyBytes(next)
  }

  return { withRequest, appended: photoBatches(remaining, budget), docDeferred }
}

/**
 * Split photos into `POST /api/local/listings/:id/images` batches that each fit the budget,
 * preserving order. A photo bigger than the budget on its own gets a batch to itself rather than
 * being dropped — the server then answers with a reason the host can read.
 */
export function photoBatches(photos: string[], budget: number = MAX_REQUEST_BYTES): string[][] {
  const out: string[][] = []
  let current: string[] = []
  let used = APPEND_OVERHEAD_BYTES

  for (const url of photos) {
    const cost = bodyBytes(url)
    if (current.length && used + cost > budget) {
      out.push(current)
      current = []
      used = APPEND_OVERHEAD_BYTES
    }
    current.push(url)
    used += cost
  }
  if (current.length) out.push(current)
  return out
}
