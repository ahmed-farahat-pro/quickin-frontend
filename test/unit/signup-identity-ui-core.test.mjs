// Unit tests for src/lib/local/signup-identity-ui-core.ts — how the web reads the
// signup-identity fields the backend puts on every user object, where it sends an
// account that still owes its phone + ID, and how it reads a booking refusal.
//
// Offline: no database, no network, no DOM. Run with `npm test`.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPLETE_ACCOUNT_PATH,
  bookingIdentityBlock,
  canonicalDocumentNumber,
  checkDocumentNumber,
  identityFieldErrors,
  isIdentityGateExempt,
  isIdentityRejected,
  needsAccountCompletion,
  postAuthPath,
  readIdentityState,
  selfieRequiredForIdUpload,
} from '../../src/lib/local/signup-identity-ui-core.ts'

const LOCALES = ['en', 'ar', 'fr', 'es']

describe('readIdentityState', () => {
  test('a user object without the fields owes nothing', () => {
    assert.deepEqual(readIdentityState({ id: 'u1' }), {
      identity_required: false,
      identity_complete: true,
      verification_status: 'unverified',
      verification_note: null,
    })
    assert.equal(readIdentityState(null).identity_complete, true)
  })

  test('the note is kept only on a rejection', () => {
    const rejected = readIdentityState({
      identity_required: true, identity_complete: true,
      verification_status: 'rejected', verification_note: '  Blurry photo ',
    })
    assert.equal(rejected.verification_note, 'Blurry photo')
    const pending = readIdentityState({
      identity_required: true, verification_status: 'pending', verification_note: 'old',
    })
    assert.equal(pending.verification_note, null)
  })

  test('an unknown status reads as unverified', () => {
    assert.equal(readIdentityState({ verification_status: 'weird' }).verification_status, 'unverified')
  })
})

describe('needsAccountCompletion / postAuthPath', () => {
  test('only an explicit false holds the user', () => {
    assert.equal(needsAccountCompletion({ identity_complete: false }), true)
    assert.equal(needsAccountCompletion({ identity_complete: true }), false)
    assert.equal(needsAccountCompletion({}), false)
    assert.equal(needsAccountCompletion(undefined), false)
  })

  test('a new Google account lands on the completion page', () => {
    assert.equal(postAuthPath({ identity_complete: false }), COMPLETE_ACCOUNT_PATH)
    assert.equal(postAuthPath({ identity_complete: true }), '/explore')
    assert.equal(postAuthPath(null, '/account'), '/account')
  })
})

describe('isIdentityRejected', () => {
  test('needs both the requirement and a rejection', () => {
    assert.equal(isIdentityRejected({ identity_required: true, verification_status: 'rejected' }), true)
    // An account from before the cutover is never stopped by this feature.
    assert.equal(isIdentityRejected({ identity_required: false, verification_status: 'rejected' }), false)
    assert.equal(isIdentityRejected({ identity_required: true, verification_status: 'pending' }), false)
  })
})

describe('isIdentityGateExempt', () => {
  test('the completion page, auth, legal and ops pages are exempt', () => {
    for (const p of ['/complete-account', '/en/complete-account', '/login', '/ar/signup',
      '/terms', '/privacy', '/ops', '/ops/verifications', '/contact']) {
      assert.equal(isIdentityGateExempt(p, LOCALES), true, p)
    }
  })

  test('the rest of the app is gated', () => {
    for (const p of ['/', '/en/explore', '/explore/123', '/account', '/reservations', '/host',
      '/loginx', '/opsy']) {
      assert.equal(isIdentityGateExempt(p, LOCALES), false, p)
    }
  })
})

describe('checkDocumentNumber', () => {
  test('a national ID is exactly 14 digits', () => {
    assert.equal(checkDocumentNumber('29001011234567', 'national_id'), null)
    assert.equal(checkDocumentNumber('2900 1011 2345-67', 'national_id'), null)
    assert.equal(checkDocumentNumber('2900101123456', 'national_id'), 'nationalIdLength')
    assert.equal(checkDocumentNumber('29001011234A67', 'national_id'), 'nationalIdDigits')
  })

  test('other documents are 5–24 letters and digits', () => {
    assert.equal(checkDocumentNumber('a1234567', 'passport'), null)
    assert.equal(checkDocumentNumber('A12', 'passport'), 'documentLength')
    assert.equal(checkDocumentNumber('A'.repeat(25), 'residence_permit'), 'documentLength')
    assert.equal(checkDocumentNumber('A12/456', 'passport'), 'documentChars')
  })

  test('empty is required', () => {
    assert.equal(checkDocumentNumber('  ', 'passport'), 'required')
    assert.equal(checkDocumentNumber(undefined, 'national_id'), 'required')
  })

  test('canonical form drops spaces and dashes and upper-cases', () => {
    assert.equal(canonicalDocumentNumber(' a 12-3 '), 'A123')
  })
})

describe('identityFieldErrors', () => {
  test('keeps only identity keys with a message', () => {
    assert.deepEqual(
      identityFieldErrors({ phone: 'taken', email: 'bad', id_front: '', id_back: 'missing' }),
      { phone: 'taken', id_back: 'missing' },
    )
    assert.deepEqual(identityFieldErrors(null), {})
  })
})

describe('bookingIdentityBlock', () => {
  test('switches on the code', () => {
    assert.deepEqual(bookingIdentityBlock(403, { code: 'identity_incomplete', error: 'x' }), { kind: 'incomplete' })
    assert.deepEqual(
      bookingIdentityBlock(403, { code: 'identity_rejected', error: 'Your ID was not approved: blurry.' }),
      { kind: 'rejected', message: 'Your ID was not approved: blurry.' },
    )
  })

  test('anything else is not an identity block', () => {
    assert.equal(bookingIdentityBlock(403, { error: 'identity_rejected' }), null)
    assert.equal(bookingIdentityBlock(400, { code: 'identity_rejected' }), null)
    assert.equal(bookingIdentityBlock(403, null), null)
  })
})

describe('selfieRequiredForIdUpload', () => {
  test('an account under the signup identity rule is never asked for a selfie', () => {
    assert.equal(selfieRequiredForIdUpload({ identity_required: true, verification_status: 'rejected' }), false)
  })
  test('an older account keeps the selfie', () => {
    assert.equal(selfieRequiredForIdUpload({ identity_required: false }), true)
    assert.equal(selfieRequiredForIdUpload({}), true)
  })
  test('not asked while the user is still loading', () => {
    assert.equal(selfieRequiredForIdUpload(undefined), false)
  })
})
