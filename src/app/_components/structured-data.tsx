// JSON-LD structured data. Search engines use it for rich results; AI answer
// engines (AEO) use it to understand and cite the page. Render <JsonLd data={...}/>
// anywhere in a server component — it emits a <script type="application/ld+json">.
import type { Listing } from '@/lib/api'

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://quickin-frontend.vercel.app'

const SITE_NAME = 'QuickIn'
const SITE_DESC =
  'QuickIn is a boutique vacation-rental marketplace for Egypt — handpicked stays in the North Coast, Ain Sokhna, El Gouna and Cairo. Find it. Book it. Live it.'

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe inside a JSON-LD script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

// The brand. Rendered once in the root layout.
export function organizationLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo-icon.png`,
    description: SITE_DESC,
    slogan: 'Find It. Book It. Live It.',
    areaServed: { '@type': 'Country', name: 'Egypt' },
  }
}

// The site + the on-site search action (lets engines deep-link a search box).
export function webSiteLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESC,
    publisher: { '@id': `${SITE_URL}/#organization` },
    inLanguage: ['en', 'ar'],
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/explore?location={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

// A single stay → a rich, citable listing.
export function listingLd(listing: Listing): Record<string, unknown> {
  const place = [listing.location, listing.country].filter(Boolean).join(', ')
  const images = (listing.listing_images ?? []).map((i) => i.url).filter(Boolean)
  return {
    '@context': 'https://schema.org',
    '@type': ['Product', 'LodgingBusiness'],
    '@id': `${SITE_URL}/explore/${listing.id}`,
    name: listing.title,
    description:
      listing.description?.trim() ||
      `A boutique stay${place ? ` in ${place}` : ''} on QuickIn.`,
    image: images.length ? images : [`${SITE_URL}/logo-icon.png`],
    url: `${SITE_URL}/explore/${listing.id}`,
    ...(place
      ? {
          address: {
            '@type': 'PostalAddress',
            addressLocality: listing.location ?? undefined,
            addressRegion: listing.region ?? undefined,
            addressCountry: listing.country || 'EG',
          },
        }
      : {}),
    ...(typeof listing.lat === 'number' && typeof listing.lng === 'number'
      ? { geo: { '@type': 'GeoCoordinates', latitude: listing.lat, longitude: listing.lng } }
      : {}),
    ...(listing.max_guests ? { occupancy: { '@type': 'QuantitativeValue', maxValue: listing.max_guests } } : {}),
    offers: {
      '@type': 'Offer',
      price: listing.price_per_night,
      priceCurrency: listing.currency || 'EGP',
      availability: 'https://schema.org/InStock',
      url: `${SITE_URL}/explore/${listing.id}`,
    },
  }
}

// Breadcrumb trail for a listing page.
export function breadcrumbLd(crumbs: { name: string; url: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url.startsWith('http') ? c.url : `${SITE_URL}${c.url}`,
    })),
  }
}

// FAQ → eligible for FAQ rich results AND highly citable by AI answer engines.
export function faqLd(qa: { q: string; a: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qa.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }
}
