'use client'

// My subscriptions (UI-only) — the signed-in user's service requests, fetched
// from the backend with the bearer token in localStorage. Modeled on the
// /reservations list. No cookies / no DB here.
import { useEffect, useState } from 'react'
import { API_URL, type ServiceRequest } from '@/lib/api'
import ImagePlaceholder from '../_components/image-placeholder'

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

function fmtDate(d: string | null): string | null {
  if (!d) return null
  const date = new Date(d + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return d
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Subscription status → badge colors. Pending uses the tan/burgundy boutique
// look; confirmed is green; rejected is muted (shared look with /reservations).
function statusStyle(status: string): { bg: string; fg: string; label: string } {
  const s = (status || '').toLowerCase()
  if (s === 'confirmed')
    return { bg: 'rgba(15,81,50,0.12)', fg: '#0f5132', label: 'Confirmed' }
  if (s === 'rejected')
    return { bg: 'rgba(42,34,32,0.08)', fg: COLORS.muted, label: 'Rejected' }
  return { bg: COLORS.tan, fg: COLORS.burgundy, label: 'Pending' }
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
          href="/services"
          style={{
            color: COLORS.burgundy,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ← Back to Services
        </a>
      </div>
    </header>
  )
}

type State =
  | { kind: 'loading' }
  | { kind: 'anon' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; requests: ServiceRequest[]; firstName: string }

export default function SubscriptionsPage() {
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
        const res = await fetch(`${API_URL}/api/local/service-requests`, {
          headers: { Authorization: 'Bearer ' + token },
        })
        if (res.status === 401) {
          if (!cancelled) setState({ kind: 'anon' })
          return
        }
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        const data = await res.json()
        const requests: ServiceRequest[] = Array.isArray(data) ? data : []
        if (!cancelled) setState({ kind: 'ready', requests, firstName })
      } catch {
        if (!cancelled)
          setState({
            kind: 'error',
            message: 'We couldn’t load your subscriptions. Please try again.',
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
      {/* On phones each subscription card stacks: full-width image on top, then
          details and status below. Inline styles can't carry media queries. */}
      <style>{`
        @media (max-width: 560px) {
          .qk-sub-card {
            grid-template-columns: 1fr !important;
          }
          .qk-sub-card .qk-sub-img {
            width: 100% !important;
            height: 180px !important;
            min-height: 0 !important;
          }
          .qk-sub-card .qk-sub-body {
            padding: 16px 18px 18px !important;
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
            Loading your subscriptions…
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
              Sign in to see your subscriptions
            </h1>
            <p style={{ margin: '12px 0 22px', fontSize: 15 }}>
              The experiences you subscribe to will appear here once you log in.
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
              href="/subscriptions"
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
          <SubscriptionsList
            requests={state.requests}
            firstName={state.firstName}
          />
        )}
      </section>
    </main>
  )
}

function SubscriptionsList({
  requests,
  firstName,
}: {
  requests: ServiceRequest[]
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
        {firstName}&apos;s subscriptions
      </h1>
      <p style={{ margin: '0 0 28px', fontSize: 15, color: COLORS.muted }}>
        {requests.length === 0
          ? 'No subscriptions yet.'
          : `${requests.length} ${
              requests.length === 1 ? 'experience' : 'experiences'
            } requested.`}
      </p>

      {requests.length === 0 ? (
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
            You haven&apos;t subscribed to any experiences yet.
          </p>
          <a
            href="/services"
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
            Browse services
          </a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {requests.map((r) => {
            const prefDate = fmtDate(r.preferred_date)
            return (
              <a
                key={r.id}
                href={`/services/${r.service_id}`}
                className="qk-sub-card"
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
                  className="qk-sub-img"
                  style={{
                    position: 'relative',
                    width: 160,
                    minHeight: 130,
                    background: COLORS.tan,
                  }}
                >
                  {r.service_image ? (
                    <img
                      src={r.service_image}
                      alt={r.service_title}
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

                <div className="qk-sub-body" style={{ padding: '18px 0', minWidth: 0 }}>
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
                      {r.service_title}
                    </h2>
                    <StatusBadge status={r.status} />
                  </div>
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: 14,
                      color: COLORS.muted,
                    }}
                  >
                    {[
                      r.host_name ? `Hosted by ${r.host_name}` : null,
                      r.service_location,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'QuickIn host'}
                  </p>
                  {prefDate && (
                    <p
                      style={{
                        margin: '12px 0 0',
                        fontSize: 14,
                        color: COLORS.ink,
                      }}
                    >
                      Preferred date: {prefDate}
                    </p>
                  )}
                  {r.request_code && (
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: 12,
                        color: COLORS.muted,
                      }}
                    >
                      Code{' '}
                      <span
                        style={{
                          fontFamily:
                            '"Geist Mono", ui-monospace, SFMono-Regular, monospace',
                          fontWeight: 600,
                          color: COLORS.ink,
                        }}
                      >
                        {r.request_code}
                      </span>
                    </p>
                  )}
                </div>

                <div
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
                    EGP {r.service_price}
                  </div>
                  <div style={{ fontSize: 13, color: COLORS.muted }}>price</div>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </>
  )
}
