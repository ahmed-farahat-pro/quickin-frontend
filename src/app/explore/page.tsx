// Explore grid (UI-only) — boutique stays explorer with search.
// The header/footer are rendered here; the interactive search/grid/map lives in
// the client component below. Listings are fetched from the backend API; the
// header auth state is a small client component reading localStorage.
import type { Metadata } from 'next'
import { API_URL, type Listing } from '@/lib/api'
import AuthArea from '../_components/auth-area'
import ExploreClient from './explore-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Explore boutique stays',
  description:
    'Browse a curated collection of hand-picked homes — from lakeside villas to desert hideaways. Search by location, dates, and guests.',
  alternates: { canonical: '/explore' },
  openGraph: {
    title: 'Explore boutique stays | QuickIn',
    description:
      'Browse a curated collection of hand-picked homes — from lakeside villas to desert hideaways.',
    url: '/explore',
    type: 'website',
    siteName: 'QuickIn',
    images: [{ url: '/logo.png', width: 700, height: 454, alt: 'QuickIn' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Explore boutique stays | QuickIn',
    description:
      'Browse a curated collection of hand-picked homes — from lakeside villas to desert hideaways.',
    images: ['/logo.png'],
  },
}

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

// Fetch the first page of listings from the backend. Fails gracefully (empty
// grid) if the backend is unreachable — the client component re-fetches live.
async function fetchListings(query: string): Promise<Listing[]> {
  try {
    const res = await fetch(
      `${API_URL}/api/local/listings${query ? `?${query}` : ''}`,
      { cache: 'no-store' }
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as Listing[]) : []
  } catch {
    return []
  }
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{
    location?: string
    checkIn?: string
    checkOut?: string
    guests?: string
    region?: string
    sort?: string
    minPrice?: string
    maxPrice?: string
  }>
}) {
  const sp = await searchParams
  const location = sp.location?.trim() || ''
  const checkIn = sp.checkIn?.trim() || ''
  const checkOut = sp.checkOut?.trim() || ''
  const guestsRaw = sp.guests?.trim() || ''
  const region = sp.region?.trim() || ''
  // Only accept the known sort values; anything else falls back to 'recommended'.
  const sortRaw = sp.sort?.trim() || ''
  const sort = (
    ['price_asc', 'price_desc', 'newest'].includes(sortRaw)
      ? sortRaw
      : 'recommended'
  ) as 'recommended' | 'price_asc' | 'price_desc' | 'newest'
  const minPrice = sp.minPrice?.trim() || ''
  const maxPrice = sp.maxPrice?.trim() || ''

  const params = new URLSearchParams()
  if (location) params.set('location', location)
  if (checkIn) params.set('checkIn', checkIn)
  if (checkOut) params.set('checkOut', checkOut)
  if (guestsRaw) params.set('guests', guestsRaw)
  if (region) params.set('region', region)
  if (sort !== 'recommended') params.set('sort', sort)
  if (minPrice) params.set('minPrice', minPrice)
  if (maxPrice) params.set('maxPrice', maxPrice)

  const listings = await fetchListings(params.toString())

  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.cream,
        color: COLORS.ink,
        fontFamily: FONT,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Footer grid collapses from 4 cols → 2 → 1 as the viewport narrows so
          it never overflows on phones. Inline styles can't hold media queries. */}
      <style>{`
        @media (max-width: 720px) {
          .qk-footer-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 440px) {
          .qk-footer-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* Header bar */}
      <header
        style={{
          background: `linear-gradient(180deg, ${COLORS.tan} 0%, ${COLORS.cream} 100%)`,
          borderBottom: `1px solid rgba(91,15,22,0.10)`,
          padding: '20px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          {/* Logo */}
          <a href="/explore" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <img
              src="/logo.png"
              alt="QuickIn"
              height={40}
              style={{ height: 40, width: 'auto', display: 'block' }}
            />
          </a>

          {/* Role-aware primary nav + auth (rendered client-side by AuthArea,
              which reads the persisted user/role from localStorage and swaps
              the guest links for the host dashboard links). */}
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              fontSize: 14,
              flexWrap: 'wrap',
            }}
          >
            <AuthArea />
          </nav>
        </div>
      </header>

      {/* Live search + results grid + map view (client component).
          The server-fetched listings seed the first paint; the client then
          re-fetches the backend live as the user types/filters. */}
      <ExploreClient
        initialListings={listings}
        initialFilters={{
          location,
          checkIn,
          checkOut,
          guests: guestsRaw,
          region,
          sort,
          minPrice,
          maxPrice,
        }}
      />

      {/* Footer */}
      <footer
        style={{
          background: COLORS.burgundy,
          color: COLORS.cream,
          padding: '48px 24px 32px',
        }}
      >
        <div
          className="qk-footer-grid"
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(3, 1fr)',
            gap: 32,
          }}
        >
          <div>
            <img
              src="/logo.png"
              alt="QuickIn"
              height={36}
              style={{
                height: 36,
                width: 'auto',
                display: 'block',
                marginBottom: 14,
                filter: 'brightness(0) invert(1)',
              }}
            />
            <p
              style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.6,
                color: 'rgba(246,241,230,0.78)',
                maxWidth: 280,
              }}
            >
              QuickIn — boutique stays for travelers who love the details.
            </p>
          </div>

          <FooterColumn
            title="Support"
            links={['Help center', 'Cancellation options', 'Safety info']}
          />
          <FooterColumn
            title="Hosting"
            links={['Become a host', 'Host resources', 'Community forum']}
          />
          <FooterColumn title="About" links={['Our story', 'Careers', 'Press']} />
        </div>

        <div
          style={{
            maxWidth: 1200,
            margin: '32px auto 0',
            paddingTop: 22,
            borderTop: '1px solid rgba(246,241,230,0.18)',
            fontSize: 13,
            color: 'rgba(246,241,230,0.7)',
          }}
        >
          © 2026 QuickIn. Crafted for the curious traveler.
        </div>
      </footer>
    </main>
  )
}

function FooterColumn({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <h3
        style={{
          margin: '0 0 12px',
          fontSize: 14,
          fontWeight: 700,
          color: COLORS.cream,
        }}
      >
        {title}
      </h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {links.map((link) => (
          <li key={link} style={{ marginBottom: 8 }}>
            <a
              href="#"
              style={{
                fontSize: 14,
                color: 'rgba(246,241,230,0.78)',
                textDecoration: 'none',
              }}
            >
              {link}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
