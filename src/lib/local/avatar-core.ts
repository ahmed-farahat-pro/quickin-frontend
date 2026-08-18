// =============================================================================
// AVATAR POLICY — what a profile photo may be, and how big
// =============================================================================
// `users.avatar_url` has been read everywhere since the beginning — the /account
// identity card, the host card on a listing, comments, reviews — but until now
// the only thing that ever WROTE it was the Google sign-in merge. iOS and Android
// have had a photo picker for as long as they've had an Edit profile screen; the
// web form sent `full_name` and nothing else, so a person who signed up with an
// email address had no way to have a face on this site at all.
//
// The column takes a `data:` URL, not a link to a file somewhere: this stack has
// no object storage. Listing photos and ID documents are inline base64 in
// Postgres too (see lib/image.ts and document-core.ts), so an avatar is stored the
// same way the rest of the images are, which is also the shape both mobile apps
// already send.
//
// Pure logic, no imports, so the same rules run in the API route, in the client
// form and under `node --test` — see README → Testing. Callers import the core,
// never the reverse.
// =============================================================================

/**
 * The longest edge of a stored avatar, and the JPEG quality behind it.
 *
 * These are the numbers `QKAvatarImage.makeDataURL` in the iOS DesignKit already
 * uses, and the web compressor is handed the same two, because a photo uploaded
 * on the phone and the same photo uploaded on the site should land in the column
 * at the same weight. 256px is the size the largest avatar on either client is
 * rendered at; anything above it is bytes nobody sees.
 */
export const MAX_AVATAR_DIMENSION = 256
export const AVATAR_JPEG_QUALITY = 0.8

/**
 * The hard ceiling on a stored avatar, in characters of data URL.
 *
 * ~400k characters is ~300KB of image — roughly ten times what a 256px JPEG
 * actually comes out at, so it never fires for a real photo, and it is the only
 * thing standing between this column and a multi-megabyte row if a client stops
 * downscaling or someone posts to the API directly.
 *
 * It matters more here than the number alone suggests: `avatar_url` does not stay
 * on the profile page. `getListingById` selects it as `host_avatar`, so it is part
 * of the payload of every listing detail view, and the same is true of the author
 * of every review and comment rendered with a face next to it. The 3.5MB ceiling
 * an ownership document gets (MAX_OWNERSHIP_DOC_CHARS) is fine for a file a
 * moderator opens once; it would be indefensible on a row a guest downloads while
 * browsing.
 */
export const MAX_AVATAR_CHARS = 400_000

/**
 * The image types accepted. JPEG is what both compressors emit; PNG and WebP are
 * here so a client that hands the column an already-suitable image isn't refused
 * on a technicality.
 */
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number]

export type AvatarProblemCode = 'notAnImage' | 'unsupportedType' | 'tooLarge'

export interface AvatarProblem {
  code: AvatarProblemCode
  /** Set on `unsupportedType` so a message can name what arrived. */
  found?: string
}

/**
 * A base64 `data:` URL and nothing else.
 *
 * The deliberate omission is `https://`. Letting a user PATCH a remote URL into
 * this column would put an address they control on a listing page, a review and a
 * comment thread — every host and guest who loads one would fetch it, handing
 * whoever owns that host an IP log of the people looking at the listing, and the
 * bytes behind the URL could be swapped for something else the day after a
 * moderator cleared the photo. Neither is true of a data URL: the image is the
 * value, so what /ops approves is what stays there.
 *
 * Google's avatar link is an `https://` URL and is unaffected — it is written by
 * `mergeSocialUser` on the OAuth path, which never comes through here.
 */
const AVATAR_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/

/** The mime type declared by a data URL, or null when it isn't one. */
export function avatarMimeType(value: unknown): string | null {
  const m = /^data:([^;,]+);base64,/.exec(String(value ?? ''))
  return m ? m[1].toLowerCase() : null
}

/**
 * True when the field means "I don't want a photo". Clearing one is a thing a
 * person is allowed to do, so blank has to be told apart from wrong: `null` and
 * `''` both mean remove, and both are stored as SQL NULL rather than an empty
 * string, so one absent avatar looks like every other absent avatar.
 */
export function isAvatarCleared(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === ''
}

/** Decoded size of a base64 data URL, in bytes. Padding is not payload. */
export function avatarBytes(value: unknown): number {
  const s = String(value ?? '')
  const comma = s.indexOf(',')
  if (comma < 0) return 0
  const b64 = s.slice(comma + 1)
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding)
}

/**
 * Decide an avatar. Returns the first problem, or null when it is acceptable —
 * which includes a cleared field, since a photo is optional.
 */
export function checkAvatar(value: unknown): AvatarProblem | null {
  if (isAvatarCleared(value)) return null
  const raw = String(value)
  // Length first: a 6MB string should be refused by its size, not walked
  // character by character through a regex to be told it is the wrong shape.
  if (raw.length > MAX_AVATAR_CHARS) return { code: 'tooLarge' }
  if (!AVATAR_DATA_URL.test(raw)) {
    const mime = avatarMimeType(raw)
    // A recognisable image type we don't take gets its own answer, because
    // "that's not an image" is a confusing thing to read about a HEIC photo.
    if (mime && mime.startsWith('image/')) return { code: 'unsupportedType', found: mime }
    return { code: 'notAnImage' }
  }
  return null
}

/** True when `checkAvatar` has nothing to say — the gate on a submit button. */
export function isValidAvatar(value: unknown): boolean {
  return checkAvatar(value) === null
}

/**
 * The plain-English sentence the API returns as `error`. Clients that localize
 * read `avatarProblem.code` instead; this is what every other caller renders.
 */
export function avatarProblemMessage(problem: AvatarProblem): string {
  switch (problem.code) {
    case 'notAnImage':
      return 'A profile photo must be an uploaded image'
    case 'unsupportedType':
      return `Profile photos must be JPEG, PNG or WebP${problem.found ? ` — that one is ${problem.found}` : ''}`
    case 'tooLarge':
      return `That photo is too large — please choose a smaller one`
  }
}

/** One-shot: the message to show, or null when the avatar is acceptable. */
export function validateAvatar(value: unknown): string | null {
  const problem = checkAvatar(value)
  return problem ? avatarProblemMessage(problem) : null
}

/**
 * What gets stored: the data URL as sent, or `null` when the photo was removed.
 *
 * Callers ask `checkAvatar` first and only reach here once it has said yes, so
 * the two never disagree about a value that would be written — anything invalid
 * normalizes to `null` rather than reaching the column half-checked.
 */
export function normalizeAvatarUrl(value: unknown): string | null {
  if (isAvatarCleared(value)) return null
  const raw = String(value)
  return checkAvatar(raw) === null ? raw : null
}
