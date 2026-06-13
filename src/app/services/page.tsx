// Services browse grid (UI-only) — standalone experiences (jet ski, diving,
// yacht…) a host offers. Fetched from the backend API; a user subscribes from
// the detail page. Mirrors the Explore grid aesthetic. The header auth state is
// the same small client component used on Explore (reads localStorage).
import type { Metadata } from 'next'
import { API_URL, type Service } from '@/lib/api'
import AuthArea from '../_components/auth-area'
import ImagePlaceholder from '../_components/image-placeholder'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Book a service',
  description:
    'Browse standalone experiences from local hosts — jet ski rentals, diving trips, yacht charters and more. Subscribe and the host confirms.',
  alternates: { canonical: '/services' },
  openGraph: {
    title: 'Book a service | QuickIn',
    description:
      'Browse standalone experiences from local hosts — jet ski rentals, diving trips, yacht charters and more.',
    url: '/services',
    type: 'website',
    siteName: 'QuickIn',
    images: [{ url: '/logo.png', width: 700, height: 454, alt: 'QuickIn' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Book a service | QuickIn',
    description:
      'Browse standalone experiences from local hosts — jet ski rentals, diving trips, yacht charters and more.',
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

// Fetch all published services from the backend. Fails gracefully (empty grid)
// if the backend is unreachable.
async function fetchServices(): Promise<Service[]> {
  try {
    const res = await fetch(`${API_URL}/api/local/services`, {
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as Service[]) : []
  } catch {
    return []
  }
}

export default async function ServicesPage() {
  const services = await fetchServices()

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
      <style>{`
        @media (max-width: 440px) {
          .qk-services-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* Header bar — shared look with Explore. */}
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
          <a href="/explore" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <img
              src="/logo.png"
              alt="QuickIn"
              height={40}
              style={{ height: 40, width: 'auto', display: 'block' }}
            />
          </a>
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

      {/* Hero */}
      <section style={{ background: COLORS.cream, padding: '36px 24px 8px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h1
            style={{
              margin: 0,
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 'clamp(26px, 4vw, 38px)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: COLORS.burgundy,
            }}
          >
            Book a standalone experience
          </h1>
          <p
            style={{
              margin: '10px 0 4px',
              fontSize: 15,
              color: COLORS.muted,
              maxWidth: 560,
            }}
          >
            Jet ski rentals, diving trips, yacht charters and more — offered by
            local hosts. Subscribe and the host confirms your spot.
          </p>
        </div>
      </section>

      {/* Results grid */}
      <section
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
          padding: '28px 24px 72px',
          flex: 1,
        }}
      >
        {services.length === 0 ? (
          <div
            style={{ textAlign: 'center', padding: '64px 24px', color: COLORS.muted }}
          >
            <p style={{ margin: 0, fontSize: 20, fontWeight: 600, color: COLORS.ink }}>
              No services available yet
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 15 }}>
              Check back soon — hosts are adding experiences.
            </p>
          </div>
        ) : (
          <div
            className="qk-services-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 28,
            }}
          >
            {services.map((service) => {
              const cover = service.image_url || null
              return (
                <a
                  key={service.id}
                  href={`/services/${service.id}`}
                  style={{
                    display: 'block',
                    background: '#fff',
                    borderRadius: 22,
                    overflow: 'hidden',
                    textDecoration: 'none',
                    color: 'inherit',
                    boxShadow: '0 6px 24px rgba(42,34,32,0.08)',
                    border: '1px solid rgba(42,34,32,0.05)',
                    cursor: 'pointer',
                  }}
                >
                  {/* Cover */}
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '4 / 3',
                      overflow: 'hidden',
                      background: COLORS.tan,
                    }}
                  >
                    {cover ? (
                      <img
                        src={cover}
                        alt={service.title}
                        loading="lazy"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    ) : (
                      <ImagePlaceholder />
                    )}
                    {service.category && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 14,
                          left: 14,
                          background: 'rgba(255,255,255,0.94)',
                          color: COLORS.burgundy,
                          fontSize: 12,
                          fontWeight: 700,
                          letterSpacing: '0.01em',
                          padding: '6px 12px',
                          borderRadius: 999,
                          boxShadow: '0 2px 8px rgba(42,34,32,0.14)',
                        }}
                      >
                        {service.category}
                      </span>
                    )}
                  </div>

                  {/* Body */}
                  <div style={{ padding: '18px 20px 22px' }}>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 600,
                        lineHeight: 1.3,
                        color: COLORS.ink,
                      }}
                    >
                      {service.title}
                    </h2>
                    <p
                      style={{
                        margin: '6px 0 0',
                        fontSize: 14,
                        color: COLORS.muted,
                      }}
                    >
                      {[service.host_name, service.location]
                        .filter(Boolean)
                        .join(' · ') || 'QuickIn host'}
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: 12,
                        marginTop: 14,
                      }}
                    >
                      <span style={{ fontSize: 15, color: COLORS.ink }}>
                        <span style={{ fontWeight: 700, color: COLORS.burgundy }}>
                          EGP {service.price}
                        </span>
                      </span>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: '#fff',
                          background: COLORS.burgundy,
                          padding: '8px 16px',
                          borderRadius: 999,
                        }}
                      >
                        Subscribe
                      </span>
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer
        style={{
          background: COLORS.burgundy,
          color: COLORS.cream,
          padding: '32px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
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
