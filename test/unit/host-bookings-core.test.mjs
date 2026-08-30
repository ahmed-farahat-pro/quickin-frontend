// Unit tests for src/lib/local/host-bookings-core.ts — reading a host's incoming
// reservations out of whatever GET /api/local/host/bookings returned.
//
// Offline: no database, no network. Run with `npm test`.
// The explicit `.ts` extension is required — Node strips types but its ESM resolver
// needs the extension, and host-bookings-core.ts has no relative imports, which is
// what makes it loadable here. See the backend README → Testing.
//
// The test that matters is "a bare array is the list". That is what quickin-backend
// actually sends, and reading `data.bookings` off it — undefined, so an empty inbox —
// is the bug that left every host looking at "no requests yet" while guests waited.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { hostBookingsFrom } from '../../src/lib/local/host-bookings-core.ts'

const ROW = { id: 'b1', status: 'pending', guest_name: 'Nour' }
const ROW2 = { id: 'b2', status: 'confirmed', guest_name: 'Omar' }

describe('hostBookingsFrom', () => {
  test('a bare array is the list (the backend contract iOS and Android decode)', () => {
    assert.deepEqual(hostBookingsFrom([ROW, ROW2]), [ROW, ROW2])
  })

  test('order is preserved — the server sorts newest-first and we do not resort', () => {
    assert.deepEqual(
      hostBookingsFrom([ROW, ROW2]).map((b) => b.id),
      ['b1', 'b2']
    )
  })

  test('an empty array is an empty inbox, not a failure', () => {
    assert.deepEqual(hostBookingsFrom([]), [])
  })

  test('a { bookings } wrapper still reads (the /ops admin route shape)', () => {
    assert.deepEqual(hostBookingsFrom({ bookings: [ROW] }), [ROW])
  })

  test('an object with no bookings key yields nothing', () => {
    assert.deepEqual(hostBookingsFrom({ error: 'Not signed in' }), [])
  })

  test('a bookings key that is not a list yields nothing rather than throwing', () => {
    assert.deepEqual(hostBookingsFrom({ bookings: null }), [])
    assert.deepEqual(hostBookingsFrom({ bookings: 'none' }), [])
    assert.deepEqual(hostBookingsFrom({ bookings: { 0: ROW } }), [])
  })

  test('null, undefined and non-JSON-object bodies yield nothing', () => {
    assert.deepEqual(hostBookingsFrom(null), [])
    assert.deepEqual(hostBookingsFrom(undefined), [])
    assert.deepEqual(hostBookingsFrom('[]'), [])
    assert.deepEqual(hostBookingsFrom(0), [])
  })

  test('the returned array is the payload itself, not a copy the caller can mutate blind', () => {
    const rows = [ROW]
    assert.equal(hostBookingsFrom(rows), rows)
  })
})
