'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

// Shown when Paymob redirects the guest back to /reservations (?booking=<id>). Paymob's
// redirect params are NOT trusted for truth — the webhook is the source of truth and writes
// paid_at in the DB. So we poll GET /api/local/bookings/:id until payment_status flips to
// "paid" (then refresh the page to reveal the Paid card), or time out into a soft "processing"
// state. A BroadcastChannel keeps any other open /reservations tab in sync.
type Phase = 'idle' | 'confirming' | 'received' | 'failed' | 'processing'

const STYLE: Record<Exclude<Phase, 'idle'>, { bg: string; fg: string; icon: string }> = {
  confirming: { bg: '#fff7e6', fg: '#9a6b00', icon: '⏳' },
  received:   { bg: '#e7f5ec', fg: '#177245', icon: '✓' },
  failed:     { bg: '#fdecea', fg: '#b3261e', icon: '✕' },
  processing: { bg: '#fff7e6', fg: '#9a6b00', icon: '⏳' },
}

export function PaymentReturnBanner() {
  const t = useTranslations('reservationsLocal')
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const started = useRef(false)

  useEffect(() => {
    // Cross-tab sync: when checkout completes in another tab, refresh this one.
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel('qk-payment')
      bc.onmessage = (e) => { if (e.data === 'paid') router.refresh() }
    } catch { /* unsupported — fine */ }

    const params = new URLSearchParams(window.location.search)
    const bookingId = params.get('booking')
    if (!bookingId || started.current) return () => bc?.close()
    started.current = true
    setPhase('confirming')

    // Strip the return markers so a manual refresh doesn't restart the poll.
    const url = new URL(window.location.href)
    ;['booking', 'success', 'paid', 'txn_response_code', 'id', 'order', 'merchant_order_id', 'hmac']
      .forEach((k) => url.searchParams.delete(k))
    window.history.replaceState({}, '', url.pathname + url.search)

    let cancelled = false
    const deadline = Date.now() + 30_000 // give the webhook up to 30s

    ;(async function poll() {
      while (!cancelled && Date.now() < deadline) {
        try {
          const res = await fetch(`/api/local/bookings/${bookingId}`, { credentials: 'same-origin', cache: 'no-store' })
          if (res.ok) {
            const b = await res.json().catch(() => null)
            if (b) {
              if (b.payment_status === 'paid' || b.paid_at) {
                if (cancelled) return
                setPhase('received')
                try { bc?.postMessage('paid') } catch { /* ignore */ }
                router.refresh()
                return
              }
              if (b.payment_state === 'failed') {
                // Webhook recorded a declined/failed transaction — stop and let the guest retry.
                if (!cancelled) { setPhase('failed'); router.refresh() }
                return
              }
              // 'pending' / 'unpaid' → the webhook hasn't finalised yet; keep polling.
            }
          }
        } catch { /* transient network error — keep polling */ }
        await new Promise((r) => setTimeout(r, 2500))
      }
      // Timed out waiting for the webhook — soft "still processing" (don't claim success/failure).
      if (!cancelled) setPhase('processing')
    })()

    return () => { cancelled = true; bc?.close() }
  }, [router])

  if (phase === 'idle') return null
  const s = STYLE[phase]
  const text = phase === 'confirming' ? t('paymentConfirming')
    : phase === 'received' ? t('paymentReceived')
    : phase === 'failed' ? t('paymentFailed')
    : t('paymentProcessing')

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: s.bg, color: s.fg, borderRadius: 12,
        padding: '12px 16px', marginBottom: 20, fontSize: 14, fontWeight: 600,
      }}
    >
      <span aria-hidden>{s.icon}</span>
      <span>{text}</span>
    </div>
  )
}
