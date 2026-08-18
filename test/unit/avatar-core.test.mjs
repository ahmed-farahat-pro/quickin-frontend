// Unit tests for src/lib/local/avatar-core.ts — the rule every path that sets a
// profile photo clears (the /account photo card, PATCH /api/local/users/:id, and
// the /ops "Remove photo" action, which stores the cleared value).
//
// Offline: no database, no network, no server. Run with `npm test`.
// Note the explicit `.ts` extension — Node 22 strips types, but its ESM resolver
// needs the extension. avatar-core.ts has no imports, which is what makes it
// loadable here at all. See README → Testing.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  AVATAR_JPEG_QUALITY,
  AVATAR_MIME_TYPES,
  MAX_AVATAR_CHARS,
  MAX_AVATAR_DIMENSION,
  avatarBytes,
  avatarMimeType,
  avatarProblemMessage,
  checkAvatar,
  isAvatarCleared,
  isValidAvatar,
  normalizeAvatarUrl,
  validateAvatar,
} from '../../src/lib/local/avatar-core.ts'

/** A 1×1 JPEG, base64 — the smallest thing that is genuinely a photo. */
const TINY_JPEG =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

const jpegUrl = (b64 = TINY_JPEG) => `data:image/jpeg;base64,${b64}`

describe('checkAvatar — the shapes that are allowed in', () => {
  test('a base64 JPEG data URL is accepted', () => {
    assert.equal(checkAvatar(jpegUrl()), null)
    assert.equal(isValidAvatar(jpegUrl()), true)
  })

  test('PNG and WebP are accepted too', () => {
    for (const mime of ['image/png', 'image/webp']) {
      assert.equal(checkAvatar(`data:${mime};base64,${TINY_JPEG}`), null, `${mime} must be accepted`)
    }
  })

  test('every type in AVATAR_MIME_TYPES really is accepted', () => {
    // The exported list is what a client offers in its file picker, so a type
    // advertised there and refused here would be a bug a user meets, not a test.
    for (const mime of AVATAR_MIME_TYPES) {
      assert.equal(checkAvatar(`data:${mime};base64,${TINY_JPEG}`), null, `${mime} must be accepted`)
    }
  })
})

describe('checkAvatar — the remote URL this policy exists to refuse', () => {
  test('an http(s) link is not a profile photo', () => {
    // The whole reason for the data-URL rule: a URL the user controls would be
    // fetched by every guest who opens a listing this person hosts, and could be
    // swapped for something else after a moderator cleared it.
    for (const url of [
      'https://example.com/me.jpg',
      'http://example.com/me.jpg',
      'https://lh3.googleusercontent.com/a/abc123',
      '//example.com/me.jpg',
    ]) {
      assert.equal(checkAvatar(url)?.code, 'notAnImage', `${url} must be refused`)
    }
  })

  test('a non-image data URL is refused', () => {
    for (const url of [
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:application/pdf;base64,JVBERi0=',
      'data:image/svg+xml;base64,PHN2Zz4=', // SVG carries script; not in the list
    ]) {
      assert.notEqual(checkAvatar(url), null, `${url} must be refused`)
    }
  })

  test('an image type we do not store says so by name', () => {
    const problem = checkAvatar(`data:image/heic;base64,${TINY_JPEG}`)
    assert.equal(problem?.code, 'unsupportedType')
    assert.equal(problem?.found, 'image/heic')
    assert.match(avatarProblemMessage(problem), /image\/heic/)
  })

  test('a data URL that is not base64, or has a mangled payload, is refused', () => {
    for (const url of [
      'data:image/jpeg,rawbytes',
      `data:image/jpeg;base64,not base64!`,
      `data:image/jpeg;base64,${TINY_JPEG}===`,
      'data:image/jpeg;base64,',
    ]) {
      assert.notEqual(checkAvatar(url), null, `${url} must be refused`)
    }
  })
})

