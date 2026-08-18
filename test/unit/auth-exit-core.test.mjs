// Unit tests for src/lib/local/auth-exit-core.ts — where "keep browsing without an
// account" sends a guest who backs out of /login or /signup.
//
// Offline: no database, no network, no DOM. Run with `npm test`.
// Note the explicit `.ts` extension — Node 22 strips types, but its ESM resolver
// needs the extension. auth-exit-core.ts has no relative imports, which is what
// makes it loadable here at all. See README → Testing.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  BROWSE_FALLBACK,
  isAuthPath,
  resolveReturnHref,
} from '../../src/lib/local/auth-exit-core.ts'

const ORIGIN = 'https://quickin.app'
const LOCALES = ['en', 'ar', 'fr', 'es']

const from = (referrer) => resolveReturnHref(referrer, ORIGIN, LOCALES)

describe('resolveReturnHref — the way back to browsing', () => {
  // The reported bug: a guest who opened sign-in and changed their mind had no way
  // back to the unauthenticated site. Every branch here has to yield a usable href.
  test('the page the guest came from wins', () => {
    assert.equal(from(`${ORIGIN}/en/explore`), '/en/explore')
    assert.equal(from(`${ORIGIN}/ar/explore/42`), '/ar/explore/42')
  })

  test('filters survive the round trip', () => {
    assert.equal(
      from(`${ORIGIN}/en/explore?city=cairo&guests=2`),
      '/en/explore?city=cairo&guests=2',
    )
  })

  test('a hash is dropped — it never reaches the server anyway', () => {
    assert.equal(from(`${ORIGIN}/en/explore#map`), '/en/explore')
  })
})

describe('resolveReturnHref — falling back to the browse page', () => {
  test('no referrer at all (typed URL, or a referrer policy stripped it)', () => {
    for (const value of ['', null, undefined]) {
      assert.equal(from(value), BROWSE_FALLBACK, `${value} should fall back`)
    }
  })

  test('a referrer we cannot parse', () => {
    for (const value of ['not-a-url', '/en/explore', '://', 'javascript:alert(1)']) {
      assert.equal(from(value), BROWSE_FALLBACK, `${value} should fall back`)
    }
  })

  // Otherwise any site could link to our sign-in page and choose where the exit
  // sends the visitor.
  test('another origin never becomes our exit', () => {
    for (const value of [
      'https://evil.example/phish',
      'http://quickin.app/en/explore', // different scheme is a different origin
      'https://quickin.app.evil.example/en/explore',
      'https://sub.quickin.app/en/explore',
    ]) {
      assert.equal(from(value), BROWSE_FALLBACK, `${value} should fall back`)
    }
  })

  // Bouncing back into the flow they just left is not an exit.
  test('the auth pages themselves do not become the exit', () => {
    for (const value of [
      `${ORIGIN}/login`,
      `${ORIGIN}/en/login`,
      `${ORIGIN}/ar/signup`,
      `${ORIGIN}/en/auth/reset-password`,
      `${ORIGIN}/fr/login?redirect=/account`,
    ]) {
      assert.equal(from(value), BROWSE_FALLBACK, `${value} should fall back`)
    }
  })
})

describe('isAuthPath — locale prefixes must not hide the auth pages', () => {
  test('recognised with and without a locale', () => {
    for (const path of [
      '/login',
      '/signup',
      '/auth',
      '/en/login',
      '/ar/signup',
      '/es/auth/reset-password',
      '/fr/login/',
    ]) {
      assert.equal(isAuthPath(path, LOCALES), true, `${path} is an auth path`)
    }
  })

  test('ordinary pages are not auth pages', () => {
    for (const path of [
      '/',
      '/en',
      '/explore',
      '/en/explore',
      '/en/loginhelp', // prefix match must not over-reach
      '/en/host/apply',
      '/de/login', // 'de' is not a locale, so this is a real /de/login page
    ]) {
      assert.equal(isAuthPath(path, LOCALES), false, `${path} is not an auth path`)
    }
  })
})
