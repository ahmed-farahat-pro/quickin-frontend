'use client'

// "Deactivate" / "Reactivate" on a host listing card — the web half of the flow
// the iOS and Android host dashboards also carry.
//
// This is QuickIn's answer to "delete my listing", and it is deliberately not a
// delete. Bookings, reviews, messages and payment records all point at the
// listing id; removing the row would cascade a guest's completed stay away with
// it. So the button flips `is_published` instead — search drops the listing, the
// public page 404s, no new booking can be made — while every existing record
// stays exactly where it was and the host can undo the whole thing later. The
// rule set lives on the backend in `host-visibility-core.ts`.
//
// The confirmation step is not decoration. Deactivating DECLINES every booking
// request still waiting on this host (leaving them would let a guest end up with
// a confirmed stay at a place the host has walked away from), so the dialog names
// the exact number first, from `pending_request_count` on the card, before the
// host commits to anything.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CARD_ACTION_STYLE } from './card-action-style'

const C = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  danger: '#B3261E',
}

/** The backend's `blocked_by` — who is STILL holding the listing down after the
 *  host released their own grip. Null when it really did go live. */
type BlockedBy = 'verification' | 'staff' | 'rejected' | 'under_review' | null

interface VisibilityResponse {
  is_published?: boolean
  declined_requests?: number
  blocked_by?: BlockedBy
}

export function ListingVisibilityAction({
  listingId,
  listingTitle,
  /** True when the host has already taken this listing down — the button then
   *  offers to put it back. Comes from `unpublished_by_host`, NOT from
   *  `is_published`: a listing an operator hid is not the host's to reactivate. */
  deactivated,
  /** Booking requests waiting on this host right now. Named in the dialog. */
  pendingRequests,
}: {
  listingId: string
  listingTitle: string
  deactivated: boolean
  pendingRequests: number
}) {
  const router = useRouter()
  const t = useTranslations('hostPage.visibility')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function apply(next: boolean) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/local/host/listings/${listingId}/visibility`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: next }),
      })
      const body = (await res.json().catch(() => ({}))) as VisibilityResponse & { error?: string }
      if (!res.ok) throw new Error(body.error || t('errors.failed'))
      setConfirming(false)

      // Report what actually happened, never what was asked for. A reactivate can
      // legitimately come back still hidden — an account block, the identity gate
      // or the review queue outranks the host — and saying "it's live again" then
      // would be a straight lie.
      if (next && body.is_published === false) {
        setNotice(t(`blocked.${body.blocked_by ?? 'under_review'}`))
      } else if (!next && (body.declined_requests ?? 0) > 0) {
        setNotice(t('declined', { count: body.declined_requests ?? 0 }))
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '0 16px 16px' }}>
      {confirming ? (
        <ConfirmPanel
          title={t('confirm.title')}
          // The listing's own name, so a host with a dozen places cannot take
          // down the wrong one from a dialog that says "this listing".
          body={t('confirm.body', { title: listingTitle })}
          // The whole reason this dialog exists. Nothing is said about pending
          // requests when there are none — an empty warning trains people to
          // click through the real one.
          warning={pendingRequests > 0 ? t('confirm.declines', { count: pendingRequests }) : null}
          reassurance={t('confirm.reassurance')}
          confirmLabel={busy ? t('working') : t('confirm.cta')}
          cancelLabel={t('confirm.cancel')}
          busy={busy}
          onConfirm={() => apply(false)}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => (deactivated ? apply(true) : setConfirming(true))}
          disabled={busy}
          style={{
            ...CARD_ACTION_STYLE,
            width: '100%',
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.7 : 1,
            // Reactivating is the constructive action and gets the warm fill;
            // deactivating is the destructive one and stays a quiet outline, so
            // it never competes with Edit for a distracted tap.
            ...(deactivated
              ? { background: C.cream, color: C.burgundy, borderColor: C.tan }
              : { background: 'transparent', color: C.muted, borderColor: 'rgba(42,34,32,0.16)' }),
          }}
        >
          {busy ? t('working') : deactivated ? t('reactivate') : t('deactivate')}
        </button>
      )}

      {notice && !error && (
        <p role="status" style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.5, color: C.ink }}>
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.5, color: C.danger, fontWeight: 700 }}>
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * The inline confirmation. Deliberately rendered in the card rather than as a
 * modal: the host is looking at the listing they are about to take down, and a
 * dialog that covers it up asks them to confirm something they can no longer see.
 */
function ConfirmPanel({
  title,
  body,
  warning,
  reassurance,
  confirmLabel,
  cancelLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  /** "N requests will be declined" — omitted entirely when there are none. */
  warning: string | null
  /** What is NOT going to happen: existing bookings survive. */
  reassurance: string
  confirmLabel: string
  cancelLabel: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      role="alertdialog"
      aria-label={title}
      style={{
        border: '1px solid rgba(179,38,30,0.22)',
        background: '#fdf6f5',
        borderRadius: 14,
        padding: 14,
      }}
    >
      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: C.danger }}>{title}</p>
      <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5, color: C.ink }}>{body}</p>
      {warning && (
        <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5, color: C.danger, fontWeight: 700 }}>
          {warning}
        </p>
      )}
      <p style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.5, color: C.muted }}>{reassurance}</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{
            ...CARD_ACTION_STYLE,
            flex: '1 1 45%',
            background: '#fff',
            color: C.ink,
            borderColor: 'rgba(42,34,32,0.16)',
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          style={{
            ...CARD_ACTION_STYLE,
            flex: '1 1 45%',
            background: C.danger,
            color: '#fff',
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.75 : 1,
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}
