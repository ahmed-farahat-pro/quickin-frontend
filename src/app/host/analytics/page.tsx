// Host analytics — the web twin of iOS's HostAnalyticsView and Android's
// HostAnalyticsScreen: bookings, revenue, rating, conversion, a monthly trend
// and the host's top listings.
//
// Server component reading `GET /api/local/host/analytics`. The chart is inline
// SVG rather than a charting library: it is one series of at most six bars, and
// the arithmetic behind it (bar heights, the empty case) lives in
// host-analytics-core.ts where it is under test.
import type { Metadata } from 'next'
import type { HostAnalytics } from '@/lib/types'
import { viewer, backendFetchOr } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatDisplayPrice } from '@/lib/currency/display'
import { getRequestCurrency } from '@/lib/currency/request-currency'
import {
  averageRating,
  conversionPercent,
  hasNoAnalytics,
  monthLabel,
  trendBars,
} from '@/lib/local/host-analytics-core'
import { FRAME_COLORS as C, EmptyPanel, PageFrame, Panel } from '@/components/layout/page-frame'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hostAnalytics')
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: { canonical: '/host/analytics' },
    robots: { index: false, follow: true },
  }
}

const NO_ANALYTICS: HostAnalytics = {
  currency: 'EGP',
  listings: 0,
  totalBookings: 0,
  paidBookings: 0,
  cancelledBookings: 0,
  revenue: 0,
  avgRating: 0,
  reviewCount: 0,
  conversionRate: 0,
  byMonth: [],
  topListings: [],
}

// BCP47 mapping mirrors host-reservations.tsx so the month labels render in the
// active locale rather than in whatever the server's default is.
const DATE_LOCALE: Record<string, string> = {
  ar: 'ar-EG',
  fr: 'fr-FR',
  es: 'es-ES',
  en: 'en-US',
}

