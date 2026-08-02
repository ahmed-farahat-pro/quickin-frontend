// Unit tests for src/lib/social.ts — the profiles the /links bio page points at.
//
// Offline: no database, no network, no server. Run with `npm test`.
// Note the explicit `.ts` extension — Node 22 strips types, but its ESM resolver
// needs the extension. social.ts has no relative imports, which is what makes it
// loadable here at all. See README → Testing.
//
// These assert the accounts a visitor actually lands on, so a stray edit to a
// profile URL fails here rather than in production — where the only symptom is
// a bio link quietly sending people to the wrong page.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  SOCIAL_INSTAGRAM,
  SOCIAL_TIKTOK,
  SOCIAL_FACEBOOK,
  SOCIAL_LINKS,
} from '../../src/lib/social.ts'

describe('social profiles', () => {
  test('instagram is the live QuickIn account', () => {
    assert.equal(SOCIAL_INSTAGRAM, 'https://www.instagram.com/quickin.egy_')
  })

  test('tiktok is the live QuickIn account', () => {
    assert.equal(SOCIAL_TIKTOK, 'https://www.tiktok.com/@quick.in1')
  })

  test('facebook is the live QuickIn page', () => {
    assert.equal(SOCIAL_FACEBOOK, 'https://www.facebook.com/share/18zDkKG35x/')
  })
})

describe('every profile URL is safe to publish', () => {
  const urls = [SOCIAL_INSTAGRAM, SOCIAL_TIKTOK, SOCIAL_FACEBOOK]

  test('all are absolute https', () => {
    for (const url of urls) {
      assert.match(url, /^https:\/\//, `${url} must be https — these are printed as real links`)
      assert.doesNotThrow(() => new URL(url), `${url} is not a parseable URL`)
    }
  })

  test('none carry share tracking', () => {
    // igsh / _r / _t / mibextid identify whoever copied the link out of the app.
    // They expire on their own and would follow every visitor we send, so a
    // pasted-from-the-app URL must be trimmed before it lands in social.ts.
    for (const url of urls) {
      const { searchParams } = new URL(url)
      for (const param of ['igsh', '_r', '_t', 'mibextid']) {
        assert.equal(
          searchParams.has(param),
          false,
          `${url} still carries the ${param} share token — strip the query string`,
        )
      }
      assert.equal(new URL(url).search, '', `${url} should have no query string at all`)
    }
  })
})

describe('SOCIAL_LINKS', () => {
  test('lists the three accounts in bio order', () => {
    assert.deepEqual(
      SOCIAL_LINKS.map((l) => l.platform),
      ['instagram', 'tiktok', 'facebook'],
    )
  })

  test('each entry carries the matching constant, not a copy', () => {
    const byPlatform = Object.fromEntries(SOCIAL_LINKS.map((l) => [l.platform, l.url]))
    assert.equal(byPlatform.instagram, SOCIAL_INSTAGRAM)
    assert.equal(byPlatform.tiktok, SOCIAL_TIKTOK)
    assert.equal(byPlatform.facebook, SOCIAL_FACEBOOK)
  })

  test('handles are printable, and absent rather than fake where we have none', () => {
    const byPlatform = Object.fromEntries(SOCIAL_LINKS.map((l) => [l.platform, l.handle]))
    assert.equal(byPlatform.instagram, '@quickin.egy_')
    assert.equal(byPlatform.tiktok, '@quick.in1')
    // The Facebook page is reachable only by share id today — no vanity name to
    // print, so the row shows the platform alone.
    assert.equal(byPlatform.facebook, null)
  })

  test('every entry has a label the page can render', () => {
    for (const link of SOCIAL_LINKS) {
      assert.ok(link.label && link.label.trim().length > 0, `${link.platform} has no label`)
    }
  })
})
