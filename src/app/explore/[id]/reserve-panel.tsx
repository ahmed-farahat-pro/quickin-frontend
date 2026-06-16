'use client'

import { useState } from 'react'
import { API_URL } from '@/lib/api'
import DatePickerField from '../../_components/date-picker-field'
import { useLanguage } from '@/lib/i18n/language-provider'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: COLORS.muted,
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: FONT,
  color: COLORS.ink,
  background: '#fff',
  border: `1px solid rgba(42,34,32,0.14)`,
  borderRadius: 12,
  outline: 'none',
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'needsLogin' }
  | { kind: 'error'; message: string }
  // Booking created → show the (mock) payment step.
  | { kind: 'pay'; nights: number; subtotal: number; fee: number; grand: number; reservationId: string | null; paying: boolean }
  // Mock payment succeeded → confirmation + receipt.
  | { kind: 'paid'; nights: number; subtotal: number; fee: number; grand: number; reservationId: string | null; reference: string | null }

function nightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0
  const a = new Date(checkIn + 'T00:00:00')
  const b = new Date(checkOut + 'T00:00:00')
  const ms = b.getTime() - a.getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

export default function ReservePanel({
  listingId,
  pricePerNight,
  currency,
  maxGuests,
}: {
  listingId: string
  pricePerNight: number
  currency: string
  maxGuests: number | null
}) {
  const { t } = useLanguage()
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [guests, setGuests] = useState(1)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const nights = nightsBetween(checkIn, checkOut)
  const total = nights * pricePerNight

  async function handleReserve() {
    // Auth is a bearer token stored in localStorage after login/signup.
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('qk_token') : null
    if (!token) {
      setStatus({ kind: 'needsLogin' })
      return
    }

    setStatus({ kind: 'loading' })
    try {
      const res = await fetch(`${API_URL}/api/local/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          listing_id: listingId,
          check_in: checkIn,
          check_out: checkOut,
          guests,
        }),
      })

      if (res.status === 401) {
        setStatus({ kind: 'needsLogin' })
        return
      }

      const data = await res.json().catch(() => ({}))

      if (res.status === 201) {
        // Booking created (pending + unpaid). Show the mock payment step; the
        // 10% guest service fee mirrors what the /pay receipt returns.
        const subtotal = typeof data.total_price === 'number' ? data.total_price : total
        const fee = Math.round(subtotal * 0.1)
        setStatus({
          kind: 'pay',
          nights: subtotal && pricePerNight ? Math.round(subtotal / pricePerNight) : nights,
          subtotal,
          fee,
          grand: subtotal + fee,
          reservationId: typeof data.id === 'string' ? data.id : null,
          paying: false,
        })
        return
      }

      // 400 and anything else → surface the server error message.
      setStatus({
        kind: 'error',
        message: data.error || t('reserve.genericError'),
      })
    } catch {
      setStatus({
        kind: 'error',
        message: t('reserve.networkError'),
      })
    }
  }

  // MOCK payment — POSTs to /bookings/:id/pay, which always succeeds for now
  // (no real gateway yet). Swaps in the receipt + "paid" confirmation.
  async function handlePay() {
    if (status.kind !== 'pay' || !status.reservationId) return
    const token = typeof window !== 'undefined' ? localStorage.getItem('qk_token') : null
    if (!token) { setStatus({ kind: 'needsLogin' }); return }
    const snap = status
    setStatus({ ...snap, paying: true })
    try {
      const res = await fetch(`${API_URL}/api/local/bookings/${snap.reservationId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ method: 'mock' }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        const r = data.receipt || {}
        setStatus({
          kind: 'paid',
          nights: snap.nights,
          subtotal: typeof r.subtotal === 'number' ? r.subtotal : snap.subtotal,
          fee: typeof r.serviceFee === 'number' ? r.serviceFee : snap.fee,
          grand: typeof r.total === 'number' ? r.total : snap.grand,
          reservationId: snap.reservationId,
          reference: typeof r.reference === 'string' ? r.reference : null,
        })
        return
      }
      setStatus({ kind: 'error', message: data.error || t('reserve.genericError') })
    } catch {
      setStatus({ kind: 'error', message: t('reserve.networkError') })
    }
  }

  const canReserve = nights > 0 && guests >= 1 && status.kind !== 'loading'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: COLORS.burgundy }}>
          EGP {pricePerNight}
        </span>
        <span style={{ fontSize: 15, color: COLORS.muted }}>
          {t('listing.perNight')}
        </span>
      </div>
      <p style={{ margin: '6px 0 18px', fontSize: 13, color: COLORS.muted }}>
        {t('reserve.pricesInEgp')}
      </p>

      {/* Date pickers — a custom themed calendar popover (replaces the native
          date inputs). Wrap to one column when the card is too narrow. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 12 }}>
        <DatePickerField
          label={t('reserve.checkIn')}
          value={checkIn}
          ariaLabel={t('reserve.checkIn')}
          compact
          onChange={(iso) => {
            setCheckIn(iso)
            // Keep checkout valid: clear it if it now precedes check-in.
            if (iso && checkOut && checkOut < iso) setCheckOut('')
            setStatus({ kind: 'idle' })
          }}
        />
        <DatePickerField
          label={t('reserve.checkOut')}
          value={checkOut}
          ariaLabel={t('reserve.checkOut')}
          compact
          min={checkIn || undefined}
          onChange={(iso) => {
            setCheckOut(iso)
            setStatus({ kind: 'idle' })
          }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label htmlFor="rp-guests" style={labelStyle}>
          {t('reserve.guests')}
        </label>
        <input
          id="rp-guests"
          type="number"
          min={1}
          max={maxGuests || undefined}
          value={guests}
          onChange={(e) => {
            setGuests(Math.max(1, Number(e.target.value) || 1))
            setStatus({ kind: 'idle' })
          }}
          style={inputStyle}
        />
      </div>

      {/* Live total */}
      <div
        style={{
          marginTop: 18,
          paddingTop: 16,
          borderTop: `1px solid rgba(42,34,32,0.10)`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 14,
            color: COLORS.ink,
          }}
        >
          <span>
            EGP {pricePerNight} × {nights}{' '}
            {nights === 1 ? t('reserve.night') : t('reserve.nights')}
          </span>
          <span style={{ fontWeight: 700 }}>EGP {total}</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid rgba(42,34,32,0.10)`,
            fontSize: 16,
            fontWeight: 800,
            color: COLORS.burgundy,
          }}
        >
          <span>{t('reserve.total')}</span>
          <span>EGP {total}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleReserve}
        disabled={!canReserve}
        className={canReserve ? 'qk-press qk-pulse' : undefined}
        style={{
          marginTop: 18,
          width: '100%',
          padding: '15px',
          fontSize: 16,
          fontWeight: 700,
          fontFamily: FONT,
          color: '#fff',
          background: 'linear-gradient(135deg,#5B0F16,#8a2530)',
          border: 'none',
          borderRadius: 15,
          cursor: canReserve ? 'pointer' : 'not-allowed',
          opacity: canReserve ? 1 : 0.55,
          boxShadow: canReserve ? '0 10px 24px rgba(91,15,22,0.28)' : 'none',
        }}
      >
        {status.kind === 'loading' ? t('reserve.reserving') : t('reserve.reserve')}
      </button>

      {nights === 0 && status.kind === 'idle' && (
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 13,
            color: COLORS.muted,
            textAlign: 'center',
          }}
        >
          {t('reserve.pickDates')}
        </p>
      )}

      {/* Feedback */}
      {status.kind === 'needsLogin' && (
        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 12,
            background: COLORS.tan,
            fontSize: 14,
            color: COLORS.ink,
          }}
        >
          {t('reserve.pleaseSignIn')}{' '}
          <a
            href="/login"
            style={{ color: COLORS.burgundy, fontWeight: 700, textDecoration: 'none' }}
          >
            {t('reserve.logIn')}
          </a>
        </div>
      )}

      {status.kind === 'error' && (
        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(91,15,22,0.08)',
            border: `1px solid rgba(91,15,22,0.2)`,
            fontSize: 14,
            color: COLORS.burgundy,
            fontWeight: 600,
          }}
        >
          {status.message}
        </div>
      )}

      {(status.kind === 'pay' || status.kind === 'paid') && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={status.kind === 'paid' ? t('reserve.paidTitle') : t('reserve.payTitle')}
            onClick={() => setStatus({ kind: 'idle' })}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              background: 'rgba(20,12,10,0.45)',
              backdropFilter: 'blur(2px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              animation: 'qkFade 0.18s ease-out',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: 360,
                background: '#fff',
                borderRadius: 28,
                border: '1px solid rgba(42,34,32,0.06)',
                boxShadow: '0 24px 60px rgba(42,34,32,0.28)',
                padding: 28,
                textAlign: 'center',
                fontFamily: FONT,
                animation: 'qkPop 0.22s cubic-bezier(0.2,0.8,0.2,1)',
              }}
            >
              <button
                type="button"
                aria-label={t('explore.dismiss')}
                onClick={() => setStatus({ kind: 'idle' })}
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  border: 'none',
                  background: COLORS.tan,
                  color: COLORS.muted,
                  fontSize: 17,
                  lineHeight: 1,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>

              {/* Burgundy "sent" badge — pops in with a soft pulse ring. */}
              <div
                className="qk-pop qk-pulse"
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  background: 'linear-gradient(135deg,#5B0F16,#8a2530)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '4px auto 16px',
                  boxShadow: '0 8px 20px rgba(91,15,22,0.30)',
                }}
              >
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M22 2 11 13" />
                  <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
                </svg>
              </div>

              <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: COLORS.ink }}>
                {status.kind === 'paid' ? t('reserve.paidTitle') : t('reserve.payTitle')}
              </h2>
              <p style={{ margin: '0 0 18px', fontSize: 15, color: COLORS.muted, lineHeight: 1.45 }}>
                {status.kind === 'paid' ? t('reserve.paidBody') : t('reserve.paySubtitle')}
              </p>

              {/* Summary */}
              <div style={{ background: COLORS.tan, borderRadius: 16, padding: 14, textAlign: 'left' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 13,
                    color: COLORS.muted,
                  }}
                >
                  <span>
                    {status.nights}{' '}
                    {status.nights === 1 ? t('reserve.night') : t('reserve.nights')}
                  </span>
                  <span>
                    EGP {pricePerNight} {t('listing.perNight')}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: COLORS.muted, marginTop: 8 }}>
                  <span>{t('reserve.serviceFee')}</span>
                  <span>EGP {status.fee}</span>
                </div>
                {status.kind === 'paid' && status.reference && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: COLORS.muted, marginTop: 8 }}>
                    <span>{t('reserve.reference')}</span>
                    <span style={{ fontFamily: 'ui-monospace, monospace' }}>{status.reference}</span>
                  </div>
                )}
                <div style={{ height: 1, background: 'rgba(42,34,32,0.10)', margin: '10px 0' }} />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <span style={{ fontSize: 14, color: COLORS.muted }}>
                    {t('reserve.total')}
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: COLORS.burgundy }}>
                    EGP {status.grand}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {status.kind === 'pay' ? (
                  <>
                    <button
                      type="button"
                      onClick={handlePay}
                      disabled={status.paying}
                      className={status.paying ? undefined : 'qk-press'}
                      style={{
                        padding: '14px',
                        borderRadius: 14,
                        background: 'linear-gradient(135deg,#5B0F16,#8a2530)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 15,
                        border: 'none',
                        cursor: status.paying ? 'default' : 'pointer',
                        opacity: status.paying ? 0.7 : 1,
                        fontFamily: FONT,
                        boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
                      }}
                    >
                      {status.paying ? t('reserve.paying') : t('reserve.payNow', { amount: String(status.grand) })}
                    </button>
                    <span style={{ fontSize: 12, color: COLORS.muted }}>{t('reserve.demoNote')}</span>
                  </>
                ) : (
                  <>
                    {status.reservationId && (
                      <a
                        href={`/reservation/${status.reservationId}`}
                        className="qk-press"
                        style={{
                          display: 'block',
                          padding: '13px',
                          borderRadius: 14,
                          background: 'linear-gradient(135deg,#5B0F16,#8a2530)',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: 15,
                          textDecoration: 'none',
                          boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
                        }}
                      >
                        {t('reserve.viewReservation')}
                      </a>
                    )}
                    <a
                      href="/reservations"
                      style={{
                        display: 'block',
                        padding: '11px',
                        color: COLORS.muted,
                        fontWeight: 600,
                        fontSize: 14,
                        textDecoration: 'none',
                      }}
                    >
                      {t('reserve.allReservations')}
                    </a>
                  </>
                )}
              </div>
            </div>

            <style>{`
              @keyframes qkFade { from { opacity: 0 } to { opacity: 1 } }
              @keyframes qkPop { from { opacity: 0; transform: translateY(8px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
            `}</style>
          </div>
      )}
    </div>
  )
}
