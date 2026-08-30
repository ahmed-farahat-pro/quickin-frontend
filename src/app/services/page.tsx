// Services browse — the experiences a host offers alongside a stay (diving,
// boat tours, transfers). The web twin of iOS's ServicesView tab and Android's
// ServicesScreen.
//
// `GET /api/local/services` returns only published services and needs no
// session, so a signed-out visitor sees the whole catalogue. The price it
// renders is already commission-inclusive — the guest projection never serves a
// host's raw price.
//
// Read through backendFetchOr, not backendFetchPublic: the latter caches for
// five minutes, and a host who has just posted a service and come to look for
// it would find an empty grid. The page is force-dynamic and calls viewer()
// anyway, so there was no static render left to protect.
import type { Metadata } from 'next'
import type { Service } from '@/lib/types'
import { backendFetchOr, viewer } from '@/lib/backend'
import { getTranslations } from 'next-intl/server'
import { formatDisplayPrice } from '@/lib/currency/display'
import { getRequestCurrency } from '@/lib/currency/request-currency'
import { FRAME_COLORS as C, EmptyPanel, PageFrame } from '@/components/layout/page-frame'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('servicesPage')
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: { canonical: '/services' },
  }
}

const FALLBACK_IMG =
  'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=800&q=80'

export default async function ServicesPage() {
  const t = await getTranslations('servicesPage')
  const displayCurrency = await getRequestCurrency()
  const services = await backendFetchOr<Service[]>('/api/local/services', [])
  // Only to decide which back-links to offer. A signed-out visitor still sees
  // the whole catalogue — this page is public.
  const me = await viewer()

  const backLinks = [{ href: '/explore', label: t('backToExplore') }]
  if (me?.is_host) backLinks.push({ href: '/host/services', label: t('manageYours') })

  return (
    <PageFrame
      title={t('title')}
      subtitle={
        services.length === 0 ? t('noneYet') : t('count', { count: services.length })
      }
      backLinks={backLinks}
    >
      <style>{`
        .qk-services-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
        @media (max-width: 820px) { .qk-services-grid { grid-template-columns: 1fr 1fr !important; } }
        @media (max-width: 520px) { .qk-services-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      {services.length === 0 ? (
        <EmptyPanel
          title={t('empty.title')}
          hint={t('empty.hint')}
          cta={{ href: '/explore', label: t('empty.cta') }}
        />
      ) : (
        <div className="qk-services-grid">
          {services.map((service) => (
            <a
              key={service.id}
              href={`/services/${service.id}`}
              style={{
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
                background: '#fff',
                borderRadius: 20,
                border: '1px solid rgba(42,34,32,0.06)',
                boxShadow: '0 6px 24px rgba(42,34,32,0.07)',
                overflow: 'hidden',
              }}
            >
              <div style={{ width: '100%', aspectRatio: '4 / 3', background: C.tan }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={service.image_url || FALLBACK_IMG}
                  alt={service.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
              <div style={{ padding: '16px 18px 18px' }}>
                {service.category && (
                  <p
                    style={{
                      margin: '0 0 6px',
                      fontSize: 11.5,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: C.muted,
                      fontWeight: 700,
                    }}
                  >
                    {service.category}
                  </p>
                )}
                <h2
                  style={{
                    margin: 0,
                    fontSize: 17,
                    fontWeight: 700,
                    color: C.ink,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {service.title}
                </h2>
                {service.location && (
                  <p style={{ margin: '4px 0 0', fontSize: 14, color: C.muted }}>
                    {service.location}
                  </p>
                )}
                <p style={{ margin: '12px 0 0', fontSize: 15, fontWeight: 700, color: C.burgundy }}>
                  {formatDisplayPrice(service.price, service.currency, displayCurrency)}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </PageFrame>
  )
}
