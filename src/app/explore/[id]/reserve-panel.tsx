'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  API_URL,
  getAvailability,
  validatePromo,
  type AvailabilitySpan,
  type CancellationPolicy,
  type PromoPreview,
} from '@/lib/api'
import {
  firstBlockedDayAfter,
  isDayUnavailable,
  rangeOverlapsAny,
  toRanges,
} from '@/lib/availability'
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

// Small "Weekly/Monthly discount −X%" pill shown near the price.
const discountChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  background: 'rgba(15,81,50,0.10)',
  color: '#0f5132',
  fontSize: 12,
  fontWeight: 700,
  padding: '4px 11px',
  borderRadius: 999,
  whiteSpace: 'nowrap',
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'needsLogin' }
  | { kind: 'error'; message: string }
  // Booking created → show the (mock) payment step. `method` drives the ±5%.
  | { kind: 'pay'; nights: number; subtotal: number; fee: number; reservationId: string | null; paying: boolean; method: PayMethod }
  // Mock payment succeeded → confirmation + receipt.
  | { kind: 'paid'; nights: number; subtotal: number; fee: number; methodFee: number; grand: number; reservationId: string | null; reference: string | null; method: PayMethod; promoCode: string | null; promoDiscount: number }

type PayMethod = 'card' | 'bank_transfer'
// Card adds 5% on the subtotal, bank transfer takes 5% off (mock — mirrors /pay).
function methodFeeFor(method: PayMethod, subtotal: number): number {
  return Math.round(subtotal * (method === 'card' ? 0.05 : -0.05))
}

function nightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0
  const a = new Date(checkIn + 'T00:00:00')
  const b = new Date(checkOut + 'T00:00:00')
  const ms = b.getTime() - a.getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

// i18n keys for each policy's name + one-line guest-facing description.
const POLICY_COPY: Record<CancellationPolicy, { nameKey: string; descKey: string }> = {
  flexible: { nameKey: 'cancel.flexible', descKey: 'cancel.flexibleDesc' },
  moderate: { nameKey: 'cancel.moderate', descKey: 'cancel.moderateDesc' },
  strict: { nameKey: 'cancel.strict', descKey: 'cancel.strictDesc' },
}

