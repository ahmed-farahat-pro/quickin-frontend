// "My service requests" — the guest's side of a subscription, and the other
// half of the loop the host answers from /host/services. The web twin of
// Android's MySubscriptionsScreen and iOS's subscriptions list.
//
// Server-rendered: nothing here is interactive. A guest cannot withdraw a
// request on any platform — the host answers it — so this is a list, not a
// form, and it stays a server component.
import type { Metadata } from 'next'
import type { ServiceRequest } from '@/lib/types'
import { viewer, backendFetchOr } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatDisplayPrice } from '@/lib/currency/display'
import { getRequestCurrency } from '@/lib/currency/request-currency'
import { serviceRequestBucket, type ServiceRequestBucket } from '@/lib/local/services-core'
import { FRAME_COLORS as C, EmptyPanel, PageFrame, Panel } from '@/components/layout/page-frame'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('mySubscriptions')
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: { canonical: '/account/subscriptions' },
    robots: { index: false, follow: true },
  }
}

const DATE_LOCALE: Record<string, string> = {
  ar: 'ar-EG',
  fr: 'fr-FR',
  es: 'es-ES',
  en: 'en-US',
}

const BUCKET_CHIP: Record<ServiceRequestBucket, { bg: string; fg: string }> = {
  pending: { bg: '#fff7e6', fg: '#9a6b00' },
  confirmed: { bg: '#e7f5ec', fg: '#177245' },
  rejected: { bg: '#fdecea', fg: '#b3261e' },
}

export default async function MySubscriptionsPage() {
  const me = await viewer()
  if (!me) redirect('/login')

  const t = await getTranslations('mySubscriptions')
  const locale = await getLocale()
  const displayCurrency = await getRequestCurrency()
  const requests = await backendFetchOr<ServiceRequest[]>('/api/local/service-requests', [])

  const dateFmt = new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <PageFrame
      title={t('title')}
      subtitle={requests.length === 0 ? t('noneYet') : t('count', { count: requests.length })}
      maxWidth={860}
      backLinks={[
        { href: '/account', label: t('backToAccount') },
        { href: '/services', label: t('backToServices') },
      ]}
    >
      {requests.length === 0 ? (
        <EmptyPanel
          title={t('empty.title')}
          hint={t('empty.hint')}
          cta={{ href: '/services', label: t('empty.cta') }}
        />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {requests.map((request) => {
            const bucket = serviceRequestBucket(request.status)
            const chip = BUCKET_CHIP[bucket]
            return (
              <Panel key={request.id} padding="16px 18px">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 14,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                    <a
                      href={`/services/${request.service_id}`}
                      style={{
                        display: 'block',
                        margin: '0 0 2px',
                        fontSize: 16,
                        fontWeight: 700,
                        color: C.ink,
                        textDecoration: 'none',
                      }}
                    >
                      {request.service_title}
                    </a>
                    <p style={{ margin: 0, fontSize: 13.5, color: C.muted }}>
                      {request.host_name
                        ? t('byHost', { host: request.host_name })
                        : t('byDeletedHost')}
                      {request.service_location && ` · ${request.service_location}`}
                    </p>
                    {request.preferred_date && (
                      <p style={{ margin: '4px 0 0', fontSize: 13.5, color: C.muted }}>
                        {t('preferred', { date: dateFmt.format(new Date(request.preferred_date)) })}
                      </p>
                    )}
                    {request.note && (
                      <p style={{ margin: '8px 0 0', fontSize: 14, color: C.ink, lineHeight: 1.5 }}>
                        “{request.note}”
                      </p>
                    )}
                    {/* Only on a confirmed request: the code is what the guest
                        quotes to the host on the day, and showing it beside a
                        request nobody has accepted yet reads as a booking. */}
                    {bucket === 'confirmed' && request.request_code && (
                      <p style={{ margin: '8px 0 0', fontSize: 13.5, fontWeight: 700, color: C.burgundy }}>
                        {t('code', { code: request.request_code })}
                      </p>
                    )}
                  </div>

                  <div style={{ textAlign: 'end', flex: '0 0 auto' }}>
                    <p style={{ margin: '0 0 6px', fontSize: 15.5, fontWeight: 800, color: C.burgundy }}>
                      {formatDisplayPrice(
                        request.service_price,
                        request.service_currency,
                        displayCurrency,
                      )}
                    </p>
                    <span
                      style={{
                        display: 'inline-block',
                        background: chip.bg,
                        color: chip.fg,
                        borderRadius: 999,
                        padding: '3px 11px',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {t(`status.${bucket}`)}
                    </span>
                  </div>
                </div>
              </Panel>
            )
          })}
        </div>
      )}
    </PageFrame>
  )
}