export default async function HostAnalyticsPage() {
  const me = await viewer()
  if (!me) redirect('/login')
  if (!me.is_host) redirect('/host')

  const t = await getTranslations('hostAnalytics')
  const locale = await getLocale()
  const displayCurrency = await getRequestCurrency()
  const a = await backendFetchOr<HostAnalytics>('/api/local/host/analytics', NO_ANALYTICS)

  const money = (amount: number) => formatDisplayPrice(amount, a.currency, displayCurrency)
  const dateLocale = DATE_LOCALE[locale] ?? 'en-US'
  const rating = averageRating(a.avgRating, a.reviewCount)
  const bars = trendBars(a.byMonth)

  return (
    <PageFrame
      title={t('title')}
      subtitle={t('subtitle')}
      backLinks={[
        { href: '/host', label: t('backToDashboard') },
        { href: '/account', label: t('backToAccount') },
      ]}
    >
      {hasNoAnalytics(a) ? (
        <EmptyPanel
          title={t('empty.title')}
          hint={t('empty.hint')}
          cta={{ href: '/host', label: t('empty.cta') }}
        />
      ) : (
        <>
          <div
            style={{
              background: `linear-gradient(135deg, ${C.burgundy} 0%, #7a1a24 100%)`,
              borderRadius: 22,
              padding: '26px 28px',
              color: '#fff',
              boxShadow: '0 10px 30px rgba(91,15,22,0.26)',
              marginBottom: 22,
            }}
          >
            <p
              style={{
                margin: '0 0 8px',
                fontSize: 12,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.72)',
              }}
            >
              {t('revenue')}
            </p>
            <p
              style={{
                margin: '0 0 6px',
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: 'clamp(30px, 6vw, 42px)',
                fontWeight: 700,
                lineHeight: 1.05,
              }}
            >
              {money(a.revenue)}
            </p>
            <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.78)' }}>
              {t('bookingsCount', { count: a.paidBookings })}
            </p>
          </div>

          {/* Six figures, two rows on desktop and one column on a phone. */}
          <style>{`
            .qk-stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
            @media (max-width: 780px) { .qk-stat-grid { grid-template-columns: 1fr 1fr !important; } }
            @media (max-width: 420px) { .qk-stat-grid { grid-template-columns: 1fr !important; } }
          `}</style>
          <div className="qk-stat-grid" style={{ marginBottom: 26 }}>
            <Stat label={t('stat.listings')} value={String(a.listings)} />
            <Stat label={t('stat.bookings')} value={String(a.totalBookings)} />
            <Stat label={t('stat.paidBookings')} value={String(a.paidBookings)} />
            <Stat
              label={t('stat.avgRating')}
              // A dash, not "0.0": nobody has reviewed this host yet, and a
              // zero-star average is not a thing a review can produce.
              value={rating === null ? '—' : rating.toFixed(1)}
              hint={rating === null ? t('stat.noReviews') : t('stat.reviews', { count: a.reviewCount })}
            />
            <Stat label={t('stat.conversion')} value={`${conversionPercent(a.conversionRate)}%`} />
            <Stat label={t('stat.cancelled')} value={String(a.cancelledBookings)} />
          </div>

          <h2 style={sectionHeading}>{t('trend.title')}</h2>
          {bars.length === 0 ? (
            <EmptyPanel title={t('trend.empty')} />
          ) : (
            <Panel style={{ marginBottom: 26 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 10,
                  height: 168,
                  // The row reads left-to-right in time even in Arabic: the
                  // month labels underneath are the axis, and mirroring the bars
                  // would put the oldest month on the right of a chart whose
                  // labels still ascend.
                  direction: 'ltr',
                }}
              >
                {bars.map((bar) => (
                  <div
                    key={bar.month}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      height: '100%',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>
                      {bar.bookings}
                    </span>
                    <div
                      title={money(bar.revenue)}
                      style={{
                        width: '100%',
                        maxWidth: 46,
                        // A month with no revenue still gets a 3px stub, so the
                        // axis reads as a month that earned nothing rather than
                        // as a month that is missing from the series.
                        height: `${Math.max(3, bar.height * 118)}px`,
                        background:
                          bar.height > 0
                            ? `linear-gradient(180deg, ${C.burgundy} 0%, #8d222c 100%)`
                            : C.tan,
                        borderRadius: 8,
                      }}
                    />
                    <span style={{ fontSize: 12, color: C.muted }}>
                      {monthLabel(bar.month, dateLocale)}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <h2 style={sectionHeading}>{t('topListings.title')}</h2>
          {a.topListings.length === 0 ? (
            <EmptyPanel title={t('topListings.empty')} />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {a.topListings.map((listing, i) => (
                <Panel key={`${listing.title}-${i}`} padding="15px 18px">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 14,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <span
                        style={{
                          flex: '0 0 auto',
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          background: C.tan,
                          color: C.burgundy,
                          fontSize: 13,
                          fontWeight: 800,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {i + 1}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 15.5,
                            fontWeight: 700,
                            color: C.ink,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {listing.title}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 13, color: C.muted }}>
                          {t('bookingsCount', { count: listing.bookings })}
                        </p>
                      </div>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 16,
                        fontWeight: 800,
                        color: C.burgundy,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {money(listing.revenue)}
                    </p>
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </>
      )}
    </PageFrame>
  )
}

const sectionHeading = {
  margin: '0 0 14px',
  fontFamily: '"Playfair Display", Georgia, serif',
  fontSize: 21,
  fontWeight: 700,
  color: C.ink,
} as const

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Panel padding="16px 18px">
      <p style={{ margin: '0 0 3px', fontSize: 22, fontWeight: 800, color: C.burgundy }}>{value}</p>
      <p style={{ margin: 0, fontSize: 13, color: C.muted }}>{label}</p>
      {hint && <p style={{ margin: '3px 0 0', fontSize: 12, color: C.muted }}>{hint}</p>}
    </Panel>
  )
}
