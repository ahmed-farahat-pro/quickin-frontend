// One service, and the form to request it. The web twin of iOS's
// ServiceDetailView and Android's service detail sheet.
//
// Public like the browse page: `GET /api/local/services/:id` needs no session,
// and the price it returns already includes the platform markup. Read no-store
// for the same reason the browse page is — see the note there.
import type { Metadata } from 'next'
import type { Service } from '@/lib/types'
import { backendFetch, viewer } from '@/lib/backend'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { formatDisplayPrice, isConverted } from '@/lib/currency/display'
import { getRequestCurrency } from '@/lib/currency/request-currency'
import { FRAME_COLORS as C, PageFrame } from '@/components/layout/page-frame'
import { SubscribeForm } from './subscribe-form'

export const dynamic = 'force-dynamic'

const FALLBACK_IMG =
  'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=1200&q=80'

async function loadService(id: string): Promise<Service | null> {
  // Same shape as /explore/[id]: allow404 turns a missing service into null so
  // it reaches notFound(), while a real backend failure still throws and lands
  // on error.tsx rather than being disguised as "no such service".
  return backendFetch<Service | null>(`/api/local/services/${id}`, { allow404: true })
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const service = await loadService(id)
  const t = await getTranslations('serviceDetail')
  if (!service) return { title: t('meta.notFound') }
  return {
    title: service.title,
    description: service.description?.slice(0, 160) || t('meta.fallbackDescription'),
    alternates: { canonical: `/services/${service.id}` },
  }
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const service = await loadService(id)
  if (!service) notFound()

  const t = await getTranslations('serviceDetail')
  const displayCurrency = await getRequestCurrency()
  const me = await viewer()

  const price = formatDisplayPrice(service.price, service.currency, displayCurrency)
  const converted = isConverted(service.currency, displayCurrency)

  return (
    <PageFrame
      title={service.title}
      subtitle={
        [service.category, service.location].filter(Boolean).join(' · ') || undefined
      }
      maxWidth={1000}
      backLinks={[
        { href: '/services', label: t('backToServices') },
        { href: '/explore', label: t('backToExplore') },
      ]}
    >
      <style>{`
        .qk-service-detail { display: grid; grid-template-columns: 1.6fr 1fr; gap: 26px; align-items: start; }
        @media (max-width: 860px) { .qk-service-detail { grid-template-columns: 1fr !important; } }
      `}</style>

      <div className="qk-service-detail">
        <div>
          <div
            style={{
              width: '100%',
              aspectRatio: '16 / 10',
              borderRadius: 22,
              overflow: 'hidden',
              background: C.tan,
              marginBottom: 22,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={service.image_url || FALLBACK_IMG}
              alt={service.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>

          {service.description && (
            <>
              <h2
                style={{
                  margin: '0 0 10px',
                  fontFamily: '"Playfair Display", Georgia, serif',
                  fontSize: 21,
                  fontWeight: 700,
                  color: C.ink,
                }}
              >
                {t('about')}
              </h2>
              <p
                style={{
                  margin: '0 0 24px',
                  fontSize: 15.5,
                  lineHeight: 1.65,
                  color: C.ink,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {service.description}
              </p>
            </>
          )}

          {service.host_name && (
            <p style={{ margin: 0, fontSize: 14.5, color: C.muted }}>
              {t('offeredBy', { host: service.host_name })}
            </p>
          )}
        </div>

        <aside style={{ position: 'sticky', top: 24 }}>
          <div
            style={{
              background: `linear-gradient(135deg, ${C.burgundy} 0%, #7a1a24 100%)`,
              borderRadius: 20,
              padding: '20px 22px',
              color: '#fff',
              marginBottom: 16,
              boxShadow: '0 10px 30px rgba(91,15,22,0.24)',
            }}
          >
            <p
              style={{
                margin: '0 0 6px',
                fontSize: 11.5,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.72)',
              }}
            >
              {t('price')}
            </p>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>{price}</p>
            {converted && (
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,0.75)' }}>
                {t('chargedIn', { currency: service.currency })}
              </p>
            )}
          </div>

          <SubscribeForm
            serviceId={service.id}
            signedIn={Boolean(me)}
            isOwnService={Boolean(me && me.id === service.host_id)}
          />
        </aside>
      </div>
    </PageFrame>
  )
}
