// Unit tests for src/lib/contact.ts — the public phone/WhatsApp/email details.
//
// Offline: no database, no network, no server. Run with `npm test`.
// Note the explicit `.ts` extension — Node 22 strips types, but its ESM resolver
// needs the extension. contact.ts has no relative imports, which is what makes
// it loadable here at all. See README → Testing.
//
// These assert the details a guest actually sees, so a stray edit to the number
// or the inbox fails here rather than in production.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_E164,
  CONTACT_EMAIL,
  CONTACT_EMAIL_HREF,
  whatsappHref,
} from '../../src/lib/contact.ts'

describe('contact details', () => {
  test('the printed number is the live QuickIn line', () => {
    assert.equal(CONTACT_PHONE_DISPLAY, '01044448477')
  })

  test('the dialling form is the same line in Egyptian international digits', () => {
    assert.equal(CONTACT_PHONE_E164, '201044448477')
    assert.match(CONTACT_PHONE_E164, /^\d+$/, 'wa.me rejects spaces, + and dashes')
  })

  test('printed and dialling forms are the same subscriber number', () => {
    // Local 01044448477 -> international 20 + 1044448477. Catches the classic
    // slip of keeping the leading 0 after the country code.
    assert.equal(CONTACT_PHONE_E164, '20' + CONTACT_PHONE_DISPLAY.replace(/\D/g, '').slice(1))
    assert.equal(CONTACT_PHONE_DISPLAY.replace(/\D/g, '')[0], '0')
  })

  test('email is the live inbox', () => {
    assert.equal(CONTACT_EMAIL, 'quick.in.egy@gmail.com')
    assert.equal(CONTACT_EMAIL_HREF, 'mailto:quick.in.egy@gmail.com')
  })
})

describe('whatsappHref', () => {
  test('with no message, links straight to the chat', () => {
    assert.equal(whatsappHref(), 'https://wa.me/201044448477')
  })

  test('pre-fills and encodes a message', () => {
    assert.equal(
      whatsappHref('Hello QuickIn 👋'),
      'https://wa.me/201044448477?text=Hello%20QuickIn%20%F0%9F%91%8B',
    )
  })

  test('an empty message is treated as no message, not an empty text param', () => {
    assert.equal(whatsappHref(''), 'https://wa.me/201044448477')
  })
})
