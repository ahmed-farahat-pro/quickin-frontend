'use client'

// Guest receipts (UI-only, MOCK data from the backend) — the signed-in guest's
// list of PAID stays, each itemized: subtotal, service fee, payment-method fee,
// promo discount (when applied), and the grand total + reservation code + paid
// date. Requires the bearer token in localStorage (qk_token); shows a sign-in
// prompt otherwise. All amounts arrive from the backend in EGP and render
// through the currency formatter so they follow the chosen display currency.
import { useCallback, useEffect, useState } from 'react'
import { getReceipts, getToken, type Receipt } from '@/lib/api'
import AuthArea from '../_components/auth-area'
import { useLanguage } from '@/lib/i18n/language-provider'
import { useCurrency } from '@/lib/currency/currency-provider'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  page: '#E4DECF',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  gold: '#B07A2A',
}

const GRAD_BURGUNDY = 'linear-gradient(135deg,#5B0F16,#8a2530)'

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

type Gate = 'checking' | 'anon' | 'ok'

export default function ReceiptsPage() {
  const { t } = useLanguage()
  const [gate, setGate] = useState<Gate>('checking')
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setGate('anon')
      return
    }
    setGate('ok')
    setLoading(true)
    setError(false)
    try {
      const data = await getReceipts(token)
      setReceipts(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.page,
        color: COLORS.ink,
        fontFamily: FONT,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header bar — same look as Account/Explore */}
      <header
        style={{
          background: `linear-gradient(180deg, ${COLORS.tan} 0%, ${COLORS.page} 100%)`,
          borderBottom: '1px solid rgba(91,15,22,0.10)',
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
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

      <section
        style={{
          maxWidth: 760,
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
          padding: '40px 24px 72px',
          flex: 1,
        }}
      >
        <h1
          style={{
            margin: '0 0 4px',
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(26px, 4vw, 34px)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: COLORS.burgundy,
          }}
        >
          {t('money.receiptsTitle')}
        </h1>
        <p style={{ margin: '0 0 28px', fontSize: 15, color: COLORS.muted }}>
          {t('money.receiptsSubtitle')}
        </p>

        {gate === 'checking' ? (
          <p style={{ fontSize: 15, color: COLORS.muted }}>{t('money.loading')}</p>
        ) : gate === 'anon' ? (
          <SignInPrompt />
        ) : loading ? (
          <p style={{ fontSize: 15, color: COLORS.muted }}>{t('money.loading')}</p>
        ) : error ? (
          <div
            style={{
              background: '#fff',
              borderRadius: 22,
              border: '1px solid rgba(42,34,32,0.06)',
              boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
              padding: '26px',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: '0 0 16px', fontSize: 15, color: COLORS.burgundy, fontWeight: 600 }}>
              {t('money.receiptsError')}
            </p>
            <button
              type="button"
              onClick={load}
              className="qk-press"
              style={{
                padding: '11px 22px',
                fontSize: 14,
                fontWeight: 700,
                fontFamily: FONT,
                color: '#fff',
                background: GRAD_BURGUNDY,
                border: 'none',
                borderRadius: 12,
                cursor: 'pointer',
              }}
            >
              {t('money.tryAgain')}
            </button>
          </div>
        ) : receipts.length === 0 ? (
          <EmptyReceipts />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {receipts.map((r) => (
              <ReceiptCard key={r.booking_id} receipt={r} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

// One itemized receipt card: header (title + reservation code + paid date),
// then the line items (subtotal, service fee, method fee, promo discount), then
// the grand total. Method fee is signed (card +, bank −). All money formatted.
function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const { t, lang } = useLanguage()
  const { format } = useCurrency()
  const locale = lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US'

  function fmtDate(d: string): string {
    const date = new Date(d + 'T00:00:00')
    if (Number.isNaN(date.getTime())) return d
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function fmtPaidAt(iso: string | null): string | null {
    if (!iso) return null
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const paidAt = fmtPaidAt(receipt.paidAt)
  const methodFeeLabel =
    receipt.method === 'card' ? t('money.methodFeeCard') : t('money.methodFeeBank')
  const methodLabel = t(`money.method.${receipt.method}`)

  return (
    <article
      style={{
        background: '#fff',
        borderRadius: 22,
        border: '1px solid rgba(42,34,32,0.06)',
        boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
        padding: '22px 24px 24px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
          paddingBottom: 16,
          borderBottom: '1px solid rgba(42,34,32,0.08)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COLORS.ink }}>
            {receipt.title}
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: COLORS.muted }}>
            {fmtDate(receipt.check_in)} – {fmtDate(receipt.check_out)} ·{' '}
            {t(receipt.nights === 1 ? 'money.night' : 'money.nights', {
              count: receipt.nights,
            })}
          </p>
        </div>
        <div style={{ textAlign: 'end', flex: '0 0 auto' }}>
          {receipt.reservation_code && (
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: COLORS.muted,
                fontWeight: 600,
              }}
            >
              {t('money.reservationCode')}:{' '}
              <span
                style={{
                  fontFamily: '"Geist Mono", ui-monospace, SFMono-Regular, monospace',
                  fontWeight: 700,
                  color: COLORS.ink,
                }}
              >
                {receipt.reservation_code}
              </span>
            </p>
          )}
          {paidAt && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: COLORS.muted }}>
              {t('money.paidOn')} {paidAt}
            </p>
          )}
        </div>
      </div>

      {/* Line items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        <Row label={t('money.subtotal')} value={format(receipt.subtotal)} />
        <Row label={t('money.serviceFee')} value={format(receipt.serviceFee)} />
        {receipt.methodFee !== 0 && (
          <Row
            label={`${methodFeeLabel} (${methodLabel})`}
            value={`${receipt.methodFee < 0 ? '−' : '+'}${format(Math.abs(receipt.methodFee))}`}
            tone={receipt.methodFee < 0 ? 'good' : 'muted'}
          />
        )}
        {receipt.promoDiscount > 0 && (
          <Row
            label={`${t('money.promoDiscount')}${receipt.promoCode ? ` (${receipt.promoCode})` : ''}`}
            value={`−${format(receipt.promoDiscount)}`}
            tone="good"
          />
        )}
      </div>

      {/* Total */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginTop: 16,
          paddingTop: 14,
          borderTop: '1px solid rgba(42,34,32,0.10)',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>
          {t('money.total')}
        </span>
        <span style={{ fontSize: 20, fontWeight: 800, color: COLORS.burgundy }}>
          {format(receipt.total)}
        </span>
      </div>
    </article>
  )
}

// A single label/value line in a receipt. `tone` tints the value green for
// discounts/credits.
function Row({
  label,
  value,
  tone = 'muted',
}: {
  label: string
  value: string
  tone?: 'muted' | 'good'
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
      <span style={{ color: COLORS.muted }}>{label}</span>
      <span
        style={{
          fontWeight: 600,
          color: tone === 'good' ? '#0f5132' : COLORS.ink,
        }}
      >
        {value}
      </span>
    </div>
  )
}

// Empty state — no receipts yet.
function EmptyReceipts() {
  const { t } = useLanguage()
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 22,
        border: '1px solid rgba(42,34,32,0.06)',
        boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
        padding: '40px 26px',
        textAlign: 'center',
      }}
    >
      <p style={{ margin: '0 0 18px', fontSize: 15, color: COLORS.muted, lineHeight: 1.6 }}>
        {t('money.noReceipts')}
      </p>
      <a
        href="/explore"
        className="qk-press"
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          fontSize: 14.5,
          fontWeight: 700,
          color: '#fff',
          background: GRAD_BURGUNDY,
          borderRadius: 12,
          textDecoration: 'none',
          boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
        }}
      >
        {t('money.browseStays')}
      </a>
    </div>
  )
}

// Sign-in prompt for anonymous visitors.
function SignInPrompt() {
  const { t } = useLanguage()
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 22,
        border: '1px solid rgba(42,34,32,0.06)',
        boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
        padding: '40px 26px',
        textAlign: 'center',
      }}
    >
      <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: COLORS.ink }}>
        {t('money.signInTitle')}
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: 15, color: COLORS.muted, lineHeight: 1.6 }}>
        {t('money.signInBody')}
      </p>
      <a
        href="/login"
        className="qk-press"
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          fontSize: 14.5,
          fontWeight: 700,
          color: '#fff',
          background: GRAD_BURGUNDY,
          borderRadius: 12,
          textDecoration: 'none',
          boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
        }}
      >
        {t('money.logIn')}
      </a>
    </div>
  )
}
