/**
 * Quick In's public contact details — phone lines, WhatsApp lines, inbox and
 * address, in one place.
 *
 * The floating WhatsApp button, the Contact Us page, /links and the explore
 * footer all read from here, so changing how we can be reached is a single edit.
 *
 * The inbox can still be overridden per environment (staging) by setting
 * NEXT_PUBLIC_CONTACT_EMAIL in Vercel. The `process.env` read is written out in
 * full on purpose: Next inlines these literals at build time, and a computed
 * lookup would come back undefined in the client bundle.
 */

/**
 * The phone lines printed on the Contact Us page. `display` is grouped the way
 * the number is read aloud (Cairo landline: 2 + 8 digits; mobile: 10 + 8 digits).
 */
export const CONTACT_PHONES: { kind: 'landline' | 'mobile'; display: string; href: string }[] = [
  { kind: 'landline', display: '+20 2 3889 5888', href: 'tel:+20238895888' },
  { kind: 'mobile', display: '+20 10 4444 8477', href: 'tel:+201044448477' },
]

export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'quick.in.egy@gmail.com'

export const CONTACT_EMAIL_HREF = `mailto:${CONTACT_EMAIL}`

/**
 * The two WhatsApp lines a guest can pick between. Every WhatsApp button on the
 * site opens the picker in @/components/whatsapp-picker rather than linking to
 * one number. `e164` is the international digits (Egypt +20, leading 0 dropped)
 * that wa.me requires; `display` is how the number is printed.
 *
 * The second line is the Contact Us mobile number, not a copy of it, so the two
 * can never drift apart.
 */
const CONTACT_MOBILE = CONTACT_PHONES.find((p) => p.kind === 'mobile')!

export const WHATSAPP_NUMBERS: { display: string; e164: string }[] = [
  { display: '+20 10 3711 6711', e164: '201037116711' },
  { display: CONTACT_MOBILE.display, e164: CONTACT_MOBILE.href.replace(/\D/g, '') },
]

/** Opens a WhatsApp chat with `e164`, optionally pre-filled with `text`. */
export function whatsappHref(e164: string, text?: string): string {
  const base = `https://wa.me/${e164}`
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}

/** Our office address, as printed on the Contact Us page. */
export const CONTACT_ADDRESS = {
  en: 'Unit No. 1474, located in the 8th Neighborhood, First District, 6th of October City, Giza Governorate, Egypt, ground floor.',
  ar: 'وحدة رقم 1474، المجاورة الثامنة، الحي الأول، مدينة السادس من أكتوبر، محافظة الجيزة، مصر، الدور الأرضي.',
}
