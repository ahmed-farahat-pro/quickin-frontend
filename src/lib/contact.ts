/**
 * QuickIn's public contact details — one number and one inbox, in one place.
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

export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'quick.in.egy@gmail.com'

export const CONTACT_EMAIL_HREF = `mailto:${CONTACT_EMAIL}`

/** Opens a WhatsApp chat with us, optionally pre-filled with `text`. */
export function whatsappHref(text?: string): string {
  const base = `https://wa.me/${CONTACT_PHONE_E164}`
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}