export default function ReservePanel({
  listingId,
  pricePerNight,
  currency,
  maxGuests,
  cancellationPolicy,
  weeklyDiscount = 0,
  monthlyDiscount = 0,
}: {
  listingId: string
  pricePerNight: number
  currency: string
  maxGuests: number | null
  cancellationPolicy: CancellationPolicy
  weeklyDiscount?: number
  monthlyDiscount?: number
}) {
  const { t } = useLanguage()
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [guests, setGuests] = useState(1)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  // Promo code (checkout). `promoInput` is the raw field; `promoPreview` holds
  // the last /validate result (valid/invalid + discount). Reset whenever a new
  // booking is created so a stale code never carries to a different stay.
  const [promoInput, setPromoInput] = useState('')
  const [promoPreview, setPromoPreview] = useState<PromoPreview | null>(null)
  const [promoChecking, setPromoChecking] = useState(false)

  // Unavailable spans (booked + host-blocked) for this listing. Fetched on
  // mount and refreshed after a successful booking so the calendar greys out
  // taken days and we can block straddling selections proactively.
  const [spans, setSpans] = useState<AvailabilitySpan[]>([])

  const loadAvailability = useCallback(
    (signal?: AbortSignal) => {
      getAvailability(listingId, signal).then((rows) => {
        if (!signal?.aborted) setSpans(rows)
      })
    },
    [listingId]
  )

  useEffect(() => {
    const ac = new AbortController()
    loadAvailability(ac.signal)
    return () => ac.abort()
  }, [loadAvailability])

  const ranges = useMemo(() => toRanges(spans), [spans])

  // Check-in day is unavailable if it sits inside any taken span.
  const isCheckInDisabled = useCallback(
    (iso: string) => isDayUnavailable(iso, ranges),
    [ranges]
  )

  // Check-out day is invalid if, given the chosen check-in, it lies on/after
  // the first taken night following check-in — that would straddle a blocked
  // span. (`min={checkIn}` already forbids days at/before check-in.) With no
  // check-in chosen yet, fall back to greying days inside a span.
  const firstBlockedAfter = useMemo(
    () => (checkIn ? firstBlockedDayAfter(checkIn, ranges) : null),
    [checkIn, ranges]
  )
  const isCheckOutDisabled = useCallback(
    (iso: string) => {
      if (!checkIn) return isDayUnavailable(iso, ranges)
      if (firstBlockedAfter && iso > firstBlockedAfter) return true
      return false
    },
    [checkIn, firstBlockedAfter, ranges]
  )

  const nights = nightsBetween(checkIn, checkOut)
  const total = nights * pricePerNight
  // Proactive guard: does the current selection overlap a taken span?
  const rangeBlocked = rangeOverlapsAny(checkIn, checkOut, ranges)

  async function handleReserve() {
    // Proactively reject a selection that overlaps a taken span — the calendar
    // already greys these out, this guards the typed/edge case.
    if (rangeOverlapsAny(checkIn, checkOut, ranges)) {
      setStatus({ kind: 'error', message: t('availability.unavailable') })
      return
    }

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
        // The newly booked span now makes those nights unavailable — refresh
        // so the calendar greys them out for the next selection.
        loadAvailability()
        // Fresh booking → clear any promo entered for a previous stay.
        setPromoInput('')
        setPromoPreview(null)
        setPromoChecking(false)
        // Booking created (pending + unpaid). Show the mock payment step; the
        // 10% guest service fee mirrors what the /pay receipt returns.
        const subtotal = typeof data.total_price === 'number' ? data.total_price : total
        const fee = Math.round(subtotal * 0.1)
        setStatus({
          kind: 'pay',
          nights: subtotal && pricePerNight ? Math.round(subtotal / pricePerNight) : nights,
          subtotal,
          fee,
          reservationId: typeof data.id === 'string' ? data.id : null,
          paying: false,
          method: 'card',
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

  // Preview a promo code against the current pay-step subtotal. Shows a
  // valid/invalid message; the actual discount is re-applied server-side at /pay.
  async function handleApplyPromo() {
    if (status.kind !== 'pay') return
    const code = promoInput.trim()
    if (!code || promoChecking) return
    setPromoChecking(true)
    try {
      const preview = await validatePromo(code, status.subtotal)
      setPromoPreview(preview)
    } finally {
      setPromoChecking(false)
    }
  }

  function handleRemovePromo() {
    setPromoInput('')
    setPromoPreview(null)
  }

  // MOCK payment — POSTs to /bookings/:id/pay, which always succeeds for now
  // (no real gateway yet). Swaps in the receipt + "paid" confirmation. Passes
  // any applied promo code; the server returns the final promo discount + total.
  async function handlePay() {
    if (status.kind !== 'pay' || !status.reservationId) return
    const token = typeof window !== 'undefined' ? localStorage.getItem('qk_token') : null
    if (!token) { setStatus({ kind: 'needsLogin' }); return }
    const snap = status
    // Only forward a code the preview marked valid (the server validates again).
    const promoCode = promoPreview?.valid ? promoPreview.code : null
    setStatus({ ...snap, paying: true })
    try {
      const res = await fetch(`${API_URL}/api/local/bookings/${snap.reservationId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ method: snap.method, promo_code: promoCode || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        const r = data.receipt || {}
        const fee = typeof r.serviceFee === 'number' ? r.serviceFee : snap.fee
        const mf = typeof r.methodFee === 'number' ? r.methodFee : methodFeeFor(snap.method, snap.subtotal)
        const sub = typeof r.subtotal === 'number' ? r.subtotal : snap.subtotal
        const promoDiscount = typeof r.promoDiscount === 'number' ? r.promoDiscount : 0
        const receiptCode = typeof r.promoCode === 'string' ? r.promoCode : promoCode
        setStatus({
          kind: 'paid',
          nights: snap.nights,
          subtotal: sub,
          fee,
          methodFee: mf,
          grand: typeof r.total === 'number' ? r.total : sub + fee + mf - promoDiscount,
          reservationId: snap.reservationId,
          reference: typeof r.reference === 'string' ? r.reference : null,
          method: snap.method,
          promoCode: promoDiscount > 0 ? receiptCode : null,
          promoDiscount,
        })
        return
      }
      setStatus({ kind: 'error', message: data.error || t('reserve.genericError') })
    } catch {
      setStatus({ kind: 'error', message: t('reserve.networkError') })
    }
  }

  const canReserve =
    nights > 0 && guests >= 1 && !rangeBlocked && status.kind !== 'loading'

  // Live pay-step total: subtotal + service fee ± method fee − previewed promo
  // discount. (The receipt uses the server-returned `grand` instead.) Floored at
  // 0 so a large promo never shows a negative total in the UI.
  const payNowAmount =
    status.kind === 'pay'
      ? Math.max(
          0,
          status.subtotal +
            status.fee +
            methodFeeFor(status.method, status.subtotal) -
            (promoPreview?.valid ? promoPreview.discount : 0)
        )
      : 0

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
      <p style={{ margin: '6px 0 0', fontSize: 13, color: COLORS.muted }}>
        {t('reserve.pricesInEgp')}
      </p>

      {/* Length-of-stay discounts — shown near the price when the host set them.
          The backend applies them to the total automatically. */}
      {(weeklyDiscount > 0 || monthlyDiscount > 0) && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            margin: '12px 0 0',
          }}
        >
          {weeklyDiscount > 0 && (
            <span style={discountChipStyle}>
              {t('growth.weeklyOff', { percent: weeklyDiscount })}
            </span>
          )}
          {monthlyDiscount > 0 && (
            <span style={discountChipStyle}>
              {t('growth.monthlyOff', { percent: monthlyDiscount })}
            </span>
          )}
        </div>
      )}

      <div style={{ height: 18 }} />

      {/* Date pickers — a custom themed calendar popover (replaces the native
          date inputs). Wrap to one column when the card is too narrow. */}
      {/* (cancellation policy line is rendered at the bottom of the panel) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 12 }}>
        <DatePickerField
          label={t('reserve.checkIn')}
          value={checkIn}
          ariaLabel={t('reserve.checkIn')}
          compact
          isDateDisabled={isCheckInDisabled}
          onChange={(iso) => {
            setCheckIn(iso)
            // Keep checkout valid: clear it if it now precedes check-in or if
            // the existing checkout would now straddle a blocked span.
            if (
              iso &&
              checkOut &&
              (checkOut < iso || rangeOverlapsAny(iso, checkOut, ranges))
            ) {
              setCheckOut('')
            }
            setStatus({ kind: 'idle' })
          }}
        />
        <DatePickerField
          label={t('reserve.checkOut')}
          value={checkOut}
          ariaLabel={t('reserve.checkOut')}
          compact
          min={checkIn || undefined}
          isDateDisabled={isCheckOutDisabled}
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

      {nights > 0 && rangeBlocked && status.kind === 'idle' && (
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 13,
            color: COLORS.burgundy,
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          {t('availability.unavailable')}
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

      {/* Cancellation policy — name + one-line explanation for this listing. */}
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
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 700,
            color: COLORS.ink,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke={COLORS.burgundy}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 3v5h5" />
            <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
            <path d="M12 7v5l3 2" />
          </svg>
          {t('cancel.policy')}:{' '}
          <span style={{ color: COLORS.burgundy }}>
            {t(POLICY_COPY[cancellationPolicy].nameKey)}
          </span>
        </div>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 13,
            color: COLORS.muted,
            lineHeight: 1.5,
          }}
        >
          {t(POLICY_COPY[cancellationPolicy].descKey)}
        </p>
      </div>

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

              {/* Payment method — card adds 5%, bank transfer takes 5% off. */}
              {status.kind === 'pay' && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  {(['card', 'bank_transfer'] as PayMethod[]).map((m) => {
                    const active = status.method === m
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setStatus({ ...status, method: m })}
                        style={{
                          flex: 1,
                          padding: '10px 8px',
                          borderRadius: 12,
                          cursor: 'pointer',
                          border: active ? '2px solid #5B0F16' : '1px solid rgba(42,34,32,0.16)',
                          background: active ? 'rgba(91,15,22,0.06)' : '#fff',
                          color: COLORS.ink,
                          fontFamily: FONT,
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        {m === 'card' ? t('reserve.methodCard') : t('reserve.methodBank')}
                        <div style={{ fontSize: 11, fontWeight: 700, color: m === 'card' ? '#8a5a00' : '#0F5132', marginTop: 2 }}>
                          {m === 'card' ? t('reserve.cardPlus') : t('reserve.bankMinus')}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Promo code — preview the discount; the code is forwarded to
                  /pay which re-validates and returns the final total. */}
              {status.kind === 'pay' && (
                <div style={{ marginBottom: 14, textAlign: 'left' }}>
                  <label
                    htmlFor="rp-promo"
                    style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COLORS.muted, marginBottom: 6 }}
                  >
                    {t('promo.haveCode')}
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      id="rp-promo"
                      type="text"
                      value={promoInput}
                      onChange={(e) => {
                        setPromoInput(e.target.value.toUpperCase())
                        // Editing the code clears a stale preview.
                        if (promoPreview) setPromoPreview(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleApplyPromo()
                        }
                      }}
                      placeholder={t('promo.placeholder')}
                      style={{ ...inputStyle, flex: 1, textTransform: 'uppercase' }}
                      disabled={status.paying}
                    />
                    {promoPreview?.valid ? (
                      <button
                        type="button"
                        onClick={handleRemovePromo}
                        disabled={status.paying}
                        style={{
                          flex: '0 0 auto',
                          padding: '10px 16px',
                          borderRadius: 12,
                          border: `1px solid ${COLORS.burgundy}`,
                          background: '#fff',
                          color: COLORS.burgundy,
                          fontWeight: 700,
                          fontSize: 13,
                          fontFamily: FONT,
                          cursor: status.paying ? 'default' : 'pointer',
                        }}
                      >
                        {t('promo.remove')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleApplyPromo}
                        disabled={!promoInput.trim() || promoChecking || status.paying}
                        className={!promoInput.trim() || promoChecking || status.paying ? undefined : 'qk-press'}
                        style={{
                          flex: '0 0 auto',
                          padding: '10px 18px',
                          borderRadius: 12,
                          border: 'none',
                          background:
                            !promoInput.trim() || promoChecking || status.paying
                              ? 'rgba(91,15,22,0.35)'
                              : 'linear-gradient(135deg,#5B0F16,#8a2530)',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: 13,
                          fontFamily: FONT,
                          cursor:
                            !promoInput.trim() || promoChecking || status.paying ? 'default' : 'pointer',
                        }}
                      >
                        {promoChecking ? t('promo.applying') : t('promo.apply')}
                      </button>
                    )}
                  </div>
                  {promoPreview && (
                    <p
                      style={{
                        margin: '8px 0 0',
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: promoPreview.valid ? '#0f5132' : COLORS.burgundy,
                      }}
                    >
                      {promoPreview.valid
                        ? `✓ ${t('promo.applied')} · −EGP ${promoPreview.discount}`
                        : promoPreview.message || t('promo.invalid')}
                    </p>
                  )}
                </div>
              )}

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
                {(() => {
                  const mf = status.kind === 'paid' ? status.methodFee : methodFeeFor(status.method, status.subtotal)
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: mf < 0 ? '#0F5132' : COLORS.muted, marginTop: 8 }}>
                      <span>{status.method === 'card' ? t('reserve.cardSurcharge') : t('reserve.bankDiscount')}</span>
                      <span>{mf < 0 ? '−' : '+'}EGP {Math.abs(mf)}</span>
                    </div>
                  )
                })()}
                {/* Promo discount — live preview on the pay step, final value on
                    the receipt. */}
                {(() => {
                  const pd =
                    status.kind === 'paid'
                      ? status.promoDiscount
                      : promoPreview?.valid
                        ? promoPreview.discount
                        : 0
                  const pc =
                    status.kind === 'paid'
                      ? status.promoCode
                      : promoPreview?.valid
                        ? promoPreview.code
                        : null
                  if (!pd) return null
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#0F5132', marginTop: 8 }}>
                      <span>
                        {t('promo.discount')}
                        {pc ? ` (${pc})` : ''}
                      </span>
                      <span>−EGP {pd}</span>
                    </div>
                  )
                })()}
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
                    EGP {status.kind === 'paid' ? status.grand : payNowAmount}
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
                      {status.paying ? t('reserve.paying') : t('reserve.payNow', { amount: String(payNowAmount) })}
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
