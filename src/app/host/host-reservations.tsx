'use client'

// Incoming reservations for the host: fetches GET /api/local/host/bookings and
// renders each request with Approve / Decline buttons that PATCH
// /api/local/bookings/[id] { status: 'confirm' | 'reject' } and refresh the list.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { ShimmerStyles, SkeletonRow } from '@/components/ui/skeleton-block'
import { StayGuideEditor } from './stay-guide-editor'
import { hostBookingsFrom } from '@/lib/local/host-bookings-core'
import { everPaid, paymentStageFor } from '@/lib/local/payment-flow-core'
import {
  HOST_BOOKING_FILTER_ORDER,
  hostBookingBucketFor,
  hostBookingFilterCounts,
  hostBookingFilterMatches,
  type HostBookingBucket,
  type HostBookingFilter,
} from '@/lib/local/host-booking-filter-core'

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
  /** The guest's full name. Host-only, and null when their account is gone. */
  guest_name: string | null
  /** The listing's name. `listing_title` was the pre-merge alias and is no longer
   *  sent; it stays in the union so a row from either shape still renders. */
  title?: string
  listing_title?: string | null
  /** Issued at approval — null while the request is still pending. Not the pass:
   *  see `isLiveStayPass`, which also requires the payment. */
  reservation_code: string | null
  /** Raw bookings.payment_status — the rollup, not the derived paid/unpaid flag. */
  payment_state?: string | null
  /** Stamped when the payment was approved; null while it is outstanding. */
  paid_at?: string | null
  /** Percent of the total refunded on cancel (0–100); null when never cancelled.
   *  Splits the Cancelled chip into Cancelled / Refunded / Partially refunded. */
  refund_percent?: number | null
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

/**
 * Which bucket a reservation sits in. The payment half comes from
 * `paymentStageFor` rather than being re-read off the columns here — that
 * function is the single source of truth for "has the money landed", and a
 * second opinion is how the guest UI once ended up asking for payment twice.
 */
function bucketOf(b: HostBooking): HostBookingBucket {
  return hostBookingBucketFor({
    status: b.status,
    paymentStage: paymentStageFor(b),
    refundPercent: b.refund_percent,
    // A separate question from the stage, which calls everything cancelled
    // `not_payable` and so cannot tell a refund from a booking nobody ever paid for.
    wasPaid: everPaid(b),
  })
}

/** Chip key → the camelCase leaf under `hostPage.reservations.filter`. The
 *  filter keys are snake_case (they mirror the database vocabulary) and the
 *  message catalogue is camelCase, so the mapping is spelled out rather than
 *  built by string surgery. */
const FILTER_KEYS: Record<HostBookingFilter, string> = {
  all: 'all',
  pending: 'pending',
  awaiting_payment: 'awaitingPayment',
  confirmed: 'confirmed',
  rejected: 'rejected',
  cancelled: 'cancelled',
  refunded: 'refunded',
  partially_refunded: 'partiallyRefunded',
}

/** A pill in the status chip row, matching the listings filter on host-tabs.tsx. */
function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        appearance: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 13.5,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: count === undefined ? '8px 16px' : '8px 10px 8px 16px',
        borderRadius: 999,
        border: `1px solid ${active ? C.burgundy : 'rgba(42,34,32,0.16)'}`,
        color: active ? '#fff' : C.ink,
        background: active ? C.burgundy : '#fff',
        transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {count === undefined ? null : (
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            lineHeight: 1,
            padding: '3px 7px',
            borderRadius: 999,
            minWidth: 20,
            textAlign: 'center',
            color: active ? '#fff' : C.muted,
            background: active ? 'rgba(255,255,255,0.22)' : C.tan,
          }}
        >
          {count}
        </span>
      )}
    </button>
  )
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


