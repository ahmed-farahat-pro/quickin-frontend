// Service detail (UI-only) — a single standalone experience. Data is fetched
// from the backend API; a missing/unknown id renders notFound. The Subscribe
// action + branded confirmation modal live in the client SubscribePanel.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { API_URL, type Service } from '@/lib/api'
import SubscribePanel from './subscribe-panel'
import ImagePlaceholder from '../../_components/image-placeholder'
import ShareButton from '../../_components/share-button'

export const dynamic = 'force-dynamic'

// Fetch a single service from the backend. Returns null on 404 / error.
async function fetchService(id: string): Promise<Service | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/local/services/${encodeURIComponent(id)}`,
      { cache: 'no-store' }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data && typeof data === 'object' ? (data as Service) : null
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const service = await fetchService(id)

  if (!service) {
    return {
      title: 'Service not found',
      description:
        'This experience could not be found. Browse other services on QuickIn.',
      robots: { index: false, follow: true },
    }
  }

  const description =
    service.description?.trim() ||
    `A ${service.category || 'standalone'} experience${
      service.location ? ` in ${service.location}` : ''
    } from EGP ${service.price} on QuickIn.`
  const cover = service.image_url || '/logo.png'

  return {
    title: service.title,
    description: description.slice(0, 160),
    alternates: { canonical: `/services/${service.id}` },
    openGraph: {
      title: `${service.title} | QuickIn`,
      description: description.slice(0, 200),
      url: `/services/${service.id}`,
      type: 'website',
      siteName: 'QuickIn',
      images: [{ url: cover, alt: service.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${service.title} | QuickIn`,
      description: description.slice(0, 200),
      images: [cover],
    },
  }
}

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  page: '#E4DECF',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  gold: '#B07A2A',
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const service = await fetchService(id)
  if (!service) notFound()

  const hero = service.image_url || null

  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.page,
        color: COLORS.ink,
        fontFamily:
          '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* On phones the details + subscribe panel stack into one column and the
          sticky panel becomes static. Inline styles can't hold media queries. */}
      <style>{`
        @media (max-width: 760px) {
          .qk-detail-grid {
            grid-template-columns: 1fr !important;
          }
          .qk-detail-aside {
            position: static !important;
            top: auto !important;
          }
        }
      `}</style>

      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 24px 72px' }}>
        {/* Back link */}
        <a
          href="/services"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 600,
            color: COLORS.burgundy,
            textDecoration: 'none',
            marginBottom: 22,
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>&larr;</span>
          Back to Services
        </a>

        {/* Hero — slow Ken Burns drift + photo overlay. */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 9',
            borderRadius: 24,
            overflow: 'hidden',
            background: COLORS.tan,
            boxShadow: '0 22px 48px rgba(42,34,32,0.18)',
          }}
        >
          {hero ? (
            <>
              <img
                src={hero}
                alt={service.title}
                className="qk-kenburns"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg, transparent 55%, rgba(42,34,32,0.45))',
                  pointerEvents: 'none',
                }}
              />
            </>
          ) : (
            <ImagePlaceholder iconSize={52} fontSize={15} />
          )}
        </div>

        {/* Title + category + host/location */}
        <div style={{ marginTop: 34 }}>
          {service.category && (
            <span
              style={{
                display: 'inline-block',
                background: COLORS.tan,
                color: COLORS.gold,
                fontSize: 12,
                fontWeight: 700,
                padding: '5px 12px',
                borderRadius: 999,
                marginBottom: 12,
              }}
            >
              {service.category}
            </span>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontFamily:
                  '"Playfair Display", Georgia, "Times New Roman", serif',
                fontSize: 'clamp(28px, 4.5vw, 42px)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
                color: COLORS.burgundy,
              }}
            >
              {service.title}
            </h1>
            {/* Share chip — mirrors the listing detail placement. */}
            <span style={{ flex: '0 0 auto', marginTop: 4 }}>
              <ShareButton
                path={`/services/${service.id}`}
                title={`${service.title} | QuickIn`}
                size={44}
              />
            </span>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 16, color: COLORS.muted }}>
            {[
              service.host_name ? `Hosted by ${service.host_name}` : null,
              service.location,
            ]
              .filter(Boolean)
              .join(' · ') || 'QuickIn host'}
          </p>
        </div>

        {/* Two-column: details + subscribe card */}
        <div
          className="qk-detail-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 320px)',
            gap: 36,
            marginTop: 30,
            alignItems: 'start',
          }}
        >
          <div>
            {service.description ? (
              <div
                style={{
                  paddingTop: 4,
                }}
              >
                <h2
                  style={{
                    margin: '0 0 10px',
                    fontSize: 19,
                    fontWeight: 700,
                    color: COLORS.ink,
                  }}
                >
                  About this experience
                </h2>
                <p
                  style={{
                    margin: 0,
                    fontSize: 16,
                    lineHeight: 1.7,
                    color: COLORS.ink,
                  }}
                >
                  {service.description}
                </p>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 16, color: COLORS.muted }}>
                The host hasn&apos;t added a description for this experience yet.
              </p>
            )}
          </div>

          {/* Subscribe panel */}
          <aside
            className="qk-detail-aside"
            style={{
              background: '#fff',
              borderRadius: 22,
              border: `1px solid rgba(42,34,32,0.06)`,
              boxShadow: '0 22px 48px rgba(42,34,32,0.14)',
              padding: '24px 24px 26px',
              position: 'sticky',
              top: 24,
            }}
          >
            <SubscribePanel
              serviceId={service.id}
              price={service.price}
              currency={service.currency}
              title={service.title}
            />
          </aside>
        </div>
      </div>
    </main>
  )
}
