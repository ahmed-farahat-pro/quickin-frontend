'use client'

// Incoming reservations for the host: fetches GET /api/local/host/bookings and
// renders each request with Approve / Decline buttons that PATCH
// /api/local/bookings/[id] { status: 'confirm' | 'reject' } and refresh the list.
import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { StayGuideEditor } from './stay-guide-editor'

const C = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

interface HostBooking {
  id: string
  check_in: string
  check_out: string
  guests: number
  total_price: number
  status: string
  payment_status: 'paid' | 'unpaid'
  /** Latest payment_proofs row status: submitted | approved | rejected | disputed (null = no proof). */
  payment_proof_status?: string | null
  /** Reason the host/admin gave when the latest transfer screenshot was declined. */
  payment_reject_reason?: string | null
  payment_method?: string | null
  created_at: string
  guest_name: string | null
  listing_title: string | null
  title?: string
  /** Issued at approval — null while the request is still pending. */
  reservation_code: string | null
}

// BCP47 mapping mirrors the app's i18n config so dates render in the active locale.
const DATE_LOCALE: Record<string, string> = {
  ar: 'ar-EG',
  fr: 'fr-FR',
  es: 'es-ES',
  en: 'en-US',
}

function statusChipColors(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'pending':   return { bg: '#fff7e6', fg: '#9a6b00' }
    case 'confirmed': return { bg: '#e7f5ec', fg: '#177245' }
    case 'cancelled': return { bg: '#f1efec', fg: C.muted }
    case 'rejected':  return { bg: '#fdecea', fg: '#b3261e' }
    default:          return { bg: '#f1efec', fg: C.muted }
  }
}

// Small chip describing the Instapay payment state, derived from the latest proof
// status. Returns null when there's nothing payment-related to show.
function paymentChip(
  b: HostBooking,
  t: (k: string) => string
): { bg: string; fg: string; label: string } | null {
  const s = b.payment_proof_status
  if (b.payment_status === 'paid' || s === 'approved') {
    return { bg: '#e7f5ec', fg: '#177245', label: t('payment.paid') }
  }
  if (s === 'disputed') return { bg: '#fdf0e6', fg: '#9a4b00', label: t('payment.disputeOpen') }
  if (s === 'rejected') return { bg: '#fdecea', fg: '#b3261e', label: t('payment.declined') }
  if (s === 'submitted') return { bg: '#fff7e6', fg: '#9a6b00', label: t('payment.awaitingReview') }
  return null
}

