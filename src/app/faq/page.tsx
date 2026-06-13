import type { Metadata } from 'next'
import { JsonLd, faqLd, breadcrumbLd } from '../_components/structured-data'

// A real, content-rich FAQ. The visible Q&A is what AI answer engines read and
// cite (AEO); the FAQPage JSON-LD makes it eligible for FAQ rich results too.
export const metadata: Metadata = {
  title: 'Frequently Asked Questions',
  description:
    'How QuickIn works — booking boutique stays in Egypt’s North Coast, Ain Sokhna, El Gouna and Cairo, paying in EGP, hosting your place, and more.',
  alternates: { canonical: '/faq' },
}

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  ink: '#2A2220',
  muted: '#6B6055',
}

// Edit answers here — they feed BOTH the visible page and the JSON-LD.
const FAQS: { q: string; a: string }[] = [
  {
    q: 'What is QuickIn?',
    a: 'QuickIn is a boutique vacation-rental marketplace for Egypt. We list handpicked homes — chalets, villas and apartments — in the North Coast (Sahel), Ain Sokhna, El Gouna and Cairo, and let you book them instantly and pay in Egyptian Pounds (EGP).',
  },
  {
    q: 'Which areas in Egypt does QuickIn cover?',
    a: 'QuickIn focuses on Egypt’s top getaway regions: the North Coast (Sahel), Ain Sokhna, El Gouna, and Cairo. You can filter the Explore page by region to see every stay in a chosen area.',
  },
  {
    q: 'How do I book a stay on QuickIn?',
    a: 'Search by area or property name on the Explore page, open a listing, pick your check-in and check-out dates and number of guests, then send a booking request. The host confirms it, and you receive a reservation with a QR pass you can add to your wallet.',
  },
  {
    q: 'What currency are prices in?',
    a: 'All prices on QuickIn are shown and charged in Egyptian Pounds (EGP) per night.',
  },
  {
    q: 'How do I search for a place?',
    a: 'On the Explore page you can type an area like “North Coast” or a property name, tap a region chip, set dates and guests, filter by price, and sort by price or newest. Results update live.',
  },
  {
    q: 'How do I become a host on QuickIn?',
    a: 'Register as a host (you confirm a one-time code sent to your email), then add a listing: choose your area, drop a pin on the exact location, set the number of bedrooms, beds, bathrooms and guests, pick amenities, add photos, and set your nightly price in EGP. One email can be both a guest and a host.',
  },
  {
    q: 'Can the same account be both a guest and a host?',
    a: 'Yes. A single QuickIn account can browse and book as a guest and also list and manage properties as a host. You choose which mode to enter when you sign in.',
  },
  {
    q: 'Is QuickIn available in Arabic?',
    a: 'Yes — QuickIn supports both English and Arabic, including right-to-left layout, on the web and in the iOS and Android apps.',
  },
  {
    q: 'Does QuickIn have a mobile app?',
    a: 'Yes. QuickIn is available on the web, on iOS, and on Android, with the same listings, search, booking and hosting features across all three.',
  },
]

export default function FaqPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.cream,
        color: COLORS.ink,
        fontFamily: '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif',
        padding: '56px 24px 80px',
      }}
    >
      <JsonLd data={faqLd(FAQS)} />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', url: '/' },
          { name: 'FAQ', url: '/faq' },
        ])}
      />
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: COLORS.burgundy,
          }}
        >
          QuickIn
        </p>
        <h1
          style={{
            margin: '12px 0 8px',
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(30px, 5vw, 46px)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          Frequently asked questions
        </h1>
        <p style={{ margin: '0 0 36px', fontSize: 16, lineHeight: 1.6, color: COLORS.muted }}>
          Everything about booking boutique stays in Egypt, paying in EGP, and hosting on QuickIn.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {FAQS.map((item) => (
            <section
              key={item.q}
              style={{
                background: '#fff',
                borderRadius: 18,
                padding: '20px 22px',
                boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
                border: '1px solid rgba(42,34,32,0.05)',
              }}
            >
              <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: COLORS.ink }}>
                {item.q}
              </h2>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: COLORS.muted }}>
                {item.a}
              </p>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
