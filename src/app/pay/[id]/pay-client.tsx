'use client'

// The payment screen: how to pay on the left, prove you paid on the right.
//
// Side by side is the point — a guest scanning a QR in a banking app and then coming
// back to upload a screenshot shouldn't have to hunt for the upload, and the two
// halves are one task. It stacks on narrow screens, where side-by-side would squash
// the QR below scanning size.
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { formatDisplayPrice, isConverted } from '@/lib/currency/display'
import { useDisplayCurrency } from '@/components/providers/display-currency-provider'
import { InstapayDetails } from '@/components/instapay-details'
import { fileToCompressedDataUrl } from '@/lib/image'
import { MAX_PROOF_CHARS } from '@/lib/local/payment-flow-core'

const C = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  green: '#177245',
  red: '#b3261e',
}
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 20,
  border: '1px solid rgba(42,34,32,0.06)',
  boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
  padding: 20,
}

export function PayClient({
  bookingId,
  title,
  total,
  currency,
  checkIn,
  checkOut,
  rejectedReason,
}: {
  bookingId: string
  title: string
  total: number
  currency: string
  checkIn: string
  checkOut: string
  rejectedReason: string | null
}) {
  const router = useRouter()
  const tCurrency = useTranslations('currency')
  // The transfer is made in the booking's currency, so that figure stays the
  // headline. The guest's currency is a second line to help them recognise the
  // amount in their banking app, never to tell them what to send.
  const { currency: displayCurrency } = useDisplayCurrency()
  const converted = isConverted(currency, displayCurrency)
  const [image, setImage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setError(null)
    try {
      // Same compressor the ID and ownership uploads use — a raw phone photo is far
      // over the server's cap and would be rejected by the platform before the route
      // even ran.
      const url = await fileToCompressedDataUrl(file)
      if (url.length > MAX_PROOF_CHARS) {
        setError('That screenshot is too large even after compression. Please try another.')
        return
      }
      setImage(url)
    } catch {
      setError('We could not read that image. Please try another.')
    }
  }

  async function submit() {
    if (!image) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/local/bookings/${bookingId}/payment-proof`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, method: 'instapay' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body?.error || 'We could not submit your screenshot. Please try again.')
        return
      }
      setDone(true)
      // Refresh so /reservations shows "Under review" when they navigate back.
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <main style={{ minHeight: '100vh', background: C.cream, color: C.ink, fontFamily: FONT }}>
        <section style={{ maxWidth: 640, margin: '0 auto', padding: '64px 20px' }}>
          <div style={{ ...card, textAlign: 'center', padding: '44px 24px' }}>
            <div style={{ fontSize: 40, lineHeight: 1 }}>⏳</div>
            <h1 style={{ margin: '14px 0 6px', fontFamily: '"Playfair Display", Georgia, serif', fontSize: 26, color: C.burgundy }}>
              Thanks — we&apos;re checking your transfer
            </h1>
            <p style={{ margin: '0 0 20px', fontSize: 14.5, color: C.muted, lineHeight: 1.6 }}>
              Your booking for <strong style={{ color: C.ink }}>{title}</strong> is confirmed once we
              verify the payment. You&apos;ll get a notification either way.
            </p>
            <Link
              href="/reservations"
              style={{
                display: 'inline-block', background: C.burgundy, color: '#fff', borderRadius: 999,
                padding: '11px 24px', fontWeight: 700, fontSize: 14, textDecoration: 'none',
              }}
            >
              Back to my reservations
            </Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main style={{ minHeight: '100vh', background: C.cream, color: C.ink, fontFamily: FONT }}>
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 20px 72px' }}>
        <Link href="/reservations" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>
          ← Back to my reservations
        </Link>

        <h1 style={{ margin: '10px 0 4px', fontFamily: '"Playfair Display", Georgia, serif', fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 700, color: C.burgundy }}>
          Pay for your stay
        </h1>
        <p style={{ margin: '0 0 6px', fontSize: 14.5, color: C.muted }}>
          {title} · {checkIn} → {checkOut}
        </p>
        <p
          style={{
            margin: converted ? '0 0 4px' : '0 0 20px',
            fontSize: 22,
            fontWeight: 800,
            color: C.ink,
          }}
        >
          {currency} {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </p>
        {converted && (
          <p style={{ margin: '0 0 20px', fontSize: 13, color: C.muted }}>
            {formatDisplayPrice(total, currency, displayCurrency)}
            {' · '}
            {tCurrency('chargedIn', { currency })}
          </p>
        )}

        {rejectedReason && (
          <div style={{ ...card, marginBottom: 16, borderLeft: `4px solid ${C.red}`, padding: 16 }}>
            <strong style={{ fontSize: 14, color: C.red }}>Your last screenshot wasn&apos;t accepted</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: C.muted }}>{rejectedReason}</p>
          </div>
        )}

        {/* Two halves of one task: transfer, then prove it. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
          <div style={card}>
            <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: C.burgundy }}>1. Send the transfer</h2>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: C.muted }}>
              Scan the code or copy the number into your banking app.
            </p>
            <InstapayDetails />
          </div>

          <div style={card}>
            <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: C.burgundy }}>2. Upload the receipt</h2>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: C.muted }}>
              A screenshot of the completed transfer — we check it before confirming.
            </p>

            <label
              style={{
                display: 'block', border: `1.5px dashed ${C.tan}`, borderRadius: 14,
                padding: image ? 10 : '32px 16px', textAlign: 'center', cursor: 'pointer',
                background: C.cream,
              }}
            >
              <input type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="Your transfer screenshot" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, display: 'block', margin: '0 auto' }} />
              ) : (
                <>
                  <div style={{ fontSize: 26 }}>📷</div>
                  <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: C.burgundy }}>
                    Choose a screenshot
                  </div>
                  <div style={{ marginTop: 2, fontSize: 12, color: C.muted }}>PNG or JPEG</div>
                </>
              )}
            </label>
            {image && (
              <button
                type="button"
                onClick={() => setImage(null)}
                style={{ marginTop: 8, background: 'none', border: 'none', color: C.muted, fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Choose a different one
              </button>
            )}

            {error && <p style={{ margin: '12px 0 0', fontSize: 13, color: C.red, fontWeight: 600 }}>{error}</p>}

            <button
              type="button"
              onClick={submit}
              disabled={!image || busy}
              style={{
                width: '100%', marginTop: 16, padding: '13px 20px', borderRadius: 999, border: 'none',
                background: image && !busy ? C.burgundy : C.tan,
                color: image && !busy ? '#fff' : C.muted,
                fontWeight: 800, fontSize: 15,
                cursor: image && !busy ? 'pointer' : 'not-allowed',
              }}
            >
              {busy ? 'Sending…' : 'I have paid'}
            </button>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: C.muted, textAlign: 'center' }}>
              Your booking is confirmed once we verify the transfer.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
