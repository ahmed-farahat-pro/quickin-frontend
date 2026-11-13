// Unit tests for src/lib/local/host-apply-core.ts — the web "Become a host"
// form's rules: ask only for what the profile is missing, require a payout
// destination unless one is on file, require the host terms.
//
// Offline: no database, no network, no server. Run with `npm test`.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  APPLY_FIELD_ERROR_KEYS,
  PROFILE_FIELDS,
  buildHostApplyBody,
  checkHostOnlyFields,
  isPayoutDraftEmpty,
  profileFieldsToAsk,
} from '../../src/lib/local/host-apply-core.ts'

const emptyPayout = {
  method: 'bank_account',
  account_name: '',
  bank_name: '',
  iban: '',
  account_number: '',
  swift_bic: '',
  branch: '',
  instapay_address: '',
}
const instapay = { ...emptyPayout, method: 'instapay', account_name: 'Kareem', instapay_address: 'k@instapay' }

const base = {
  ask: [],
  values: {},
  hostType: 'individual',
  address: ' 1 Nile St ',
  company: '',
  notes: '',
  termsAccepted: true,
  payoutOnFile: false,
  payout: instapay,
  identityDocs: null,
}

describe('profileFieldsToAsk', () => {
  test('asks only for what the profile is missing, in form order', () => {
    assert.deepEqual(profileFieldsToAsk({ missing: ['national_id', 'phone'] }), ['phone', 'national_id'])
  })
  test('a complete profile asks for nothing', () => {
    assert.deepEqual(profileFieldsToAsk({ missing: [] }), [])
  })
  test('unknown keys are dropped', () => {
    assert.deepEqual(profileFieldsToAsk({ missing: ['email', 'full_name'] }), ['full_name'])
  })
  test('no profile (GET failed) asks for everything', () => {
    assert.deepEqual(profileFieldsToAsk(null), [...PROFILE_FIELDS])
    assert.deepEqual(profileFieldsToAsk({}), [...PROFILE_FIELDS])
  })
})

describe('isPayoutDraftEmpty', () => {
  test('only the method toggle set → empty', () => {
    assert.equal(isPayoutDraftEmpty(emptyPayout), true)
    assert.equal(isPayoutDraftEmpty({ ...emptyPayout, iban: '   ' }), true)
    assert.equal(isPayoutDraftEmpty(null), true)
  })
  test('any typed field → not empty', () => {
    assert.equal(isPayoutDraftEmpty({ ...emptyPayout, iban: 'EG38' }), false)
  })
})

describe('buildHostApplyBody', () => {
  test('profile fields on file are NOT sent', () => {
    const body = buildHostApplyBody({ ...base, values: { full_name: 'X', phone: '010', national_id: '1' } })
    assert.equal('full_name' in body, false)
    assert.equal('phone' in body, false)
    assert.equal('national_id' in body, false)
  })
  test('missing profile fields are sent trimmed', () => {
    const body = buildHostApplyBody({ ...base, ask: ['phone'], values: { phone: ' 01012345678 ', full_name: 'X' } })
    assert.equal(body.phone, '01012345678')
    assert.equal('full_name' in body, false)
  })
  test('carries terms, host type, trimmed address', () => {
    const body = buildHostApplyBody(base)
    assert.equal(body.terms_accepted, true)
    assert.equal(body.host_type, 'individual')
    assert.equal(body.address, '1 Nile St')
  })
  test('terms_accepted is strictly boolean true', () => {
    assert.equal(buildHostApplyBody({ ...base, termsAccepted: false }).terms_accepted, false)
  })
  test('payout is sent when none is on file', () => {
    assert.deepEqual(buildHostApplyBody(base).payout, instapay)
  })
  test('payout is omitted when one is on file and nothing new was typed', () => {
    assert.equal('payout' in buildHostApplyBody({ ...base, payoutOnFile: true, payout: emptyPayout }), false)
    assert.equal('payout' in buildHostApplyBody({ ...base, payoutOnFile: true, payout: null }), false)
  })
  test('a replacement payout is sent even with one on file', () => {
    assert.deepEqual(buildHostApplyBody({ ...base, payoutOnFile: true }).payout, instapay)
  })
  test('company only travels for a business', () => {
    assert.equal('company' in buildHostApplyBody({ ...base, company: 'Acme' }), false)
    assert.equal(buildHostApplyBody({ ...base, hostType: 'brokerage', company: ' Acme ' }).company, 'Acme')
    assert.equal('company' in buildHostApplyBody({ ...base, hostType: 'company', company: '  ' }), false)
  })
  test('identity documents ride along only when given', () => {
    assert.equal('doc_type' in buildHostApplyBody(base), false)
    const body = buildHostApplyBody({
      ...base,
      identityDocs: { doc_type: 'passport', id_front: 'data:image/a', id_back: 'data:image/b' },
    })
    assert.equal(body.doc_type, 'passport')
    assert.equal(body.id_front, 'data:image/a')
  })
})

describe('checkHostOnlyFields', () => {
  const ok = { address: 'x', termsAccepted: true, payoutOnFile: false, payout: instapay }
  test('a complete application passes', () => {
    assert.deepEqual(checkHostOnlyFields(ok), [])
  })
  test('terms must be accepted', () => {
    assert.deepEqual(checkHostOnlyFields({ ...ok, termsAccepted: false }), ['terms'])
  })
  test('a payout is required unless one is on file', () => {
    assert.deepEqual(checkHostOnlyFields({ ...ok, payout: emptyPayout }), ['payout'])
    assert.deepEqual(checkHostOnlyFields({ ...ok, payout: null, payoutOnFile: true }), [])
  })
  test('address is required', () => {
    assert.deepEqual(checkHostOnlyFields({ ...ok, address: ' ' }), ['address'])
  })
})

test('server field errors terms + payout are mapped', () => {
  assert.equal(APPLY_FIELD_ERROR_KEYS.terms, 'errors.termsRequired')
  assert.equal(APPLY_FIELD_ERROR_KEYS.payout, 'errors.payoutInvalid')
})
