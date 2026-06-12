'use client'

// My reservations (UI-only) — the signed-in user's bookings, fetched from the
// backend with the bearer token stored in localStorage. No cookies / no DB here.
import { useEffect, useState } from 'react'
import { API_URL, type Booking } from '@/lib/api'

const FALLBACK_IMG =
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

interface StoredUser {
  full_name?: string | null
  name?: string | null
  email?: string | null
}

function firstNameOf(user: StoredUser | null): string {
  if (!user) return 'Your'
  const raw =
    (user.full_name && user.full_name.trim()) ||
    (user.name && user.name.trim()) ||
    (user.email ? user.email.split('@')[0] : '')
  return raw ? raw.split(' ')[0] : 'Your'
}

function fmtDate(d: string): string {
  // d is YYYY-MM-DD
  const date = new Date(d + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return d
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Booking status → badge colors (shared look with /host + /reservation/[id]).
function statusStyle(status: string): { bg: string; fg: string; label: string } {
  const s = (status || '').toLowerCase()
  if (s === 'confirmed')
    return { bg: 'rgba(15,81,50,0.12)', fg: '#0f5132', label: 'Confirmed' }
  if (s === 'rejected')
    return { bg: 'rgba(91,15,22,0.10)', fg: COLORS.burgundy, label: 'Rejected' }
  return { bg: 'rgba(176,122,0,0.14)', fg: '#8a5a00', label: 'Pending' }
}

function StatusBadge({ status }: { status: string }) {
  const s = statusStyle(status)
  return (
    <span
      style={{
        display: 'inline-block',
        background: s.bg,
        color: s.fg,
        fontSize: 12,
        fontWeight: 700,
        padding: '4px 12px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  )
}

function Header() {
  return (
    <header
      style={{
        background: `linear-gradient(180deg, ${COLORS.tan} 0%, ${COLORS.cream} 100%)`,
        borderBottom: `1px solid rgba(91,15,22,0.10)`,
        padding: '20px 24px',
      }}
    >
      <div
        style={{
          maxWidth: 980,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <a href="/explore" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <img
            src="/logo.png"
            alt="QuickIn"
            height={40}
            style={{ height: 40, width: 'auto', display: 'block' }}
          />
        </a>
        <a
          href="/explore"
          style={{
            color: COLORS.burgundy,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ← Back to Explore
        </a>
      </div>
    </header>
  )
}

type State =
  | { kind: 'loading' }
  | { kind: 'anon' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; bookings: Booking[]; firstName: string }

export default function ReservationsPage() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    const token = localStorage.getItem('qk_token')
    if (!token) {
      setState({ kind: 'anon' })
      return
    }

    let firstName = 'Your'
    try {
      const raw = localStorage.getItem('qk_user')
      if (raw) firstName = firstNameOf(JSON.parse(raw) as StoredUser)
    } catch {
      // ignore malformed storage
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/local/bookings`, {
          headers: { Authorization: 'Bearer ' + token },
        })
        if (res.status === 401) {
          if (!cancelled) setState({ kind: 'anon' })
          return
        }
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        const data = await res.json()
        const bookings: Booking[] = Array.isArray(data) ? data : []
        if (!cancelled) setState({ kind: 'ready', bookings, firstName })
      } catch {
        if (!cancelled)
          setState({
            kind: 'error',
            message: 'We couldn’t load your reservations. Please try again.',
          })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.cream,
        color: COLORS.ink,
        fontFamily: FONT,
      }}
    >
      {/* On phones each reservation card stacks: full-width image on top, then
          details and price below. Inline styles can't carry media queries. */}
      <style>{`
        @media (max-width: 560px) {
          .qk-res-card {
            grid-template-columns: 1fr !important;
          }
          .qk-res-card .qk-res-img {
            width: 100% !important;
            height: 180px !important;
            min-height: 0 !important;
          }
          .qk-res-card .qk-res-body {
            padding: 16px 18px 0 !important;
          }
          .qk-res-card .qk-res-price {
            padding: 0 18px 18px !important;
            text-align: left !important;
            align-self: start !important;
          }
        }
      `}</style>

      <Header />

      <section
        style={{
          maxWidth: 980,
          margin: '0 auto',
          padding: '36px 24px 72px',
        }}
      >
        {state.kind === 'loading' && (
          <p
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              color: COLORS.muted,
              fontSize: 15,
            }}
          >
            Loading your reservations…
          </p>
        )}

        {state.kind === 'anon' && (
          <div
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              color: COLORS.muted,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: 30,
                fontWeight: 700,
                color: COLORS.burgundy,
              }}
            >
              Sign in to see your reservations
            </h1>
            <p style={{ margin: '12px 0 22px', fontSize: 15 }}>
              Your upcoming stays will appear here once you log in.
            </p>
            <a
              href="/login"
              style={{
                display: 'inline-block',
                color: '#fff',
                background: COLORS.burgundy,
                textDecoration: 'none',
                fontWeight: 700,
                padding: '12px 26px',
                borderRadius: 999,
              }}
            >
              Log in
            </a>
          </div>
        )}

        {state.kind === 'error' && (
          <div
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              color: COLORS.burgundy,
            }}
          >
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{state.message}</p>
            <a
              href="/reservations"
              style={{
                display: 'inline-block',
                marginTop: 18,
                color: '#fff',
                background: COLORS.burgundy,
                textDecoration: 'none',
                fontWeight: 700,
                padding: '11px 24px',
                borderRadius: 999,
              }}
            >
              Try again
            </a>
          </div>
        )}

        {state.kind === 'ready' && (
          <ReservationsList bookings={state.bookings} firstName={state.firstName} />
        )}
      </section>
    </main>
  )
}

function ReservationsList({
  bookings,
  firstName,
}: {
  bookings: Booking[]
  firstName: string
}) {
  return (
    <>
      <h1
        style={{
          margin: '0 0 6px',
          fontFamily: '"Playfair Display", Georgia, serif',
          fontSize: 'clamp(26px, 4vw, 34px)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: COLORS.burgundy,
        }}
      >
        {firstName}&apos;s reservations
      </h1>
      <p style={{ margin: '0 0 28px', fontSize: 15, color: COLORS.muted }}>
        {bookings.length === 0
          ? 'No reservations yet.'
          : `${bookings.length} ${bookings.length === 1 ? 'stay' : 'stays'} booked.`}
      </p>

      {bookings.length === 0 ? (
        <div
          style={{
            background: '#fff',
            borderRadius: 22,
            border: `1px solid rgba(42,34,32,0.06)`,
            boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
            padding: '48px 24px',
            textAlign: 'center',
            color: COLORS.muted,
          }}
        >
          <p style={{ margin: '0 0 18px', fontSize: 15 }}>
            You haven&apos;t booked any stays yet.
          </p>
          <a
            href="/explore"
            style={{
              display: 'inline-block',
              color: '#fff',
              background: COLORS.burgundy,
              textDecoration: 'none',
              fontWeight: 700,
              padding: '11px 24px',
              borderRadius: 999,
            }}
          >
            Browse stays
          </a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {bookings.map((b) => (
            <a
              key={b.id}
              href={`/reservation/${b.id}`}
              className="qk-res-card"
              style={{
                display: 'grid',
                gridTemplateColumns: '160px 1fr auto',
                gap: 20,
                background: '#fff',
                borderRadius: 20,
                border: `1px solid rgba(42,34,32,0.06)`,
                boxShadow: '0 6px 24px rgba(42,34,32,0.07)',
                overflow: 'hidden',
                alignItems: 'stretch',
                textDecoration: 'none',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <div
                className="qk-res-img"
                style={{
                  width: 160,
                  minHeight: 130,
                  background: COLORS.tan,
                }}
              >
                <img
                  src={b.image || FALLBACK_IMG}
                  alt={b.title}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              </div>

              <div className="qk-res-body" style={{ padding: '18px 0', minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 18,
                      fontWeight: 700,
                      color: COLORS.ink,
                    }}
                  >
                    {b.title}
                  </h2>
                  <StatusBadge status={b.status} />
                </div>
                {b.location && (
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: 14,
                      color: COLORS.muted,
                    }}
                  >
                    {b.location}
                  </p>
                )}
                <p
                  style={{
                    margin: '12px 0 0',
                    fontSize: 14,
                    color: COLORS.ink,
                  }}
                >
                  {fmtDate(b.check_in)} → {fmtDate(b.check_out)}
                </p>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: 14,
                    color: COLORS.muted,
                  }}
                >
                  {b.guests} {b.guests === 1 ? 'guest' : 'guests'}
                </p>
              </div>

              <div
                className="qk-res-price"
                style={{
                  padding: '18px 22px',
                  textAlign: 'right',
                  alignSelf: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: COLORS.burgundy,
                  }}
                >
                  ${b.total_price}
                </div>
                <div style={{ fontSize: 13, color: COLORS.muted }}>total</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  )
}