export function HostReservations() {
  const t = useTranslations('hostPage.reservations')
  const tGuide = useTranslations('stayPass.host')
  const locale = useLocale()
  const [bookings, setBookings] = useState<HostBooking[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; msg: string } | null>(null)
  // The status chip row. Client-side over the already-loaded rows, so switching
  // is instant — /api/local/host/bookings takes no query params and returns
  // every reservation, the same way the listings filter works.
  const [filter, setFilter] = useState<HostBookingFilter>('all')
  // Counted over every reservation, not the visible slice — a chip has to say
  // what it would show, which is the opposite of what is on screen right now.
  const counts = useMemo(
    () => hostBookingFilterCounts((bookings ?? []).map(bucketOf)),
    [bookings]
  )
  // Per-booking transfer-screenshot viewer (fetched on demand, then toggled).

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
      // The backend answers this route with a bare array (the same body iOS and
      // Android decode). Reading `data.bookings` here is what hid every request.
      const data = await res.json()
      setBookings(hostBookingsFrom<HostBooking>(data))
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

  // Accept/Decline the RESERVATION. Hosts no longer decide payments — a transfer is
  // confirmed by QuickIn in /ops. The old code routed a host's Decline into
  // reviewPayment, which cancelled the whole booking over an unreadable screenshot;
  // now a rejected payment just asks the guest for a better photo.
  function approve(b: HostBooking) {
    return decide(b.id, 'confirm')
  }
  function decline(b: HostBooking) {
    return decide(b.id, 'reject')
  }

  // A host's whole reservation list. SkeletonRow is already the thumbnail + two
  // lines + trailing action shape these rows use, so this is the existing kit
  // rather than a new placeholder.
  if (bookings === null) {
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <ShimmerStyles />
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    )
  }

  if (error && bookings.length === 0) {
    return (
      <div style={{ ...card, textAlign: 'center', color: C.muted }}>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: '#b3261e' }}>{error}</p>
        <button onClick={load} style={ghostBtn}>{t('tryAgain')}</button>
      </div>
    )
  }

  // The "you have no reservations at all" state, which is a different thing from
  // "nothing in this status" below — it gets no chip row, because there is
  // nothing to filter and eight empty chips would only be noise.
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

  const visible = bookings.filter((b) => hostBookingFilterMatches(filter, bucketOf(b)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        role="group"
        aria-label={t('filter.label')}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}
      >
        {HOST_BOOKING_FILTER_ORDER.map((key) => (
          <FilterPill
            key={key}
            label={t(`filter.${FILTER_KEYS[key]}`)}
            // "All" stays bare: its count is just the number of cards below it,
            // and iOS leaves it bare for the same reason.
            count={key === 'all' ? undefined : counts[key]}
            active={filter === key}
            onClick={() => setFilter(key)}
          />
        ))}
      </div>

      {visible.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: C.muted, padding: '36px 24px' }} role="status">
          <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: C.ink }}>
            {t('filter.emptyTitle')}
          </p>
          <p style={{ margin: 0, fontSize: 14 }}>{t('filter.emptySubtitle')}</p>
          {/* The only action that can change this result — a host cannot conjure
              a reservation into a status, so "show all" is the way out. */}
          <button type="button" onClick={() => setFilter('all')} style={{ ...ghostBtn, marginTop: 14 }}>
            {t('filter.showAll')}
          </button>
        </div>
      ) : null}

      {visible.map((b) => {
        const chipColors = statusChipColors(b.status)
        const paid = b.payment_status === 'paid'
        const payChip = paymentChip(b, t)
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

            {/* The transfer screenshot is no longer shown to hosts. The money goes to
                QuickIn's Instapay account, not theirs, and confirming a transfer is now
                an admin decision — so a host has no use for the guest's bank
                screenshot. The payment chip above still says where it stands. */}

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

            {/* The stay guide only exists on an approved reservation — while it's
                pending we say so instead of offering an editor whose writes the
                API would reject. The guest's QR is gated more tightly still,
                inside the editor: it waits for the payment (isLiveStayPass). */}
            {b.status === 'pending' && (
              <p style={{ margin: '12px 0 0', fontSize: 13, color: C.muted }}>{tGuide('locked')}</p>
            )}
            {b.status === 'confirmed' && (
              <StayGuideEditor
                bookingId={b.id}
                reservationCode={b.reservation_code}
                status={b.status}
                // `payment_status` is the raw rollup the backend sends today;
                // `payment_state` was the older web API's name for it.
                paymentState={b.payment_state ?? b.payment_status}
                proofStatus={b.payment_proof_status}
                paidAt={b.paid_at}
              />
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
