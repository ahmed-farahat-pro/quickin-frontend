// Unit tests for src/lib/listing-photo-upload.ts — how a listing's photos are split across
// requests so that none of them is refused for being too big.
//
// Offline: no database, no network, no browser. Run with `npm test`. Note the explicit `.ts`
// extension — Node 22 strips types but its ESM resolver needs it, and listing-photo-upload.ts has
// no relative imports, which is what makes it loadable here. See README → Testing.
//
// The reported defect (iOS first, the same code shape here): a host attaches the ten photos the
// form offers, submits, and the save fails. The cause is not in this codebase — the API runs as a
// Vercel function and the platform refuses a body over ~4.5 MB *before the function runs*, so
// nothing ever answered with a sentence. Measured against the deployed backend: 4.19 MB → 401
// (ours), 4.61 MB → 413 (Vercel's).
//
// The mirror suites are iOS's Tests/ListingPhotoUploadTests and Android's
// ListingPhotoUploadTest.kt: three hand-written twins that must answer with the same numbers, so a
// change to the budget or the split belongs in all three.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  APPEND_OVERHEAD_BYTES,
  MAX_REQUEST_BYTES,
  appendedCount,
  bodyBytes,
  photoBatches,
  planPhotoUpload,
} from '../../src/lib/listing-photo-upload.ts'

/** A stand-in data URL of a given payload size, shaped like the real thing. */
const photo = (bytes) => 'data:image/jpeg;base64,' + 'A'.repeat(Math.max(0, bytes - 23))

/** What fileToCompressedDataUrl(maxDim 1600, quality 0.72) produces at the top of its range. */
const BIG = 700_000
/** …and at the bottom of it. */
const SMALL = 180_000
/** A photo already in Blob: the whole point of the migration is that it costs ~100 bytes. */
const HOSTED = 'https://abc123.public.blob.vercel-storage.com/listings/x/photo-Ab3.jpg'

/** Every request a plan turns into, measured the way the planner measures. */
const requestSizes = (plan, fixedBytes, docBytes) => [
  plan.withRequest.reduce((n, url) => n + bodyBytes(url), fixedBytes + (plan.docDeferred ? 0 : docBytes)),
  ...plan.appended.map((batch) => batch.reduce((n, url) => n + bodyBytes(url), APPEND_OVERHEAD_BYTES)),
  ...(plan.docDeferred ? [docBytes + 64] : []),
]

describe('the reported defect: ten photos no longer travel in one body', () => {
  const ten = Array.from({ length: 10 }, () => photo(BIG))
  const plan = planPhotoUpload({ photos: ten, fixedBytes: 2_000 })

  test('all ten are still sent, just not all at once', () => {
    assert.equal(plan.withRequest.length + appendedCount(plan), 10)
    assert.ok(plan.appended.length >= 1)
  })

  test('every request the plan makes is under the budget', () => {
    for (const size of requestSizes(plan, 2_000, 0)) assert.ok(size <= MAX_REQUEST_BYTES, `${size}`)
  })

  test('and the budget stays under the smallest body measured to reach the function', () => {
    assert.ok(MAX_REQUEST_BYTES < 4_190_000)
  })
})

describe('the first request always carries a photo', () => {
  // checkListingCompleteness refuses a listing with none, so an empty first request answers 400.
  const ten = Array.from({ length: 10 }, () => photo(BIG))
  const plan = planPhotoUpload({ photos: ten, fixedBytes: 2_000 })

  test('ten big photos still leave one in the create body — the cover', () => {
    assert.equal(plan.withRequest[0], ten[0])
  })

  test('one over-budget photo is still sent rather than dropped', () => {
    // So the server answers "That image is too large" instead of the host meeting a silent refusal.
    const huge = planPhotoUpload({ photos: [photo(5_000_000)], fixedBytes: 2_000 })
    assert.equal(huge.withRequest.length, 1)
    assert.deepEqual(huge.appended, [])
  })

  test('no photos means no photo requests at all', () => {
    assert.deepEqual(planPhotoUpload({ photos: [], fixedBytes: 2_000 }), {
      withRequest: [],
      appended: [],
      docDeferred: false,
    })
  })
})

describe('order is display order — the cover is the cover, and the rest follow it', () => {
  test('flattening the plan gives back exactly the order the host arranged', () => {
    const ordered = Array.from({ length: 9 }, (_, i) => 'data:image/jpeg;base64,' + String(i).repeat(BIG))
    const plan = planPhotoUpload({ photos: ordered, fixedBytes: 2_000 })
    assert.deepEqual([...plan.withRequest, ...plan.appended.flat()], ordered)
  })
})

describe('the ordinary listing is still one request', () => {
  test('four ordinary photos: nothing is split, nothing extra is sent', () => {
    const few = planPhotoUpload({ photos: Array.from({ length: 4 }, () => photo(SMALL)), fixedBytes: 2_000 })
    assert.deepEqual(few.appended, [])
    assert.equal(few.withRequest.length, 4)
  })

  test('four big photos (2.8 MB) still fit one request; the fifth is what splits it', () => {
    const four = planPhotoUpload({ photos: Array.from({ length: 4 }, () => photo(BIG)), fixedBytes: 2_000 })
    assert.deepEqual(four.appended, [])
    const five = planPhotoUpload({ photos: Array.from({ length: 5 }, () => photo(BIG)), fixedBytes: 2_000 })
    assert.equal(five.withRequest.length, 4)
    assert.equal(appendedCount(five), 1)
  })

  test('a set of photos already in Blob is never split — that is what they cost now', () => {
    // The edit form's common case: ten hosted urls plus one new photo.
    const mixed = [...Array.from({ length: 10 }, () => HOSTED), photo(BIG)]
    const plan = planPhotoUpload({ photos: mixed, fixedBytes: 2_000 })
    assert.deepEqual(plan.appended, [])
    assert.equal(plan.withRequest.length, 11)
  })
})

describe('the ownership document, which is the other multi-MB thing in the body', () => {
  test('a document that fits travels with the first request', () => {
    // An operator opening the moderation queue should find the document already there.
    const plan = planPhotoUpload({ photos: [photo(SMALL)], docBytes: 400_000, fixedBytes: 2_000 })
    assert.equal(plan.docDeferred, false)
  })

  test('a 3.4 MB document is deferred, and the photos keep the body it vacated', () => {
    // ownership-doc-core caps a document at 3.5M chars — one that big cannot share a body.
    const plan = planPhotoUpload({
      photos: [photo(BIG), photo(BIG)],
      docBytes: 3_400_000,
      fixedBytes: 2_000,
    })
    assert.equal(plan.docDeferred, true)
    assert.equal(plan.withRequest.length, 2)
    assert.equal(appendedCount(plan), 0)
    for (const size of requestSizes(plan, 2_000, 3_400_000)) assert.ok(size <= MAX_REQUEST_BYTES, `${size}`)
  })
})

describe('batching on its own', () => {
  test('ten big photos are more than one append request, and each fits', () => {
    const batches = photoBatches(Array.from({ length: 10 }, () => photo(BIG)))
    assert.ok(batches.length >= 2)
    for (const batch of batches) {
      assert.ok(batch.length > 0)
      assert.ok(batch.reduce((n, u) => n + bodyBytes(u), APPEND_OVERHEAD_BYTES) <= MAX_REQUEST_BYTES)
    }
  })

  test('a byte budget, not a photo count', () => {
    assert.deepEqual(photoBatches([]), [])
    assert.equal(photoBatches(Array.from({ length: 10 }, () => photo(SMALL))).length, 1)
  })
})
