/**
 * QuickIn's public social accounts — one profile per platform, in one place.
 *
 * The /links bio page reads from here, so moving an account is a single edit.
 * Deliberately NOT here: the web app's own address (that is `getBaseUrl()` in
 * @/lib/utils) and the two app store links (those are admin-managed in /ops as
 * app_ios_url / app_android_url and read via `getAppLinks()`), so neither gains
 * a second, disagreeing source of truth.
 *
 * Each value can still be overridden per environment (staging, a campaign
 * account) by setting the matching NEXT_PUBLIC_* var in Vercel. The
 * `process.env` reads are written out in full on purpose: Next inlines these
 * literals at build time, and a computed lookup would come back undefined in
 * the client bundle.
 *
 * The defaults are the profile URLs with share tracking stripped — `igsh`,
 * `_r`/`_t` and `mibextid` are per-share session tokens that identify whoever
 * copied the link, expire on their own, and would follow every visitor we send.
 * Keep any URL you set here clean the same way.
 */

export type SocialPlatform = 'instagram' | 'tiktok' | 'facebook'

export const SOCIAL_INSTAGRAM =
  process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM || 'https://www.instagram.com/quickin.egy_'

export const SOCIAL_TIKTOK =
  process.env.NEXT_PUBLIC_SOCIAL_TIKTOK || 'https://www.tiktok.com/@quick.in1'

export const SOCIAL_FACEBOOK =
  process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK || 'https://www.facebook.com/share/18zDkKG35x/'

/**
 * The accounts in the order we want them listed, with the handle we print
 * under each one. `handle` is null where the platform gives us no vanity name
 * to show — the Facebook page is reachable only by its share id today, so the
 * row shows the platform alone rather than an id no one would recognise.
 */
export const SOCIAL_LINKS: {
  platform: SocialPlatform
  label: string
  url: string
  handle: string | null
}[] = [
  { platform: 'instagram', label: 'Instagram', url: SOCIAL_INSTAGRAM, handle: '@quickin.egy_' },
  { platform: 'tiktok', label: 'TikTok', url: SOCIAL_TIKTOK, handle: '@quick.in1' },
  { platform: 'facebook', label: 'Facebook', url: SOCIAL_FACEBOOK, handle: null },
]
