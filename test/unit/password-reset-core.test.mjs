// Unit tests for src/lib/local/password-reset-core.ts — the rules behind the guest
// password reset (/api/auth/forgot-password → /api/auth/reset-password).
//
// Offline: no database, no network, no server. Run with `npm test`.
// Note the explicit `.ts` extension — Node 22 strips types, but its ESM resolver
// needs the extension. password-reset-core.ts has no relative imports, which is
// what makes it loadable here at all. See README → Testing.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
//
// The strength of the replacement password is NOT decided here — that moved to
// password-policy.ts, which signup and change-password share; see
// test/unit/password-policy.test.mjs.
import {
  RESET_CODE_LENGTH,
  RESET_CODE_TTL_MINUTES,
  RESET_RESEND_COOLDOWN_SECONDS,
  forgotPasswordBody,
  isCompleteResetCode,
  normalizeResetCode,
  normalizeResetEmail,
} from '../../src/lib/local/password-reset-core.ts'

describe('normalizeResetEmail', () => {
  test('trims and lower-cases, matching the otp_codes / users lookup key', () => {
    assert.equal(normalizeResetEmail('  Layla@Email.COM '), 'layla@email.com')
  })

  test('survives a missing value instead of throwing on the request path', () => {
    assert.equal(normalizeResetEmail(undefined), '')
    assert.equal(normalizeResetEmail(null), '')
  })
})

describe('normalizeResetCode', () => {
  test('keeps a clean code intact', () => {
    assert.equal(normalizeResetCode('401285'), '401285')
  })

  test('strips what mail clients attach when a code is copied', () => {
    // Spaces, a hyphen, and a non-breaking space — none of these is a wrong code.
    assert.equal(normalizeResetCode(' 401 285 '), '401285')
    assert.equal(normalizeResetCode('401-285'), '401285')
    assert.equal(normalizeResetCode('401 285'), '401285')
  })

  test('caps at the code length so a pasted paragraph cannot smuggle extra digits', () => {
    assert.equal(normalizeResetCode('4012859999').length, RESET_CODE_LENGTH)
    assert.equal(normalizeResetCode('4012859999'), '401285')
  })

  test('a leading zero is preserved — codes are strings, not numbers', () => {
    assert.equal(normalizeResetCode('004212'), '004212')
  })

  test('isCompleteResetCode gates the submit button on a full code', () => {
    assert.equal(isCompleteResetCode('40128'), false)
    assert.equal(isCompleteResetCode('401285'), true)
    assert.equal(isCompleteResetCode('4012 85'), true)
    assert.equal(isCompleteResetCode(''), false)
  })
})

describe('forgotPasswordBody', () => {
  test('never reveals whether the address has an account', () => {
    const missing = forgotPasswordBody({ accountExists: false, delivered: true })
    const found = forgotPasswordBody({ accountExists: true, delivered: true, code: '401285' })
    assert.deepEqual(missing, found)
    assert.equal(missing.sent, true)
  })

  test('the code NEVER travels back once mail delivery is live', () => {
    const body = forgotPasswordBody({ accountExists: true, delivered: true, code: '401285' })
    assert.equal(body.devCode, undefined)
    assert.equal(JSON.stringify(body).includes('401285'), false)
  })

  test('echoes devCode only in local dev, where nothing is mailed', () => {
    const body = forgotPasswordBody({ accountExists: true, delivered: false, code: '401285' })
    assert.equal(body.devCode, '401285')
  })

  test('no devCode for an address with no account, relay or not', () => {
    // Otherwise the presence of the field would itself be the account oracle.
    assert.equal(forgotPasswordBody({ accountExists: false, delivered: false }).devCode, undefined)
    assert.equal(
      forgotPasswordBody({ accountExists: false, delivered: false, code: '401285' }).devCode,
      undefined
    )
  })

  test('carries the resend cooldown the login page counts down', () => {
    assert.equal(
      forgotPasswordBody({ accountExists: true, delivered: true }).cooldown,
      RESET_RESEND_COOLDOWN_SECONDS
    )
    assert.equal(forgotPasswordBody({ accountExists: true, delivered: true, cooldown: 12 }).cooldown, 12)
  })
})

describe('constants', () => {
  test('a reset code outlives the resend cooldown', () => {
    // Otherwise "send a new code" would be the only way to ever use one.
    assert.ok(RESET_CODE_TTL_MINUTES * 60 > RESET_RESEND_COOLDOWN_SECONDS)
  })
})
