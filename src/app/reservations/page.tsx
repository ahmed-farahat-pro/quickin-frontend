'use client'

// My reservations (UI-only) — the signed-in user's bookings, fetched from the
// backend with the bearer token stored in localStorage. No cookies / no DB here.
import { useCallback, useEffect, useState } from 'react'
import { API_URL, type Booking, type ReviewableStay } from '@/lib/api'
import ImagePlaceholder from '../_components/image-placeholder'
import ReviewForm from '../_components/review-form'
import { useLanguage } from '@/lib/i18n/language-provider'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  page: '#E4DECF',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const GRAD_BURGUNDY = 'linear-gradient(135deg,#5B0F16,#8a2530)'

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
// `labelKey` is an i18n key so the badge localizes (the cancelled state is the
// one this feature adds; pending/confirmed/rejected keep their English text via
// their literal label fallback).
function statusStyle(status: string): {
  bg: string
  fg: string
  label: string
  labelKey?: string
} {
  const s = (status || '').toLowerCase()
  if (s === 'confirmed')
    return { bg: 'rgba(15,81,50,0.12)', fg: '#0f5132', label: 'Confirmed' }
  if (s === 'rejected')
    return { bg: 'rgba(91,15,22,0.10)', fg: COLORS.burgundy, label: 'Rejected' }
  if (s === 'cancelled')
    return {
      bg: 'rgba(42,34,32,0.10)',
      fg: COLORS.muted,
      label: 'Cancelled',
      labelKey: 'cancel.cancelled',
    }
  return { bg: 'rgba(176,122,0,0.14)', fg: '#8a5a00', label: 'Pending' }
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage()
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
      {s.labelKey ? t(s.labelKey) : s.label}
    </span>
  )
}

