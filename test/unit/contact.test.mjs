// Unit tests for src/lib/contact.ts — the public phone/WhatsApp/email details.
//
// Offline: no database, no network, no server. Run with `npm test`.
// Note the explicit `.ts` extension — Node 22 strips types, but its ESM resolver
// needs the extension. contact.ts has no relative imports, which is what makes
// it loadable here at all. See README → Testing.
//
// These assert the details a guest actually sees, so a stray edit to a number
// or the inbox fails here rather than in production.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONTACT_ADDRESS,
  CONTACT_EMAIL,
  CONTACT_EMAIL_HREF,
  CONTACT_PHONES,
  WHATSAPP_NUMBERS,
  whatsappHref,
} from '../../src/lib/contact.ts'

describe('contact details', () => {
  test('email is the live inbox', () => {
    assert.equal(CONTACT_EMAIL, 'quick.in.egy@gmail.com')
    assert.equal(CONTACT_EMAIL_HREF, 'mailto:quick.in.egy@gmail.com')
  })

  test('the address is printed in English and Arabic', () => {
    assert.match(CONTACT_ADDRESS.en, /^Unit No\. 1474, .*6th of October City, Giza Governorate, Egypt, ground floor\.$/)
    assert.match(CONTACT_ADDRESS.ar, /1474/)
    assert.match(CONTACT_ADDRESS.ar, /[؀-ۿ]/)
  })
})

describe('WhatsApp numbers', () => {
  test('exactly the two lines the picker offers, the new one first', () => {
    assert.deepEqual(
      WHATSAPP_NUMBERS.map((n) => n.e164),
      ['201037116711', '201044448477'],
    )
  })

  test('the old dedicated WhatsApp line is gone', () => {
    assert.ok(!WHATSAPP_NUMBERS.some((n) => n.e164 === '201013010119'))
  })

  test('every number is bare digits, as wa.me requires', () => {
    for (const n of WHATSAPP_NUMBERS) assert.match(n.e164, /^20\d{10}$/, 'wa.me rejects spaces, + and dashes')
  })

  test('the printed form is the same subscriber number as the dialling form', () => {
    // Local 0103… -> 20 + 103…, +20 10… -> 20 10…. Catches keeping the leading
    // 0 after the country code.
    for (const n of WHATSAPP_NUMBERS) {
      const digits = n.display.replace(/\D/g, '')
      assert.equal(digits.startsWith('0') ? '2' + digits : digits, n.e164)
    }
  })

  test('the second line is the Contact Us mobile number', () => {
    const mobile = CONTACT_PHONES.find((p) => p.kind === 'mobile')
    assert.equal(WHATSAPP_NUMBERS[1].display, mobile.display)
    assert.equal(`tel:+${WHATSAPP_NUMBERS[1].e164}`, mobile.href)
  })
})

describe('whatsappHref', () => {
  test('with no message, links straight to the chat', () => {
    assert.equal(whatsappHref('201037116711'), 'https://wa.me/201037116711')
  })

  test('pre-fills and encodes a message', () => {
    assert.equal(
      whatsappHref('201037116711', 'Hello Quick In 👋'),
      'https://wa.me/201037116711?text=Hello%20Quick%20In%20%F0%9F%91%8B',
    )
  })

  test('an empty message is treated as no message, not an empty text param', () => {
    assert.equal(whatsappHref('201037116711', ''), 'https://wa.me/201037116711')
  })
})