describe('checkAvatar — the size ceiling', () => {
  test('a photo over MAX_AVATAR_CHARS is refused', () => {
    const huge = `data:image/jpeg;base64,${'A'.repeat(MAX_AVATAR_CHARS)}`
    assert.equal(checkAvatar(huge)?.code, 'tooLarge')
  })

  test('a real 256px photo is nowhere near the ceiling', () => {
    // The ceiling is a backstop against a client that stopped downscaling, not a
    // limit a person meets: this column rides along in every listing detail
    // response as `host_avatar`.
    assert.ok(jpegUrl().length < MAX_AVATAR_CHARS / 10)
  })

  test('avatarBytes reports the decoded size, not the string length', () => {
    assert.equal(avatarBytes('data:image/jpeg;base64,AAAA'), 3)
    assert.equal(avatarBytes('data:image/jpeg;base64,AAA='), 2)
    assert.equal(avatarBytes('data:image/jpeg;base64,AA=='), 1)
    assert.equal(avatarBytes('not a data url'), 0)
    assert.ok(avatarBytes(jpegUrl()) < jpegUrl().length)
  })
})

describe('clearing a photo is not an error', () => {
  test('null, undefined and blank all mean "remove it"', () => {
    for (const blank of [null, undefined, '', '   ', '\n']) {
      assert.equal(isAvatarCleared(blank), true)
      assert.equal(checkAvatar(blank), null, 'clearing must not be an error')
      assert.equal(normalizeAvatarUrl(blank), null, 'a cleared photo is stored as NULL')
    }
  })

  test('the literal string "null" is not a cleared photo', () => {
    // It is what `String(body.avatar_url)` used to write into the column when a
    // client sent JSON null — a four-character avatar that renders as a broken
    // image everywhere it is read.
    assert.notEqual(checkAvatar('null'), null)
    assert.equal(normalizeAvatarUrl('null'), null)
  })
})

describe('normalizeAvatarUrl — what actually reaches the column', () => {
  test('an accepted photo is stored as sent', () => {
    assert.equal(normalizeAvatarUrl(jpegUrl()), jpegUrl())
  })

  test('anything refused normalizes to null rather than a half-checked value', () => {
    for (const bad of ['https://example.com/me.jpg', 'data:text/html;base64,PHNjcmlwdD4=', 42, {}]) {
      assert.equal(normalizeAvatarUrl(bad), null)
    }
  })
})

describe('the messages a person reads', () => {
  test('every problem code has a sentence, and none of them is empty', () => {
    for (const value of ['https://example.com/me.jpg', `data:image/heic;base64,${TINY_JPEG}`, `data:image/jpeg;base64,${'A'.repeat(MAX_AVATAR_CHARS)}`]) {
      const message = validateAvatar(value)
      assert.ok(message && message.length > 10, `${value.slice(0, 24)} needs a readable message`)
    }
  })

  test('an acceptable photo has nothing to say', () => {
    assert.equal(validateAvatar(jpegUrl()), null)
    assert.equal(validateAvatar(null), null)
  })
})

describe('the numbers the two clients share', () => {
  test('the compression settings match the iOS picker', () => {
    // QKAvatarImage.makeDataURL(maxDimension: 256, quality: 0.8) in the iOS
    // DesignKit. A photo uploaded on the phone and on the site should land in the
    // column at the same weight; if either side moves, this is the failure.
    assert.equal(MAX_AVATAR_DIMENSION, 256)
    assert.equal(AVATAR_JPEG_QUALITY, 0.8)
  })

  test('avatarMimeType reads the declared type back', () => {
    assert.equal(avatarMimeType(jpegUrl()), 'image/jpeg')
    assert.equal(avatarMimeType('DATA:IMAGE/PNG;base64,AAAA'.toLowerCase()), 'image/png')
    assert.equal(avatarMimeType('https://example.com/me.jpg'), null)
  })
})
