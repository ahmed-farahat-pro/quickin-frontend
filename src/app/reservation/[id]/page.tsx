'use client'

// Single reservation (UI-only) — fetched from the backend with the bearer token
// in qk_token (owner or host may view). Shows the stay, status, and a QR code
// that encodes the reservation_code, rendered to a data URL fully client-side
// (no external QR service). "Add to Apple Wallet" is intentionally disabled —
// the backend wallet endpoint is a later step.
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import QRCode from 'qrcode'
import { API_URL, getToken, type Reservation } from '@/lib/api'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

function fmtDate(d: string): string {
  const date = new Date(d + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return d
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function statusStyle(status: string): { bg: string; fg: string; label: string } {
  const s = (status || '').toLowerCase()
  if (s === 'confirmed')
    return { bg: 'rgba(15,81,50,0.12)', fg: '#0f5132', label: 'Confirmed' }
  if (s === 'rejected')
    return { bg: 'rgba(91,15,22,0.10)', fg: COLORS.burgundy, label: 'Rejected' }
  return { bg: 'rgba(176,122,0,0.14)', fg: '#8a5a00', label: 'Pending' }
}

type State =
  | { kind: 'loading' }
  | { kind: 'anon' }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; reservation: Reservation }

export default function ReservationDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const token = getToken()
    if (!token) {
      setState({ kind: 'anon' })
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/local/bookings/${id}`, {
          headers: { Authorization: 'Bearer ' + token },
        })
        if (res.status === 401) {
          if (!cancelled) setState({ kind: 'anon' })
          return
        }
        if (res.status === 404 || res.status === 403) {
          if (!cancelled) setState({ kind: 'notFound' })
          return
        }
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        const data = (await res.json()) as Reservation
        if (!cancelled) setState({ kind: 'ready', reservation: data })
      } catch {
        if (!cancelled)
          setState({
            kind: 'error',
            message: 'We couldn’t load this reservation. Please try again.',
          })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [id])

  // Render the QR to a data URL whenever we have a reservation code.
  useEffect(() => {
    if (state.kind !== 'ready') return
    const code = state.reservation.reservation_code
    if (!code) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(code, {
      width: 240,
      margin: 1,
      color: { dark: '#2A2220', light: '#FFFFFF' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [state])

  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.cream,
        color: COLORS.ink,
        fontFamily: FONT,
      }}
    >
      <header
        style={{
          background: `linear-gradient(180deg, ${COLORS.tan} 0%, ${COLORS.cream} 100%)`,
          borderBottom: '1px solid rgba(91,15,22,0.10)',
          padding: '20px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <a
            href="/explore"
            style={{ display: 'inline-flex', alignItems: 'center' }}
          >
            <img
              src="/logo.png"
              alt="QuickIn"
              height={40}
              style={{ height: 40, width: 'auto', display: 'block' }}
            />
          </a>
          <a
            href="/reservations"
            style={{
              color: COLORS.burgundy,
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            ← All reservations
          </a>
        </div>
      </header>

      <section
        style={{ maxWidth: 720, margin: '0 auto', padding: '36px 24px 72px' }}
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
            Loading your reservation…
          </p>
        )}

        {state.kind === 'anon' && (
          <CenterNotice
            title="Sign in to view this reservation"
            body="Log in to see your stay details and check-in code."
            ctaHref="/login"
            ctaLabel="Log in"
          />
        )}

        {state.kind === 'notFound' && (
          <CenterNotice
            title="Reservation not found"
            body="This reservation doesn’t exist, or you don’t have access to it."
            ctaHref="/reservations"
            ctaLabel="Back to reservations"
          />
        )}

        {state.kind === 'error' && (
          <CenterNotice
            title="Something went wrong"
            body={state.message}
            ctaHref={`/reservation/${id}`}
            ctaLabel="Try again"
          />
        )}

        {state.kind === 'ready' && (
          <ReservationCard
            reservation={state.reservation}
            qrDataUrl={qrDataUrl}
          />
        )}
      </section>
    </main>
  )
}

function ReservationCard({
  reservation,
  qrDataUrl,
}: {
  reservation: Reservation
  qrDataUrl: string | null
}) {
  const s = statusStyle(reservation.status)
  return (
    <>
      <style>{`
        @media (max-width: 560px) {
          .qk-resv-grid { grid-template-columns: 1fr !important; text-align: center; }
          .qk-resv-qr { margin: 0 auto !important; }
        }
      `}</style>

      <div
        style={{
          background: '#fff',
          borderRadius: 24,
          border: '1px solid rgba(42,34,32,0.06)',
          boxShadow: '0 10px 36px rgba(42,34,32,0.10)',
          overflow: 'hidden',
        }}
      >
        {/* Header band */}
        <div
          style={{
            background: COLORS.burgundy,
            color: COLORS.cream,
            padding: '22px 26px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <h1
              style={{
                margin: 0,
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: 'clamp(22px, 4vw, 28px)',
                fontWeight: 700,
                letterSpacing: '-0.01em',
              }}
            >
              {reservation.title}
            </h1>
            <span
              style={{
                display: 'inline-block',
                background: s.bg,
                color: s.fg,
                fontSize: 13,
                fontWeight: 700,
                padding: '5px 14px',
                borderRadius: 999,
              }}
            >
              {s.label}
            </span>
          </div>
          {reservation.location && (
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 14,
                color: 'rgba(246,241,230,0.82)',
              }}
            >
              {reservation.location}
            </p>
          )}
        </div>

        {/* Body: details + QR */}
        <div
          className="qk-resv-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 28,
            padding: '26px',
            alignItems: 'center',
          }}
        >
          <div>
            <DetailRow label="Check-in" value={fmtDate(reservation.check_in)} />
            <DetailRow label="Check-out" value={fmtDate(reservation.check_out)} />
            <DetailRow
              label="Guests"
              value={`${reservation.guests} ${
                reservation.guests === 1 ? 'guest' : 'guests'
              }`}
            />
            <DetailRow
              label="Total"
              value={`$${reservation.total_price}`}
              emphasis
            />
            {reservation.reservation_code && (
              <DetailRow
                label="Reservation code"
                value={reservation.reservation_code}
                mono
              />
            )}
          </div>

          {/* QR encodes the reservation_code (generated locally). */}
          <div
            className="qk-resv-qr"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div
              style={{
                width: 180,
                height: 180,
                background: '#fff',
                border: '1px solid rgba(42,34,32,0.12)',
                borderRadius: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt={`QR code for reservation ${
                    reservation.reservation_code || ''
                  }`}
                  width={180}
                  height={180}
                  style={{ width: 180, height: 180, display: 'block' }}
                />
              ) : (
                <span
                  style={{
                    fontSize: 12,
                    color: COLORS.muted,
                    padding: 16,
                    textAlign: 'center',
                  }}
                >
                  {reservation.reservation_code
                    ? 'Generating code…'
                    : 'No code yet'}
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, color: COLORS.muted }}>
              Show this at check-in
            </span>
          </div>
        </div>

        {/* Apple Wallet — live once the reservation is confirmed */}
        <div
          style={{
            padding: '0 26px 26px',
            borderTop: '1px solid rgba(42,34,32,0.08)',
            marginTop: 2,
            paddingTop: 20,
          }}
        >
          {reservation.status === 'confirmed' ? (
            <>
              <a
                href={`${API_URL}/api/wallet/pass/${reservation.id}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  padding: '12px 22px',
                  fontSize: 15,
                  fontWeight: 600,
                  fontFamily: FONT,
                  color: '#fff',
                  background: '#000',
                  border: 'none',
                  borderRadius: 14,
                  textDecoration: 'none',
                }}
              >
                <AppleGlyph /> Add to Apple Wallet
              </a>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: COLORS.muted }}>
                On iPhone this opens in Wallet; on Mac it downloads a .pkpass you can add to Wallet.
              </p>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: COLORS.muted }}>
              Add to Apple Wallet becomes available once the host confirms your reservation.
            </p>
          )}
        </div>
      </div>
    </>
  )
}

