// Unit tests for src/lib/local/signup-role-ui-core.ts — the steps each role walks
// at signup, which step a server error sends the user back to, and the role half
// of the request body.
//
// Offline: no database, no network, no DOM. Run with `npm test`.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_HOSTING,
  checkHosting,
  firstStepWithError,
  isDestinationBlank,
  normalizeRole,
  roleBody,
  signupSteps,
  stepForField,
} from '../../src/lib/local/signup-role-ui-core.ts'

describe('signupSteps', () => {
  test('guest has three pages, host four', () => {
    assert.deepEqual(signupSteps('guest'), ['account', 'identity', 'refund'])
    assert.deepEqual(signupSteps('host'), ['account', 'identity', 'hosting', 'payout'])
  })

  test('the Google completion page has no account step', () => {
    assert.deepEqual(signupSteps('guest', false), ['identity', 'refund'])
    assert.deepEqual(signupSteps('host', false), ['identity', 'hosting', 'payout'])
  })
})

describe('normalizeRole', () => {
  test('only host is host; anything else is the preselected guest', () => {
    assert.equal(normalizeRole('host'), 'host')
    assert.equal(normalizeRole(null), 'guest')
    assert.equal(normalizeRole('admin'), 'guest')
  })
})

describe('stepForField / firstStepWithError', () => {
  test('each server key belongs to its page', () => {
    assert.equal(stepForField('id_back'), 'identity')
    assert.equal(stepForField('terms'), 'hosting')
    assert.equal(stepForField('payout'), 'payout')
    assert.equal(stepForField('refund_method'), 'refund')
    assert.equal(stepForField('email'), 'account')
  })

  test('jumps to the earliest page with an error', () => {
    const steps = signupSteps('host')
    assert.equal(firstStepWithError(steps, ['payout', 'address', 'phone']), 1)
    assert.equal(firstStepWithError(steps, ['payout']), 3)
  })

  test('a key whose page is not shown is ignored', () => {
    assert.equal(firstStepWithError(signupSteps('guest', false), ['email']), -1)
    assert.equal(firstStepWithError(signupSteps('guest'), []), -1)
  })
})

describe('checkHosting', () => {
  test('type, address and terms are required', () => {
    assert.deepEqual(checkHosting(EMPTY_HOSTING), ['host_type', 'address', 'terms'])
    assert.deepEqual(
      checkHosting({ ...EMPTY_HOSTING, hostType: 'company', address: ' Giza ', termsAccepted: true }),
      []
    )
  })

  test('whitespace is not an address', () => {
    assert.deepEqual(checkHosting({ ...EMPTY_HOSTING, hostType: 'individual', address: '   ', termsAccepted: true }), ['address'])
  })
})

describe('roleBody', () => {
  const bank = { method: 'bank_account', account_name: 'Mona', bank_name: 'CIB', account_number: '123' }
  const blank = { method: 'bank_account', account_name: '', bank_name: ' ', iban: '' }

  test('a guest who skipped sends no refund destination', () => {
    assert.deepEqual(roleBody('guest', EMPTY_HOSTING, bank, true), { role: 'guest' })
  })

  test('a guest who left the form blank sends none either', () => {
    assert.equal(isDestinationBlank(blank), true)
    assert.deepEqual(roleBody('guest', EMPTY_HOSTING, blank, false), { role: 'guest' })
  })

  test('a guest who filled it in sends it as refund_method', () => {
    assert.deepEqual(roleBody('guest', EMPTY_HOSTING, bank, false), { role: 'guest', refund_method: bank })
  })

  test('a host sends hosting + payout + terms, company dropped for an individual', () => {
    const b = roleBody('host', { hostType: 'individual', address: ' Giza ', company: 'X', notes: ' n ', termsAccepted: true }, bank, false)
    assert.deepEqual(b, {
      role: 'host', host_type: 'individual', address: 'Giza', company: '', notes: 'n', terms_accepted: true, payout: bank,
    })
  })
})
