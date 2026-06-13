'use client'

import { useState } from 'react'
import { API_URL } from '@/lib/api'
import DatePickerField from '../../_components/date-picker-field'

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
  | { kind: 'success'; nights: number; total: number; reservationId: string | null }

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
        setStatus({
          kind: 'success',
          nights:
            data.total_price && pricePerNight
              ? Math.round(data.total_price / pricePerNight)
              : nights,
          total: typeof data.total_price === 'number' ? data.total_price : total,
          reservationId: typeof data.id === 'string' ? data.id : null,
        })
        return
      }

      // 400 and anything else → surface the server error message.
      setStatus({
        kind: 'error',
        message: data.error || 'Something went wrong. Please try again.',
      })
    } catch {
      setStatus({
        kind: 'error',
        message: 'Network error. Please try again.',
      })
    }
  }

  const canReserve = nights > 0 && guests >= 1 && status.kind !== 'loading'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: COLORS.burgundy }}>
          EGP {pricePerNight}
        </span>
        <span style={{ fontSize: 15, color: COLORS.muted }}>/ night</span>
      </div>
      <p style={{ margin: '6px 0 18px', fontSize: 13, color: COLORS.muted }}>
        Prices in EGP
      </p>

      {/* Date pickers — a custom themed calendar popover (replaces the native
          date inputs). Wrap to one column when the card is too narrow. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 12 }}>
        <DatePickerField
          label="Check-in"
          value={checkIn}
          ariaLabel="Check-in date"
          compact
          onChange={(iso) => {
            setCheckIn(iso)
            // Keep checkout valid: clear it if it now precedes check-in.
            if (iso && checkOut && checkOut < iso) setCheckOut('')
            setStatus({ kind: 'idle' })
          }}
        />
        <DatePickerField
          label="Check-out"
          value={checkOut}
          ariaLabel="Check-out date"
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
          Guests
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
            EGP {pricePerNight} × {nights} {nights === 1 ? 'night' : 'nights'}
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
          <span>Total</span>
          <span>EGP {total}</span>
        </div>
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
        {status.kind === 'loading' ? 'Reserving…' : 'Reserve'}
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
          Pick your dates to see the total.
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
          Please sign in to reserve.{' '}
          <a
            href="/login"
            style={{ color: COLORS.burgundy, fontWeight: 700, textDecoration: 'none' }}
          >
            Log in
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
            role="dialog"
            aria-modal="true"
            aria-label="Reservation request sent"
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
                aria-label="Close"
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

              {/* Burgundy "sent" badge */}
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  background: COLORS.burgundy,
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
                Request sent
              </h2>
              <p style={{ margin: '0 0 18px', fontSize: 15, color: COLORS.muted, lineHeight: 1.45 }}>
                Waiting for the host to confirm your {status.nights}{' '}
                {status.nights === 1 ? 'night' : 'nights'} stay.
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
                    {status.nights} {status.nights === 1 ? 'night' : 'nights'}
                  </span>
                  <span>EGP {pricePerNight} / night</span>
                </div>
                <div style={{ height: 1, background: 'rgba(42,34,32,0.10)', margin: '10px 0' }} />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <span style={{ fontSize: 14, color: COLORS.muted }}>Total</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: COLORS.burgundy }}>
                    EGP {status.total}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {status.reservationId ? (
                  <a
                    href={`/reservation/${status.reservationId}`}
                    style={{
                      display: 'block',
                      padding: '13px',
                      borderRadius: 14,
                      background: COLORS.burgundy,
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 15,
                      textDecoration: 'none',
                    }}
                  >
                    View reservation
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStatus({ kind: 'idle' })}
                    style={{
                      padding: '13px',
                      borderRadius: 14,
                      background: COLORS.burgundy,
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 15,
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: FONT,
                    }}
                  >
                    Done
                  </button>
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
                  All reservations
                </a>
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
