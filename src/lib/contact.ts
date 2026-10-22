/**
 * Quick In's public contact details — one number and one inbox, in one place.
 *
 * The floating WhatsApp button, the Contact Us page and the explore footer all
 * read from here, so changing how we can be reached is a single edit. The phone
 * line and the WhatsApp account are the same number, which is why there is one
 * constant for both rather than a separate `phone` and `whatsapp`.
 *
 * Each value can still be overridden per environment (staging, a temporary
 * campaign number) by setting the matching NEXT_PUBLIC_* var in Vercel. The
 * `process.env` reads are written out in full on purpose: Next inlines these
 * literals at build time, and a computed lookup would come back undefined in
 * the client bundle.
 */

/** The number as we print it for guests — local Egyptian format. */
export const CONTACT_PHONE_DISPLAY = process.env.NEXT_PUBLIC_CONTACT_PHONE || '01013010119'

/**
 * The same line in international digits (Egypt +20, leading 0 dropped) — the
 * form wa.me and tel: require, and the form that works when a guest calls from
 * outside Egypt.
 */
export const CONTACT_PHONE_E164 = (process.env.NEXT_PUBLIC_WHATSAPP || '201013010119').replace(
  /\D/g,
  '',
)

/**
 * The phone lines printed on the Contact Us page. These are call lines, separate
 * from the WhatsApp number above, which stays as is. `display` is grouped the way
 * the number is read aloud (Cairo landline: 2 + 8 digits; mobile: 10 + 8 digits).
 */
export const CONTACT_PHONES: { kind: 'landline' | 'mobile'; display: string; href: string }[] = [
  { kind: 'landline', display: '+20 2 3889 5888', href: 'tel:+20238895888' },
  { kind: 'mobile', display: '+20 10 4444 8477', href: 'tel:+201044448477' },
]

export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'quick.in.egy@gmail.com'

export const CONTACT_EMAIL_HREF = `mailto:${CONTACT_EMAIL}`

/** Opens a WhatsApp chat with us, optionally pre-filled with `text`. */
export function whatsappHref(text?: string): string {
  const base = `https://wa.me/${CONTACT_PHONE_E164}`
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}
