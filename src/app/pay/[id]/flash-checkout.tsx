'use client'

// The automatic half of /pay: a hosted card/wallet checkout (Flash, useflash.app)
// in place of the screenshot upload the manual methods use.
//
// Flash has NO return URL — nothing brings the guest back here when they finish —
// so the payment page opens in a new tab and this one watches the booking instead:
//   • POST /api/local/bookings/:id/flash-checkout mints (or re-hands) the link;
//   • GET on the same path re-reads the status from Flash. Polled every few seconds
//     while this tab is visible, re-checked the moment it becomes visible again
//     (the guest switching back from the checkout tab is the likeliest "done"
//     signal), and on demand from the "I've paid" button;
//   • polling gives up after POLL_FOR_MS so a forgotten tab doesn't hit the
//     backend forever. The button keeps working after that.
//
// The link is also rendered as a plain anchor: window.open after an await is
// outside the click's user gesture, and Safari's popup blocker will eat it.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

const C = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  red: '#b3261e',
}

const POLL_EVERY_MS = 3500
const POLL_FOR_MS = 15 * 60 * 1000

type FlashStatus =
  | 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'refunded' | 'expired' | 'none'

interface FlashCheckoutState {
  status: FlashStatus
  paid: boolean
  payment_link: string | null
  expires_at: string | null
  amount_cents: number | null
  order_id: string | null
}

/** Statuses after which the link is dead and a new POST mints a fresh one. */
const RETRYABLE: readonly FlashStatus[] = ['failed', 'canceled', 'expired', 'refunded']

type Phase = 'idle' | 'starting' | 'waiting' | 'retry' | 'paid'

