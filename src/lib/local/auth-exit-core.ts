// Where "keep browsing without an account" goes when a guest backs out of /login or
// /signup. Pure string work, no DOM: the pages read `document.referrer` and hand it
// here, and the unit tests hand it whatever they like.
//
// No relative imports — that's what lets `node --test` load this file directly.
// See README → Testing.

/** Where a guest who backs out lands when we can't tell where they came from. */
export const BROWSE_FALLBACK = '/explore'

/** Returning to one of these would leave the guest inside the flow they just left. */
const AUTH_PREFIXES = ['/login', '/signup', '/auth']

/**
 * Drop a leading `/en`-style segment. A narrower copy of `stripLocaleFromPath` in
 * `@/lib/i18n/pathname`, which this file can't import and stay test-loadable; the
 * caller passes the real locale list so the two can't disagree about what a locale is.
 */
function stripLocale(pathname: string, locales: readonly string[]): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return '/'
  if (!locales.includes(segments[0])) return pathname

  const rest = segments.slice(1).join('/')
  return rest ? `/${rest}` : '/'
}

/** True for the auth pages themselves, with or without a locale prefix. */
export function isAuthPath(pathname: string, locales: readonly string[]): boolean {
  const path = stripLocale(pathname, locales)
  return AUTH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/**
 * The page to send a guest back to, given the referrer the browser reported.
 *
 * Someone who taps "Sign in" from a listing wants that listing back, not the feed —
 * so the referrer wins when it's usable, and the browse page catches every case where
 * it isn't: no referrer at all (typed URL, stripped by a referrer policy), a referrer
 * we can't parse, another site, or one of the auth pages we're trying to leave.
 */
export function resolveReturnHref(
  referrer: string | null | undefined,
  origin: string,
  locales: readonly string[],
): string {
  if (!referrer) return BROWSE_FALLBACK

  let url: URL
  try {
    url = new URL(referrer)
  } catch {
    return BROWSE_FALLBACK
  }

  // Same-origin only. An external referrer isn't "back to browsing", and honouring one
  // would let any site choose where our sign-in page sends people.
  if (url.origin !== origin) return BROWSE_FALLBACK
  if (isAuthPath(url.pathname, locales)) return BROWSE_FALLBACK

  // Query kept: a guest who came from a filtered search wants those filters back.
  return `${url.pathname}${url.search}`
}
