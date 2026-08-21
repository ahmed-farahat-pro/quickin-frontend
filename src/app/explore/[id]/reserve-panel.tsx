'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { formatPrice } from '@/lib/utils'
import { formatDisplayPrice, isConverted } from '@/lib/currency/display'
import { useDisplayCurrency } from '@/components/providers/display-currency-provider'
import { stayQuote } from '@/lib/geo'
import { nightsOfStay } from '@/lib/local/date-pricing-core'
import type { PriceSource } from '@/lib/local/date-pricing-core'
import { DateRangePicker } from '@/components/ui/date-range-picker'

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

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'needsLogin' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; nights: number; total: number }

export default function ReservePanel({
  listingId,
  pricePerNight,
  weekendPrice,
  weekendDays,
  currency,
  maxGuests,
}: {
  listingId: string
  pricePerNight: number
  weekendPrice?: number | null
  weekendDays?: number[] | null
  currency: string
  maxGuests: number | null
}) {
  const t = useTranslations('listingPage')
  const tc = useTranslations('currency')
  const { currency: displayCurrency } = useDisplayCurrency()
  // A quote shown in the guest's currency is an estimate; the booking is
  // created and charged in the listing's own currency, so say which that is.
  const converted = isConverted(currency, displayCurrency)
  const price = (amount: number) => formatDisplayPrice(amount, currency, displayCurrency)
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [infants, setInfants] = useState(0)
  const [pets, setPets] = useState(0)
  const guests = adults + children // total headcount (infants/pets don't count)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  // What each night of the chosen stay costs, straight from the host's calendar.
  // These are GUEST prices — the calendar endpoint marks each night up and rounds
  // it individually for a public reader, so the list here always adds up to the
  // total, and nothing has to re-derive the markup on the client.
  const [dayPrices, setDayPrices] = useState<Record<string, { price: number; source: PriceSource }>>({})

  const stayNights = useMemo(() => nightsOfStay(checkIn, checkOut), [checkIn, checkOut])

  // Windows already requested, so a window that comes back short is not asked for
  // again. Without this the effect would re-run on every merge — setDayPrices
  // always returns a fresh object — and a response missing even one night would
  // never satisfy the guard below, turning a slow day into an endless refetch.
  const fetched = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (stayNights.length === 0) return
    // Only the nights being paid for: [checkIn, checkOut), so the checkout day
    // is never fetched and never priced.
    const start = stayNights[0]
    const end = stayNights[stayNights.length - 1]
    const window = `${listingId}:${start}:${end}`
    if (fetched.current.has(window)) return
    if (stayNights.every((d) => dayPrices[d])) return
    fetched.current.add(window)
    const ac = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(
          `/api/local/listings/${listingId}/calendar?start=${start}&end=${end}`,
          { signal: ac.signal, cache: 'no-store' }
        )
        if (!res.ok) {
          // Let a transient failure be retried when the guest next changes dates.
          fetched.current.delete(window)
          return
        }
        const payload = await res.json()
        setDayPrices((prev) => {
          const next = { ...prev }
          for (const d of payload.days ?? []) next[d.date] = { price: d.price, source: d.source }
          return next
        })
      } catch {
        // Offline or a slow network: the panel falls back to the local estimate
        // below, which is what it always showed before the calendar existed.
        fetched.current.delete(window)
      }
    })()
    return () => ac.abort()
  }, [listingId, stayNights, dayPrices])

  /** Per-night prices, but only when we have every night — a partial list would
   *  add up to less than the total and read as a discount. */
  const breakdown = useMemo(() => {
    if (stayNights.length === 0) return null
    if (!stayNights.every((d) => dayPrices[d])) return null
    return stayNights.map((date) => ({ date, ...dayPrices[date] }))
  }, [stayNights, dayPrices])

  // The local estimate is still the fallback for the moment before the calendar
  // arrives (and if it never does). It knows the base and weekend rates, which
  // covers every listing whose host has not touched their calendar.
  const local = stayQuote(checkIn, checkOut, pricePerNight, weekendPrice, weekendDays)
  const nights = stayNights.length
  const total = breakdown ? breakdown.reduce((sum, n) => sum + n.price, 0) : local.total

  const weekendActive = typeof weekendPrice === 'number' && weekendPrice > 0 && !!weekendDays && weekendDays.length > 0
  /** Itemise only when the nights actually differ. A stay at one flat rate reads
   *  better as "3,000 × 3 nights" than as the same number written three times. */
  const varies = !!breakdown && breakdown.some((n) => n.price !== breakdown[0].price)

  async function handleReserve() {
    setStatus({ kind: 'loading' })
    try {
      const res = await fetch('/api/local/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listingId,
          check_in: checkIn,
          check_out: checkOut,
          guests,
          adults,
          children,
          infants,
          pets,
        }),
      })

      if (res.status === 401) {
        setStatus({ kind: 'needsLogin' })
        return
      }

      const data = await res.json().catch(() => ({}))

      if (res.status === 201) {
        setStatus({
          kind: 'success',
          nights,
          total: typeof data.total_price === 'number' ? data.total_price : total,
        })
        return
      }

      // 400 and anything else → surface the server error message.
      setStatus({
        kind: 'error',
        message: data.error || t('errors.generic'),
      })
    } catch {
      setStatus({
        kind: 'error',
        message: t('errors.network'),
      })
    }
  }

  const canReserve =
    nights > 0 && guests >= 1 && status.kind !== 'loading'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: COLORS.burgundy }}>
          {price(pricePerNight)}
        </span>
        <span style={{ fontSize: 15, color: COLORS.muted }}>{t('perNight')}</span>
      </div>
      <p style={{ margin: '6px 0 18px', fontSize: 13, color: COLORS.muted }}>
        {converted
          ? tc('approx', { currency })
          : t('pricesIn', { currency })}
      </p>

      {/* Date range picker (custom, replaces native date inputs) */}
      <DateRangePicker
        checkIn={checkIn}
        checkOut={checkOut}
        checkInLabel={t('checkIn')}
        checkOutLabel={t('checkOut')}
        nightsLabel={(n) => t('nightsCount', { nights: n })}
        onChange={(ci, co) => {
          setCheckIn(ci)
          setCheckOut(co)
          setStatus({ kind: 'idle' })
        }}
      />

      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>{t('guests')}</label>
        <div style={{ border: `1px solid rgba(42,34,32,0.14)`, borderRadius: 12, overflow: 'hidden' }}>
          <GuestRow label={t('guestTypes.adults')} sub={t('guestTypes.adultsSub')} value={adults} min={1} max={maxGuests || 16}
            onChange={(v) => { setAdults(v); setStatus({ kind: 'idle' }) }} />
          <GuestRow label={t('guestTypes.children')} sub={t('guestTypes.childrenSub')} value={children} min={0}
            max={maxGuests ? Math.max(0, maxGuests - adults) : 10}
            onChange={(v) => { setChildren(v); setStatus({ kind: 'idle' }) }} divider />
          <GuestRow label={t('guestTypes.infants')} sub={t('guestTypes.infantsSub')} value={infants} min={0} max={5}
            onChange={(v) => { setInfants(v); setStatus({ kind: 'idle' }) }} divider />
          <GuestRow label={t('guestTypes.pets')} sub={t('guestTypes.petsSub')} value={pets} min={0} max={5}
            onChange={(v) => { setPets(v); setStatus({ kind: 'idle' }) }} divider />
        </div>
        {maxGuests ? (
          <p style={{ margin: '6px 2px 0', fontSize: 12, color: COLORS.muted }}>
            {t('maxGuests', { count: maxGuests })}
          </p>
        ) : null}
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
            {varies || weekendActive
              ? t('nightsCount', { nights })
              : `${price(breakdown?.[0]?.price ?? pricePerNight)} × ${t('nightsCount', { nights })}`}
          </span>
          <span style={{ fontWeight: 700 }}>{price(total)}</span>
        </div>

        {/* The nightly prices behind that number. Shown only when the nights
            differ from each other — that is exactly when a guest would otherwise
            have no way to tell where the total came from, and it is what a host
            pricing a weekend or a holiday wants them to see. */}
        {varies && breakdown && (
          <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 5 }}>
            {breakdown.map((night) => (
              <li
                key={night.date}
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: COLORS.muted }}
              >
                <span>
                  {new Intl.DateTimeFormat(undefined, {
                    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
                  }).format(new Date(`${night.date}T00:00:00Z`))}
                </span>
                <span style={{ fontWeight: night.source === 'custom' ? 700 : 500, color: COLORS.ink }}>
                  {price(night.price)}
                </span>
              </li>
            ))}
          </ul>
        )}
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
          <span>{t('total')}</span>
          <span>{price(total)}</span>
        </div>
        {converted && nights > 0 && (
          // The authoritative number, under the estimate: this is what the
          // booking will actually be for.
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: COLORS.muted, textAlign: 'end' }}>
            {formatPrice(total, currency)} · {tc('chargedIn', { currency })}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={handleReserve}
        disabled={!canReserve}
        style={{
          marginTop: 18,
          width: '100%',
          padding: '14px',
          fontSize: 16,
          fontWeight: 700,
          fontFamily: FONT,
          color: '#fff',
          background: COLORS.burgundy,
          border: 'none',
          borderRadius: 14,
          cursor: canReserve ? 'pointer' : 'not-allowed',
          opacity: canReserve ? 1 : 0.55,
        }}
      >
        {status.kind === 'loading' ? t('reserving') : t('reserve')}
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
          {t('pickDates')}
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
          {t('needsLogin')}{' '}
          <a
            href="/login"
            style={{ color: COLORS.burgundy, fontWeight: 700, textDecoration: 'none' }}
          >
            {t('logIn')}
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

      {status.kind === 'success' && (
        <div
          style={{
            marginTop: 14,
            padding: '14px 16px',
            borderRadius: 12,
            background: '#0f5132',
            color: '#fff',
            fontSize: 14,
          }}
        >
          <strong style={{ display: 'block', marginBottom: 4 }}>
            {t('success.title')} ⏳
          </strong>
          {/* The request that was just created — in the currency it was created
              in, never the converted estimate. */}
          {t('success.summary', {
            nights: status.nights,
            total: formatPrice(status.total, currency),
          })}
          {' '}{t('success.awaitingApproval')}{' '}
          <a
            href="/reservations"
            style={{ color: '#fff', fontWeight: 700, textDecoration: 'underline' }}
          >
            {t('success.viewReservations')}
          </a>
        </div>
      )}
    </div>
  )
}

function GuestRow({
  label, sub, value, min, max, onChange, divider,
}: {
  label: string
  sub: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  divider?: boolean
}) {
  const t = useTranslations('listingPage')
  const round = (enabled: boolean): React.CSSProperties => ({
    width: 30, height: 30, borderRadius: 999, border: `1px solid rgba(42,34,32,0.22)`,
    background: '#fff', color: enabled ? COLORS.burgundy : 'rgba(42,34,32,0.25)',
    fontSize: 18, lineHeight: 1, cursor: enabled ? 'pointer' : 'not-allowed',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  })
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '11px 13px',
        borderTop: divider ? `1px solid rgba(42,34,32,0.10)` : undefined,
      }}
    >
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: COLORS.ink }}>{label}</div>
        <div style={{ fontSize: 12, color: COLORS.muted }}>{sub}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" aria-label={t('decrease', { label })} disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))} style={round(value > min)}>−</button>
        <span style={{ minWidth: 16, textAlign: 'center', fontSize: 15, fontWeight: 600, color: COLORS.ink }}>{value}</span>
        <button type="button" aria-label={t('increase', { label })} disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))} style={round(value < max)}>+</button>
      </div>
    </div>
  )
}
