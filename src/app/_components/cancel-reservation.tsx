'use client'

// Guest "Cancel reservation" control. Shown for an upcoming (pending/confirmed,
// not-yet-cancelled) booking. On click it fetches the refund quote
// (GET /bookings/:id/cancel), shows a confirm dialog with the refund the guest
// will get, and on confirm POSTs the cancel. Calls onCancelled(refund) so the
// parent can reflect the new 'cancelled' status + refund inline.
import { useState } from 'react'
import {
  cancelBooking,
  getCancellationQuote,
  getToken,
  type CancellationQuote,
} from '@/lib/api'
import { useLanguage } from '@/lib/i18n/language-provider'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const GRAD_BURGUNDY = 'linear-gradient(135deg,#5B0F16,#8a2530)'
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

const POLICY_NAME_KEY: Record<string, string> = {
  flexible: 'cancel.flexible',
  moderate: 'cancel.moderate',
  strict: 'cancel.strict',
}

type Phase =
  // Idle button.
  | { kind: 'idle' }
  // Loading the quote after the button is pressed.
  | { kind: 'quoting' }
  // Quote loaded → confirm dialog open.
  | { kind: 'confirm'; quote: CancellationQuote }
  // POST in flight.
  | { kind: 'cancelling'; quote: CancellationQuote }
  // A non-fatal error (quote or cancel) — shown inline, button stays usable.
  | { kind: 'error'; message: string }

export default function CancelReservation({
  bookingId,
  onCancelled,
  variant = 'solid',
}: {
  bookingId: string
  onCancelled: (refund: CancellationQuote) => void
  // 'solid' = prominent burgundy button (detail page); 'subtle' = outline link
  // (list cards).
  variant?: 'solid' | 'subtle'
}) {
  const { t } = useLanguage()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  async function openConfirm() {
    const token = getToken()
    if (!token) {
      setPhase({ kind: 'error', message: t('reserve.pleaseSignIn') })
      return
    }
    setPhase({ kind: 'quoting' })
    try {
      const quote = await getCancellationQuote(token, bookingId)
      setPhase({ kind: 'confirm', quote })
    } catch {
      setPhase({ kind: 'error', message: t('cancel.quoteError') })
    }
  }

  async function confirmCancel() {
    if (phase.kind !== 'confirm') return
    const token = getToken()
    if (!token) {
      setPhase({ kind: 'error', message: t('reserve.pleaseSignIn') })
      return
    }
    const quote = phase.quote
    setPhase({ kind: 'cancelling', quote })
    try {
      const { refund } = await cancelBooking(token, bookingId)
      onCancelled(refund)
      // Parent swaps this out (status becomes cancelled); reset just in case.
      setPhase({ kind: 'idle' })
    } catch {
      setPhase({ kind: 'error', message: t('cancel.error') })
    }
  }

  const busy = phase.kind === 'quoting' || phase.kind === 'cancelling'

  // Refund sentence for the dialog (and a non-refundable variant at 0%).
  function refundLine(q: CancellationQuote): string {
    const vars = {
      amount: String(q.refundAmount),
      currency: q.currency,
      percent: String(q.refundPercent),
    }
    return q.refundPercent > 0
      ? t('cancel.refundQuote', vars)
      : t('cancel.noRefund', vars)
  }

  const buttonStyle: React.CSSProperties =
    variant === 'solid'
      ? {
          padding: '12px 22px',
          fontSize: 15,
          fontWeight: 700,
          fontFamily: FONT,
          color: COLORS.burgundy,
          background: '#fff',
          border: `1px solid ${COLORS.burgundy}`,
          borderRadius: 14,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }
      : {
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 700,
          fontFamily: FONT,
          color: COLORS.burgundy,
          background: '#fff',
          border: `1px solid ${COLORS.burgundy}`,
          borderRadius: 999,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }

  return (
    <>
      <button
        type="button"
        onClick={openConfirm}
        disabled={busy}
        className={busy ? undefined : 'qk-press'}
        style={buttonStyle}
      >
        {phase.kind === 'quoting'
          ? '…'
          : phase.kind === 'cancelling'
            ? t('cancel.cancelling')
            : t('cancel.cancelReservation')}
      </button>

      {phase.kind === 'error' && (
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.burgundy,
          }}
        >
          {phase.message}
        </p>
      )}

      {/* Confirm dialog (also stays mounted while the cancel POST is in flight
          so the spinner shows on the confirm button). */}
      {(phase.kind === 'confirm' || phase.kind === 'cancelling') && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('cancel.confirmTitle')}
          onClick={() => {
            if (phase.kind === 'confirm') setPhase({ kind: 'idle' })
          }}
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
              width: '100%',
              maxWidth: 380,
              background: '#fff',
              borderRadius: 28,
              border: '1px solid rgba(42,34,32,0.06)',
              boxShadow: '0 24px 60px rgba(42,34,32,0.28)',
              padding: 28,
              fontFamily: FONT,
              textAlign: 'center',
              animation: 'qkPop 0.22s cubic-bezier(0.2,0.8,0.2,1)',
            }}
          >
            <h2
              style={{
                margin: '0 0 8px',
                fontSize: 21,
                fontWeight: 800,
                color: COLORS.ink,
              }}
            >
              {t('cancel.confirmTitle')}
            </h2>

            {/* Refund summary */}
            <div
              style={{
                background: COLORS.tan,
                borderRadius: 16,
                padding: 16,
                margin: '14px 0 20px',
                textAlign: 'start',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  color: COLORS.muted,
                }}
              >
                <span>{t('cancel.policy')}</span>
                <span style={{ fontWeight: 700, color: COLORS.ink }}>
                  {t(POLICY_NAME_KEY[phase.quote.policy] ?? 'cancel.moderate')}
                </span>
              </div>
              <div style={{ height: 1, background: 'rgba(42,34,32,0.10)', margin: '12px 0' }} />
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 700,
                  color:
                    phase.quote.refundPercent > 0 ? '#0F5132' : COLORS.burgundy,
                  lineHeight: 1.5,
                }}
              >
                {refundLine(phase.quote)}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={phase.kind === 'cancelling'}
                className={phase.kind === 'cancelling' ? undefined : 'qk-press'}
                style={{
                  padding: '13px',
                  borderRadius: 14,
                  background: GRAD_BURGUNDY,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 15,
                  fontFamily: FONT,
                  border: 'none',
                  cursor: phase.kind === 'cancelling' ? 'wait' : 'pointer',
                  opacity: phase.kind === 'cancelling' ? 0.7 : 1,
                  boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
                }}
              >
                {phase.kind === 'cancelling'
                  ? t('cancel.cancelling')
                  : t('cancel.confirm')}
              </button>
              <button
                type="button"
                onClick={() => setPhase({ kind: 'idle' })}
                disabled={phase.kind === 'cancelling'}
                style={{
                  padding: '11px',
                  color: COLORS.muted,
                  fontWeight: 600,
                  fontSize: 14,
                  fontFamily: FONT,
                  background: 'transparent',
                  border: 'none',
                  cursor: phase.kind === 'cancelling' ? 'default' : 'pointer',
                }}
              >
                {t('cancel.keep')}
              </button>
            </div>
          </div>

          <style>{`
            @keyframes qkFade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes qkPop { from { opacity: 0; transform: translateY(8px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
          `}</style>
        </div>
      )}
    </>
  )
}
