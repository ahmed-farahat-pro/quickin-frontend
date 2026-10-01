// Unit tests for src/lib/local/listing-comments-ui-core.ts — how the listing
// "Questions & comments" UI reads failed writes, counts unanswered questions, and
// routes comment notifications.
//
// Offline: no database, no network, no DOM. Run with `npm test`.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  COMMENT_MAX,
  commentFailure,
  notificationHref,
  unansweredCount,
} from '../../src/lib/local/listing-comments-ui-core.ts'

describe('commentFailure', () => {
  test('401 asks the visitor to sign in', () => {
    assert.deepEqual(commentFailure(401, { error: 'Not signed in' }), { kind: 'signin' })
  })

  test('409 with the contract body (`warning`) is the policy gate', () => {
    const r = commentFailure(409, { error: 'x', warning: { id: 'w1', message: 'Please read this.' } })
    assert.deepEqual(r, { kind: 'warning', warning: { id: 'w1', message: 'Please read this.' } })
  })

  test('409 with the legacy chat body (`policyWarning`) is the policy gate too', () => {
    const r = commentFailure(409, { error: 'Read me', policyWarning: { id: 'w2', message: 'Read me' } })
    assert.deepEqual(r, { kind: 'warning', warning: { id: 'w2', message: 'Read me' } })
  })

  test('a 409 warning without its own message falls back to `error`', () => {
    const r = commentFailure(409, { error: 'From error', warning: { id: 'w3' } })
    assert.deepEqual(r, { kind: 'warning', warning: { id: 'w3', message: 'From error' } })
  })

  test('a 409 without a warning id is an ordinary error', () => {
    assert.deepEqual(commentFailure(409, { error: 'Conflict' }), { kind: 'error', message: 'Conflict' })
  })

  test('400 / 403 / 429 surface the server wording verbatim', () => {
    const contact = 'For your safety, sharing phone numbers in public comments isn’t allowed.'
    assert.deepEqual(commentFailure(400, { error: contact }), { kind: 'error', message: contact })
    assert.deepEqual(commentFailure(403, { error: 'Hosts reply instead' }), { kind: 'error', message: 'Hosts reply instead' })
    assert.deepEqual(commentFailure(429, { error: 'Slow down' }), { kind: 'error', message: 'Slow down' })
  })

  test('no usable error text → null, so the caller shows its own line', () => {
    assert.deepEqual(commentFailure(500, null), { kind: 'error', message: null })
    assert.deepEqual(commentFailure(500, { error: '  ' }), { kind: 'error', message: null })
    assert.deepEqual(commentFailure(502, 'gateway'), { kind: 'error', message: null })
  })
})

describe('unansweredCount', () => {
  test('counts comments with no host reply', () => {
    assert.equal(unansweredCount([]), 0)
    assert.equal(
      unansweredCount([
        { reply: null },
        { reply: { body: 'Yes', created_at: '2026-10-02T10:00:00.000Z' } },
        { reply: null },
      ]),
      2,
    )
  })
})

describe('notificationHref', () => {
  test('comment and comment_reply open the listing comments', () => {
    assert.equal(notificationHref({ type: 'comment', link: '/explore/abc#comments' }), '/explore/abc#comments')
    assert.equal(notificationHref({ type: 'comment_reply', link: '/explore/abc#comments' }), '/explore/abc#comments')
  })

  test('message notifications never route anywhere, even with a link', () => {
    assert.equal(notificationHref({ type: 'message', link: '/explore/abc' }), null)
    assert.equal(notificationHref({ type: 'info', link: '/messages' }), null)
    assert.equal(notificationHref({ type: 'info', link: '/messages?c=1' }), null)
  })

  test('only same-site /explore/ links are followed', () => {
    assert.equal(notificationHref({ type: 'booking', link: '/dashboard/bookings' }), null)
    assert.equal(notificationHref({ type: 'comment', link: 'https://evil.example/explore/x' }), null)
    assert.equal(notificationHref({ type: 'comment', link: '//evil.example/explore/x' }), null)
    assert.equal(notificationHref({ type: 'comment', link: null }), null)
    assert.equal(notificationHref({}), null)
  })
})

test('COMMENT_MAX matches the backend cap', () => {
  assert.equal(COMMENT_MAX, 1000)
})