export function FlashCheckout({
  bookingId,
  total,
  currency,
  onPaid,
}: {
  bookingId: string
  total: number
  currency: string
  /** Called once when Flash reports the booking paid. */
  onPaid: () => void
}) {
  const t = useTranslations('payMethods')
  const [phase, setPhase] = useState<Phase>('idle')
  const [checkout, setCheckout] = useState<FlashCheckoutState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [pollStopped, setPollStopped] = useState(false)
  const pollStartedAt = useRef<number | null>(null)
  const paidFired = useRef(false)
  // The caller passes an inline arrow; holding it in a ref keeps applyState (and
  // with it the mount read and the poll) from being rebuilt on every parent render.
  const onPaidRef = useRef(onPaid)
  useEffect(() => {
    onPaidRef.current = onPaid
  }, [onPaid])

  const url = `/api/local/bookings/${bookingId}/flash-checkout`

  // One place that turns a checkout payload into a phase, so the POST, the poll and
  // the manual check cannot disagree about what "paid" or "try again" means.
  const applyState = useCallback(
    (data: FlashCheckoutState) => {
      setCheckout(data)
      if (data.paid) {
        setPhase('paid')
        if (!paidFired.current) {
          paidFired.current = true
          onPaidRef.current()
        }
        return
      }
      if (RETRYABLE.includes(data.status)) {
        setPhase('retry')
        return
      }
      if ((data.status === 'pending' || data.status === 'processing') && data.payment_link) {
        setPhase('waiting')
        return
      }
      setPhase('idle')
    },
    [],
  )

  const refresh = useCallback(async (): Promise<FlashCheckoutState | null> => {
    const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as FlashCheckoutState
    applyState(data)
    return data
  }, [url, applyState])

  // A guest who opened the checkout, wandered off and came back to /pay should land
  // on "waiting", not on a fresh Pay button. One quiet read on mount decides that.
  useEffect(() => {
    let alive = true
    fetch(url, { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: FlashCheckoutState | null) => {
        if (!alive || !data) return
        if (data.status === 'none') return
        if (data.status === 'pending' || data.status === 'processing' || data.paid) {
          pollStartedAt.current = Date.now()
          applyState(data)
        }
        // A dead link from an earlier attempt is not worth announcing on arrival —
        // the Pay button already mints a new one.
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [url, applyState])

  // The poll. Runs only while waiting and visible; a backgrounded tab costs nothing.
  useEffect(() => {
    if (phase !== 'waiting' || pollStopped) return
    if (pollStartedAt.current === null) pollStartedAt.current = Date.now()

    const tick = () => {
      if (pollStartedAt.current !== null && Date.now() - pollStartedAt.current > POLL_FOR_MS) {
        setPollStopped(true)
        return
      }
      if (document.visibilityState !== 'visible') return
      refresh().catch(() => {})
    }
    const id = window.setInterval(tick, POLL_EVERY_MS)
    // Coming back from the checkout tab is the most likely moment it just went through.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [phase, pollStopped, refresh])

  async function start() {
    setPhase('starting')
    setError(null)
    setNote(null)
    try {
      const res = await fetch(url, { method: 'POST', credentials: 'same-origin' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Every refusal (flash_unavailable, not_payable, below_minimum, flash_error)
        // carries a human sentence — show it rather than mapping codes to copy.
        setError(body?.error || t('flashError'))
        setPhase('idle')
        return
      }
      const data = body as FlashCheckoutState
      pollStartedAt.current = Date.now()
      setPollStopped(false)
      applyState(data)
      if (!data.paid && data.payment_link) {
        window.open(data.payment_link, '_blank', 'noopener,noreferrer')
      }
    } catch {
      setError(t('flashNetwork'))
      setPhase('idle')
    }
  }

  async function checkNow() {
    setChecking(true)
    setNote(null)
    setError(null)
    try {
      const data = await refresh()
      if (!data) setError(t('flashNetwork'))
      else if (!data.paid && (data.status === 'pending' || data.status === 'processing')) {
        setNote(t('flashNotYet'))
      }
    } catch {
      setError(t('flashNetwork'))
    } finally {
      setChecking(false)
    }
  }

  // The figure on the button is the booking's total until Flash has quoted its own;
  // after that, what Flash will actually charge.
  const amount =
    checkout?.amount_cents != null ? checkout.amount_cents / 100 : total
  const amountText = amount.toLocaleString(undefined, { maximumFractionDigits: 2 })

  const primary: React.CSSProperties = {
    width: '100%', padding: '13px 20px', borderRadius: 999, border: 'none',
    background: C.burgundy, color: '#fff', fontWeight: 800, fontSize: 15,
    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
    display: 'block', textDecoration: 'none', boxSizing: 'border-box',
  }
  const secondary: React.CSSProperties = {
    ...primary, background: '#fff', color: C.burgundy, border: `1px solid ${C.tan}`,
  }

  // The caller swaps the whole page for its success screen on onPaid.
  if (phase === 'paid') return null

  if (phase === 'waiting' && checkout?.payment_link) {
    return (
      <div>
        <div role="status" style={{ padding: 14, borderRadius: 14, background: C.cream, border: `1px solid ${C.tan}` }}>
          <strong style={{ fontSize: 14, color: C.ink }}>{t('flashWaitingTitle')}</strong>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
            {pollStopped ? t('flashStopped') : t('flashWaitingBody')}
          </p>
        </div>

        <a href={checkout.payment_link} target="_blank" rel="noopener noreferrer" style={{ ...secondary, marginTop: 14 }}>
          {t('flashOpenAgain')}
        </a>
        <button
          type="button"
          onClick={checkNow}
          disabled={checking}
          style={{ ...primary, marginTop: 10, opacity: checking ? 0.7 : 1, cursor: checking ? 'default' : 'pointer' }}
        >
          {checking ? t('flashChecking') : t('flashCheck')}
        </button>

        {note && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: C.muted }}>{note}</p>}
        {error && <p style={{ margin: '10px 0 0', fontSize: 13, color: C.red, fontWeight: 600 }}>{error}</p>}
      </div>
    )
  }

  const starting = phase === 'starting'
  const failedLine =
    phase === 'retry' && checkout
      ? checkout.status === 'expired'
        ? t('flashExpired')
        : checkout.status === 'canceled'
          ? t('flashCanceled')
          : t('flashFailed')
      : null

  return (
    <div>
      {failedLine && (
        <p role="status" style={{ margin: '0 0 12px', fontSize: 13, color: C.red, fontWeight: 600 }}>{failedLine}</p>
      )}
      <button
        type="button"
        onClick={start}
        disabled={starting}
        style={{ ...primary, opacity: starting ? 0.7 : 1, cursor: starting ? 'default' : 'pointer' }}
      >
        {starting
          ? t('flashStarting')
          : phase === 'retry'
            ? t('flashTryAgain')
            : t('flashPay', { amount: amountText, currency })}
      </button>
      {error && <p style={{ margin: '12px 0 0', fontSize: 13, color: C.red, fontWeight: 600 }}>{error}</p>}
      <p style={{ margin: '10px 0 0', fontSize: 12, color: C.muted, textAlign: 'center' }}>{t('flashSecuredBy')}</p>
    </div>
  )
}