function fmtDate(d: string, locale: string): string {
  const date = new Date(d + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return d
  return date.toLocaleDateString(DATE_LOCALE[locale] || 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 20,
  border: '1px solid rgba(42,34,32,0.06)',
  boxShadow: '0 6px 24px rgba(42,34,32,0.07)',
  padding: '18px 20px',
}

// A booking is on the Instapay manual-payment track once the guest has uploaded a
// transfer screenshot. Those are the ones the host accepts/rejects via the review
// endpoint (which confirms AND marks paid); everything else uses the legacy
// confirm/reject PATCH path.
function hasProof(b: HostBooking): boolean {
  return !!b.payment_proof_status || b.payment_method === 'instapay'
}

interface ProofState {
  loading: boolean
  image: string | null
  error: string | null
}

export function HostReservations() {
  const t = useTranslations('hostPage.reservations')
  const tGuide = useTranslations('stayPass.host')
  const locale = useLocale()
  const [bookings, setBookings] = useState<HostBooking[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; msg: string } | null>(null)
  // Per-booking transfer-screenshot viewer (fetched on demand, then toggled).
  const [proofs, setProofs] = useState<Record<string, ProofState>>({})

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/local/host/bookings', { credentials: 'same-origin' })
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || t('loadError'))
      }
      const data = await res.json()
      setBookings(Array.isArray(data.bookings) ? data.bookings : [])
    } catch (e) {
      setBookings([])
      setError(e instanceof Error ? e.message : t('loadError'))
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  // Legacy confirm/reject for bookings WITHOUT a transfer screenshot.
  async function decide(id: string, status: 'confirm' | 'reject') {
    setBusyId(id)
    setRowError(null)
    try {
      const res = await fetch(`/api/local/bookings/${id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || t('updateError'))
      }
      await load()
    } catch (e) {
      setRowError({ id, msg: e instanceof Error ? e.message : t('updateError') })
    } finally {
      setBusyId(null)
    }
  }

  // Instapay review for bookings WITH a transfer screenshot. Accept confirms AND
  // marks the booking paid in one step; reject records a reason.
  async function reviewPayment(id: string, action: 'accept' | 'reject') {
    let reason: string | undefined
    if (action === 'reject') {
      // A styled prompt is heavier than this feature needs — a window.prompt keeps
      // the decline reason optional and the change contained.
      const entered = window.prompt(t('payment.declinePrompt')) ?? ''
      reason = entered.trim() || undefined
    }
    setBusyId(id)
    setRowError(null)
    try {
      const res = await fetch(`/api/local/host/bookings/${id}/review`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { action, reason } : { action }),
      })
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || t('updateError'))
      }
      await load()
    } catch (e) {
      setRowError({ id, msg: e instanceof Error ? e.message : t('updateError') })
    } finally {
      setBusyId(null)
    }
  }

  // Approve/Decline entry points that pick the right path for each booking.
  function approve(b: HostBooking) {
    if (hasProof(b)) return reviewPayment(b.id, 'accept')
    return decide(b.id, 'confirm')
  }
  function decline(b: HostBooking) {
    if (hasProof(b)) return reviewPayment(b.id, 'reject')
    return decide(b.id, 'reject')
  }

  // Fetch (once) then show/hide the base64 transfer screenshot for a booking.
  async function toggleProof(id: string) {
    const existing = proofs[id]
    if (existing && existing.image) {
      setProofs((p) => {
        const next = { ...p }
        delete next[id]
        return next
      })
      return
    }
    setProofs((p) => ({ ...p, [id]: { loading: true, image: null, error: null } }))
    try {
      const res = await fetch(`/api/local/bookings/${id}/payment-proof`, { credentials: 'same-origin' })
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || t('payment.proofError'))
      }
      const data = await res.json()
      setProofs((p) => ({ ...p, [id]: { loading: false, image: data.image_data ?? null, error: null } }))
    } catch (e) {
      setProofs((p) => ({
        ...p,
        [id]: { loading: false, image: null, error: e instanceof Error ? e.message : t('payment.proofError') },
      }))
    }
  }

  if (bookings === null) {
    return <p style={{ fontSize: 14, color: C.muted }}>{t('loading')}</p>
  }

  if (error && bookings.length === 0) {
    return (
      <div style={{ ...card, textAlign: 'center', color: C.muted }}>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: '#b3261e' }}>{error}</p>
        <button onClick={load} style={ghostBtn}>{t('tryAgain')}</button>
      </div>
    )
  }

  if (bookings.length === 0) {
    return (
      <div style={{ ...card, textAlign: 'center', color: C.muted, padding: '40px 24px' }}>
        <p style={{ margin: 0, fontSize: 15 }}>{t('emptyTitle')}</p>
        <p style={{ margin: '6px 0 0', fontSize: 13.5 }}>
          {t('emptySubtitle')}
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {bookings.map((b) => {
        const chipColors = statusChipColors(b.status)
        const paid = b.payment_status === 'paid'
        const payChip = paymentChip(b, t)
        const proof = proofs[b.id]
        const showProofControl = hasProof(b)
        const chipLabel =
          b.status === 'confirmed'
            ? paid
              ? t('status.approvedPaid')
              : t('status.approved')
            : b.status === 'pending'
              ? t('status.pending')
              : b.status === 'cancelled'
                ? t('status.cancelled')
                : b.status === 'rejected'
                  ? t('status.rejected')
                  : b.status || '—'
        return (
          <article key={b.id} style={card}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 700, color: C.ink }}>
                  {b.listing_title || b.title || t('listingFallback')}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 14, color: C.muted }}>
                  {b.guest_name || t('guestFallback')} · {t('guestsCount', { count: b.guests })}
                </p>
                <p style={{ margin: '8px 0 0', fontSize: 14, color: C.ink }}>
                  {fmtDate(b.check_in, locale)} → {fmtDate(b.check_out, locale)}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span
                  style={{
                    display: 'inline-block',
                    background: chipColors.bg,
                    color: chipColors.fg,
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 999,
                  }}
                >
                  {chipLabel}
                </span>
                {payChip && (
                  <div style={{ marginTop: 6 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        background: payChip.bg,
                        color: payChip.fg,
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: 999,
                      }}
                    >
                      {payChip.label}
                    </span>
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 18, fontWeight: 800, color: C.burgundy }}>
                  {b.total_price}
                </div>
                <div style={{ fontSize: 12.5, color: C.muted }}>{t('total')}</div>
              </div>
            </div>

            {/* Transfer screenshot: view control + inline expandable image (Instapay track). */}
            {showProofControl && (
              <div style={{ marginTop: 14 }}>
                <button
                  onClick={() => toggleProof(b.id)}
                  disabled={proof?.loading}
                  style={{ ...ghostBtn, fontSize: 13, padding: '7px 16px' }}
                >
                  {proof?.loading
                    ? t('payment.loadingProof')
                    : proof?.image
                      ? t('payment.hideScreenshot')
                      : t('payment.viewScreenshot')}
                </button>
                {proof?.error && (
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: '#b3261e' }}>{proof.error}</p>
                )}
                {proof?.image && (
                  <div style={{ marginTop: 10 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={proof.image}
                      alt={t('payment.viewScreenshot')}
                      style={{
                        maxWidth: '100%',
                        maxHeight: 420,
                        borderRadius: 14,
                        border: '1px solid rgba(42,34,32,0.1)',
                        display: 'block',
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Reason the host/admin gave when declining the transfer. */}
            {b.payment_proof_status === 'rejected' && b.payment_reject_reason && (
              <p style={{ margin: '10px 0 0', fontSize: 13, color: C.muted }}>
                “{b.payment_reject_reason}”
              </p>
            )}

            {b.status === 'pending' && (
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button
                  onClick={() => approve(b)}
                  disabled={busyId === b.id}
                  style={{
                    background: C.burgundy,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 999,
                    padding: '9px 22px',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: busyId === b.id ? 'default' : 'pointer',
                    opacity: busyId === b.id ? 0.7 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {busyId === b.id ? t('working') : t('approve')}
                </button>
                <button
                  onClick={() => decline(b)}
                  disabled={busyId === b.id}
                  style={{
                    background: '#fff',
                    color: '#b3261e',
                    border: '1px solid rgba(179,38,30,0.4)',
                    borderRadius: 999,
                    padding: '9px 22px',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: busyId === b.id ? 'default' : 'pointer',
                    opacity: busyId === b.id ? 0.7 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {t('decline')}
                </button>
              </div>
            )}

            {/* The stay guide (and the guest's QR with it) only exists on an
                approved reservation — while it's pending we say so instead of
                offering an editor whose writes the API would reject. */}
            {b.status === 'pending' && (
              <p style={{ margin: '12px 0 0', fontSize: 13, color: C.muted }}>{tGuide('locked')}</p>
            )}
            {b.status === 'confirmed' && (
              <StayGuideEditor bookingId={b.id} reservationCode={b.reservation_code} />
            )}

            {rowError?.id === b.id && (
              <p style={{ margin: '10px 0 0', fontSize: 13, color: '#b3261e' }}>{rowError.msg}</p>
            )}
          </article>
        )
      })}
    </div>
  )
}

const ghostBtn: React.CSSProperties = {
  background: '#fff',
  color: C.burgundy,
  border: `1px solid ${C.tan}`,
  borderRadius: 999,
  padding: '8px 18px',
  fontWeight: 700,
  fontSize: 13.5,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