function Header() {
  return (
    <header
      style={{
        background: `linear-gradient(180deg, ${COLORS.tan} 0%, ${COLORS.page} 100%)`,
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
  // Booking ids the user can review (confirmed + past checkout, not yet
  // reviewed). Fetched alongside the bookings; drives the "Leave a review" card.
  const [reviewableIds, setReviewableIds] = useState<Set<string>>(new Set())

  // Drop a stay from the reviewable set once its review is submitted.
  const markReviewed = useCallback((bookingId: string) => {
    setReviewableIds((prev) => {
      if (!prev.has(bookingId)) return prev
      const next = new Set(prev)
      next.delete(bookingId)
      return next
    })
  }, [])

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

    // Reviewable stays (best-effort, non-fatal). A failure just hides the
    // review controls.
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/local/reviews`, {
          headers: { Authorization: 'Bearer ' + token },
        })
        if (!res.ok) return
        const data = (await res.json()) as ReviewableStay[]
        if (!cancelled && Array.isArray(data)) {
          setReviewableIds(new Set(data.map((s) => s.booking_id)))
        }
      } catch {
        /* ignore */
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
        background: COLORS.page,
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
              className="qk-press"
              style={{
                display: 'inline-block',
                color: '#fff',
                background: GRAD_BURGUNDY,
                textDecoration: 'none',
                fontWeight: 700,
                padding: '12px 26px',
                borderRadius: 999,
                boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
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
              className="qk-press"
              style={{
                display: 'inline-block',
                marginTop: 18,
                color: '#fff',
                background: GRAD_BURGUNDY,
                textDecoration: 'none',
                fontWeight: 700,
                padding: '11px 24px',
                borderRadius: 999,
                boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
              }}
            >
              Try again
            </a>
          </div>
        )}

        {state.kind === 'ready' && (
          <ReservationsList
            bookings={state.bookings}
            firstName={state.firstName}
            reviewableIds={reviewableIds}
            onReviewed={markReviewed}
          />
        )}
      </section>
    </main>
  )
}

function ReservationsList({
  bookings,
  firstName,
  reviewableIds,
  onReviewed,
}: {
  bookings: Booking[]
  firstName: string
  reviewableIds: Set<string>
  onReviewed: (bookingId: string) => void
}) {
  return (
    <>
      <div style={{ position: 'relative' }}>
        {/* Travel motif: a plane climbs in along a dashed gold contrail that
            draws left→right — the same "boarding pass" flourish as the iOS app. */}
        <div
          aria-hidden="true"
          style={{ position: 'absolute', top: -24, left: 0, right: 0, height: 54, pointerEvents: 'none' }}
        >
          <svg
            width="100%"
            height="54"
            viewBox="0 0 1000 54"
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0 }}
          >
            <path
              className="qk-contrail"
              d="M40 46 Q 520 2 940 18"
              fill="none"
              stroke="#b07a2a"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="2 10"
            />
          </svg>
          <span
            className="qk-fly"
            style={{
              position: 'absolute',
              left: 'min(94%, 940px)',
              top: 2,
              color: '#b07a2a',
              filter: 'drop-shadow(0 3px 8px rgba(176,122,42,0.45))',
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(43deg)' }}>
              <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
            </svg>
          </span>
        </div>

        <h1
          className="qk-reveal"
          style={{
            margin: '0 0 6px',
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(26px, 4vw, 34px)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: COLORS.burgundy,
            animationDelay: '0.35s',
          }}
        >
          {firstName}&apos;s reservations
        </h1>
        <p
          className="qk-reveal"
          style={{ margin: '0 0 28px', fontSize: 15, color: COLORS.muted, animationDelay: '0.45s' }}
        >
          {bookings.length === 0
            ? 'No reservations yet.'
            : `${bookings.length} ${bookings.length === 1 ? 'stay' : 'stays'} booked.`}
        </p>
      </div>

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
            className="qk-press"
            style={{
              display: 'inline-block',
              color: '#fff',
              background: GRAD_BURGUNDY,
              textDecoration: 'none',
              fontWeight: 700,
              padding: '11px 24px',
              borderRadius: 999,
              boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
            }}
          >
            Browse stays
          </a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {bookings.map((b) => (
            <ReservationItem
              key={b.id}
              booking={b}
              reviewable={reviewableIds.has(b.id)}
              onReviewed={() => onReviewed(b.id)}
            />
          ))}
        </div>
      )}
    </>
  )
}

// One reservation row: the clickable card plus, when the stay is reviewable, an
// inline "Leave a review" panel beneath it (kept OUTSIDE the card's <a> so its
// star buttons + textarea aren't swallowed by the link navigation).
function ReservationItem({
  booking: b,
  reviewable,
  onReviewed,
}: {
  booking: Booking
  reviewable: boolean
  onReviewed: () => void
}) {
  const { t } = useLanguage()
  return (
    <div>
      <a
        href={`/reservation/${b.id}`}
        className="qk-res-card qk-card"
        style={{
          display: 'grid',
          gridTemplateColumns: '160px 1fr auto',
          gap: 20,
          background: '#fff',
          borderRadius: 20,
          border: `1px solid rgba(42,34,32,0.06)`,
          boxShadow: '0 8px 22px rgba(42,34,32,0.10)',
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
            position: 'relative',
            width: 160,
            minHeight: 130,
            overflow: 'hidden',
            background: COLORS.tan,
          }}
        >
          {b.image ? (
            <img
              src={b.image}
              alt={b.title}
              className="qk-img-zoom"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          ) : (
            <ImagePlaceholder iconSize={26} fontSize={11} />
          )}
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
            EGP {b.total_price}
          </div>
          <div style={{ fontSize: 13, color: COLORS.muted }}>total</div>
        </div>
      </a>

      {/* Inline review panel for a completed stay. */}
      {reviewable && (
        <div
          style={{
            marginTop: 10,
            background: '#fff',
            borderRadius: 16,
            border: '1px solid rgba(42,34,32,0.06)',
            boxShadow: '0 6px 18px rgba(42,34,32,0.07)',
            padding: '16px 18px',
          }}
        >
          <p
            style={{
              margin: '0 0 10px',
              fontSize: 14,
              fontWeight: 700,
              color: COLORS.burgundy,
            }}
          >
            {t('reviews.leaveReview')}
          </p>
          <ReviewForm bookingId={b.id} onSubmitted={onReviewed} compact />
        </div>
      )}
    </div>
  )
}
