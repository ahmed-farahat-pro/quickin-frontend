// Unit tests for src/lib/local/services-core.ts — subscription-request buckets,
// the state a host's own service is shown in, and the new-service form's rules.
//
// Offline: no database, no network, no DOM. Run with `npm test`.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_SERVICE_TITLE,
  SERVICE_REQUEST_BUCKET_ORDER,
  canToggleService,
  guestFacingPrice,
  hostServiceState,
  isActionableRequest,
  serviceBody,
  serviceDraftProblem,
  serviceRequestBucket,
  serviceRequestCounts,
} from '../../src/lib/local/services-core.ts'

describe('serviceRequestBucket', () => {
  test('sorts the three statuses the backend writes', () => {
    assert.equal(serviceRequestBucket('pending'), 'pending')
    assert.equal(serviceRequestBucket('confirmed'), 'confirmed')
    assert.equal(serviceRequestBucket('rejected'), 'rejected')
  })

  test('is case-insensitive — the column is free text', () => {
    assert.equal(serviceRequestBucket('CONFIRMED'), 'confirmed')
    assert.equal(serviceRequestBucket('  Rejected '), 'rejected')
  })

  test('accepts the synonyms a neighbouring surface might send', () => {
    assert.equal(serviceRequestBucket('approved'), 'confirmed')
    assert.equal(serviceRequestBucket('accepted'), 'confirmed')
    assert.equal(serviceRequestBucket('declined'), 'rejected')
    assert.equal(serviceRequestBucket('cancelled'), 'rejected')
  })

  test('an unknown status is still an unanswered request, never dropped', () => {
    assert.equal(serviceRequestBucket('something_new'), 'pending')
    assert.equal(serviceRequestBucket(null), 'pending')
    assert.equal(serviceRequestBucket(undefined), 'pending')
  })
})

describe('isActionableRequest', () => {
  test('only a pending request carries Confirm / Decline', () => {
    assert.equal(isActionableRequest('pending'), true)
    assert.equal(isActionableRequest('confirmed'), false)
    assert.equal(isActionableRequest('rejected'), false)
  })
})

describe('serviceRequestCounts', () => {
  test('counts each bucket and leaves none undefined', () => {
    const counts = serviceRequestCounts(['pending', 'pending', 'confirmed'])
    assert.deepEqual(counts, { pending: 2, confirmed: 1, rejected: 0 })
  })

  test('an empty inbox is three zeroes, not an empty object', () => {
    assert.deepEqual(serviceRequestCounts([]), { pending: 0, confirmed: 0, rejected: 0 })
  })

  test('every bucket in the display order has a count', () => {
    const counts = serviceRequestCounts(['confirmed'])
    for (const bucket of SERVICE_REQUEST_BUCKET_ORDER) {
      assert.equal(typeof counts[bucket], 'number')
    }
  })
})

describe('hostServiceState', () => {
  test('a published service is live', () => {
    assert.equal(hostServiceState({ is_published: true }), 'live')
  })

  test('tells the host taking it down apart from an operator doing it', () => {
    assert.equal(
      hostServiceState({ is_published: false, unpublished_by_host: true }),
      'deactivated',
    )
    assert.equal(
      hostServiceState({ is_published: false, unpublished_by_host: false }),
      'blocked',
    )
  })

  test('an unpublished row with no flag is the host’s own doing', () => {
    // Services predate the flag; reading those as blocked would strand them
    // with no way back.
    assert.equal(hostServiceState({ is_published: false }), 'deactivated')
  })
})

describe('canToggleService', () => {
  test('the host can undo their own deactivation but not an operator’s', () => {
    assert.equal(canToggleService({ is_published: true }), true)
    assert.equal(canToggleService({ is_published: false, unpublished_by_host: true }), true)
    assert.equal(canToggleService({ is_published: false, unpublished_by_host: false }), false)
  })
})

describe('serviceDraftProblem', () => {
  test('accepts a filled-in draft', () => {
    assert.equal(
      serviceDraftProblem({ title: 'Sunset boat tour', price: '400' }),
      null,
    )
  })

  test('requires a title', () => {
    assert.equal(serviceDraftProblem({ title: '', price: '10' }), 'title_required')
    assert.equal(serviceDraftProblem({ title: '   ', price: '10' }), 'title_required')
  })

  test('caps the title length', () => {
    assert.equal(
      serviceDraftProblem({ title: 'x'.repeat(MAX_SERVICE_TITLE + 1), price: '10' }),
      'title_long',
    )
    assert.equal(
      serviceDraftProblem({ title: 'x'.repeat(MAX_SERVICE_TITLE), price: '10' }),
      null,
    )
  })

  test('requires a price that is actually a number', () => {
    assert.equal(serviceDraftProblem({ title: 'Tour', price: '' }), 'price_required')
    assert.equal(serviceDraftProblem({ title: 'Tour', price: 'free' }), 'price_required')
  })

  test('allows a price of zero but refuses a negative one', () => {
    // A free welcome tour is a real offering; a negative price is not.
    assert.equal(serviceDraftProblem({ title: 'Welcome tour', price: '0' }), null)
    assert.equal(serviceDraftProblem({ title: 'Tour', price: '-1' }), 'price_negative')
  })

  test('caps the description', () => {
    assert.equal(
      serviceDraftProblem({ title: 'Tour', price: '5', description: 'x'.repeat(2001) }),
      'description_long',
    )
  })
})

describe('serviceBody', () => {
  test('trims the text and numbers the price', () => {
    assert.deepEqual(
      serviceBody({
        title: '  Diving  ',
        price: ' 250 ',
        description: ' Two tanks ',
        category: ' water ',
        location: ' Dahab ',
      }),
      {
        title: 'Diving',
        price: 250,
        description: 'Two tanks',
        category: 'water',
        location: 'Dahab',
      },
    )
  })

  test('blank optional fields become null, not empty strings', () => {
    const body = serviceBody({ title: 'Tour', price: '10', description: '  ', category: '' })
    assert.equal(body.description, null)
    assert.equal(body.category, null)
    assert.equal(body.location, null)
  })
})

describe('guestFacingPrice', () => {
  test('takes the host projection’s guest_price over its raw price', () => {
    assert.equal(guestFacingPrice({ price: 100, guest_price: 110 }), 110)
  })

  test('takes the guest projection’s price, which is already inclusive', () => {
    // That response carries no guest_price and never serves the raw amount.
    assert.equal(guestFacingPrice({ price: 110 }), 110)
  })

  test('never re-applies the markup — the rate is not a second pricing input', () => {
    // A rate on the wire is for the "guests pay N% above your price" line only.
    // Pricing from it here would double-charge and would skip the round-up the
    // parity-guarded commission-core owns.
    assert.equal(guestFacingPrice({ price: 100, guest_price: 110, commission_rate: 0.5 }), 110)
    assert.equal(guestFacingPrice({ price: 110, commission_rate: 0.1 }), 110)
  })

  test('a guest_price of zero is honoured, not treated as missing', () => {
    assert.equal(guestFacingPrice({ price: 0, guest_price: 0 }), 0)
  })

  test('a junk price reads as 0 rather than NaN on the card', () => {
    assert.equal(guestFacingPrice({ price: Number.NaN }), 0)
  })
})
