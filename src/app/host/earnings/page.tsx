// Host earnings & payouts — the web twin of iOS's HostEarningsView and
// Android's HostEarningsScreen.
//
// Server component: reads `GET /api/local/host/earnings` through backendFetch,
// which forwards the qk_token cookie (the backend's getUserFromRequest takes
// either that or a Bearer token, which is why this needed no backend work).
// Nothing here is interactive, so nothing ships to the client bundle.
import type { Metadata } from 'next'
import type { HostEarnings, HostEarningsRow } from '@/lib/types'
import { viewer, backendFetchOr } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatDisplayPrice } from '@/lib/currency/display'
import { getRequestCurrency } from '@/lib/currency/request-currency'
import {
  commissionPercent,
  earningsRowState,
  hasNoEarnings,
  platformCommission,
  refundPercentOf,
  type EarningsRowState,
} from '@/lib/local/host-earnings-core'
import { FRAME_COLORS as C, EmptyPanel, PageFrame, Panel } from '@/components/layout/page-frame'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hostEarnings')
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: { canonical: '/host/earnings' },
    robots: { index: false, follow: true },
  }
}

/** An empty summary, so a failed read renders the page with nothing in it
 *  rather than a 500 — same posture as backendFetchOr everywhere else. */
const NO_EARNINGS: HostEarnings = {
  currency: 'EGP',
  totalEarned: 0,
  paidOut: 0,
  pending: 0,
  bookingsCount: 0,
  commissionRate: 0,
  guestPaid: 0,
  recent: [],
}

const ROW_CHIP: Record<EarningsRowState, { bg: string; fg: string; key: string }> = {
  paid_out: { bg: '#e7f5ec', fg: '#177245', key: 'row.paidOut' },
  upcoming: { bg: '#fff7e6', fg: '#9a6b00', key: 'row.upcoming' },
  refunded: { bg: '#f1efec', fg: C.muted, key: 'row.refunded' },
  partially_refunded: { bg: '#fdf0e6', fg: '#9a4b00', key: 'row.partiallyRefunded' },
  cancelled_kept: { bg: '#f1efec', fg: C.muted, key: 'row.cancelledKept' },
}

export default async function HostEarningsPage() {
  const me = await viewer()
  if (!me) redirect('/login')
  // A guest reaching this URL is sent to the dashboard, which is where the
  // "become a host" path lives. The backend would answer with their (empty)
  // earnings rather than a 403, so the guard has to be here.
  if (!me.is_host) redirect('/host')

  const t = await getTranslations('hostEarnings')
  const locale = await getLocale()
  const displayCurrency = await getRequestCurrency()
  const earnings = await backendFetchOr<HostEarnings>('/api/local/host/earnings', NO_EARNINGS)

  const money = (amount: number) => formatDisplayPrice(amount, earnings.currency, displayCurrency)
  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  const day = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : '—')

  const rate = commissionPercent(earnings.commissionRate)
  const commission = platformCommission(earnings)

  return (
    <PageFrame
      title={t('title')}
      subtitle={
        earnings.bookingsCount === 0
          ? t('noBookings')
          : t('countBookings', { count: earnings.bookingsCount })
      }
      backLinks={[
        { href: '/host', label: t('backToDashboard') },
        { href: '/account', label: t('backToAccount') },
      ]}
    >
      {hasNoEarnings(earnings) ? (
        <EmptyPanel
          title={t('empty.title')}
          hint={t('empty.hint')}
          cta={{ href: '/host', label: t('empty.cta') }}
        />
      ) : (
        <>
          {/* The burgundy hero: total earned, then the paid/pending split. */}
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
              {t('totalEarned')}
            </p>
            <p
              style={{
                margin: '0 0 18px',
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: 'clamp(30px, 6vw, 42px)',
                fontWeight: 700,
                lineHeight: 1.05,
              }}
            >
              {money(earnings.totalEarned)}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28 }}>
              <HeroStat label={t('paidOut')} value={money(earnings.paidOut)} />
              <HeroStat label={t('pending')} value={money(earnings.pending)} />
            </div>
          </div>

          {/* The commission line. Phrased as a markup on top of the host's price,
              never as a deduction — nothing above is reduced by it, and a host
              reading "commission" next to their earnings will assume otherwise
              unless told. */}
          {rate > 0 && (
            <Panel style={{ marginBottom: 22 }}>
              <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: C.ink }}>
                {t('commission.title', { rate })}
              </p>
              <p style={{ margin: 0, fontSize: 14, color: C.muted, lineHeight: 1.55 }}>
                {t('commission.body', {
                  guestPaid: money(earnings.guestPaid),
                  commission: money(commission),
                })}
              </p>
            </Panel>
          )}

          <h2
            style={{
              margin: '0 0 14px',
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 21,
              fontWeight: 700,
              color: C.ink,
            }}
          >
            {t('recent.title')}
          </h2>

          {earnings.recent.length === 0 ? (
            <EmptyPanel title={t('recent.emptyTitle')} hint={t('recent.emptyHint')} />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {earnings.recent.map((row) => (
                <EarningsRow
                  key={row.booking_id}
                  row={row}
                  money={money}
                  day={day}
                  t={t}
                />
              ))}
            </div>
          )}
        </>
      )}
    </PageFrame>
  )
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ margin: '0 0 2px', fontSize: 18, fontWeight: 800 }}>{value}</p>
      <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{label}</p>
    </div>
  )
}

function EarningsRow({
  row,
  money,
  day,
  t,
}: {
  row: HostEarningsRow
  money: (n: number) => string
  day: (iso: string | null) => string
  t: Awaited<ReturnType<typeof getTranslations<'hostEarnings'>>>
}) {
  const state = earningsRowState(row)
  const chip = ROW_CHIP[state]
  const refund = refundPercentOf(row)

  return (
    <Panel padding="16px 18px">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <p
            style={{
              margin: '0 0 3px',
              fontSize: 16,
              fontWeight: 700,
              color: C.ink,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {row.title}
          </p>
          <p style={{ margin: 0, fontSize: 13.5, color: C.muted }}>
            {day(row.check_in)} → {day(row.check_out)}
          </p>
          {/* Only ever rendered on a partial refund: on a full one the host's
              net is zero and the percentage adds nothing, and on an untouched
              booking there is no refund to describe. */}
          {state === 'partially_refunded' && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#9a4b00' }}>
              {t('row.refundedPercent', { percent: refund })}
            </p>
          )}
        </div>

        <div style={{ textAlign: 'end', flex: '0 0 auto' }}>
          <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: C.burgundy }}>
            {money(row.net)}
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
            {t(chip.key)}
          </span>
        </div>
      </div>
    </Panel>
  )
}