function DetailRow({
  label,
  value,
  emphasis,
  mono,
}: {
  label: string
  value: string
  emphasis?: boolean
  mono?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 16,
        padding: '10px 0',
        borderBottom: '1px solid rgba(42,34,32,0.07)',
      }}
    >
      <span style={{ fontSize: 14, color: COLORS.muted }}>{label}</span>
      <span
        style={{
          fontSize: emphasis ? 17 : 14,
          fontWeight: emphasis ? 800 : 600,
          color: emphasis ? COLORS.burgundy : COLORS.ink,
          fontFamily: mono
            ? '"Geist Mono", ui-monospace, SFMono-Regular, monospace'
            : FONT,
          textAlign: 'right',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function CenterNotice({
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  title: string
  body: string
  ctaHref: string
  ctaLabel: string
}) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 24px', color: COLORS.muted }}>
      <h1
        style={{
          margin: 0,
          fontFamily: '"Playfair Display", Georgia, serif',
          fontSize: 28,
          fontWeight: 700,
          color: COLORS.burgundy,
        }}
      >
        {title}
      </h1>
      <p style={{ margin: '12px auto 22px', fontSize: 15, maxWidth: 420 }}>{body}</p>
      <a
        href={ctaHref}
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
        {ctaLabel}
      </a>
    </div>
  )
}

function AppleGlyph() {
  return (
    <svg width="16" height="19" viewBox="0 0 17 20" fill="#fff" aria-hidden="true">
      <path d="M14.06 10.62c-.02-2.16 1.76-3.2 1.84-3.25-1-1.47-2.57-1.67-3.12-1.69-1.33-.13-2.59.78-3.26.78-.67 0-1.71-.76-2.81-.74-1.45.02-2.78.84-3.53 2.14-1.5 2.6-.38 6.45 1.08 8.56.71 1.03 1.56 2.19 2.67 2.15 1.07-.04 1.48-.69 2.78-.69 1.3 0 1.66.69 2.79.67 1.15-.02 1.88-1.05 2.59-2.09.81-1.2 1.15-2.36 1.16-2.42-.03-.01-2.23-.86-2.26-3.4zM11.9 4.3c.59-.72.99-1.71.88-2.71-.85.03-1.89.57-2.5 1.28-.55.63-1.03 1.65-.9 2.62.95.07 1.92-.48 2.52-1.19z" />
    </svg>
  )
}
