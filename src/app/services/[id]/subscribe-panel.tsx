'use client'

// Subscribe panel for a single service — the standalone-experience equivalent
// of the reserve panel. Subscribing POSTs /api/local/service-requests; on
// success it shows a branded "Request sent" modal identical in style to the
// booking confirmation. Auth is the bearer token in localStorage (qk_token).
import { useState } from 'react'
import { API_URL } from '@/lib/api'
import DatePickerField from '../../_components/date-picker-field'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: COLORS.muted,
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: FONT,
  color: COLORS.ink,
  background: '#fff',
  border: `1px solid rgba(42,34,32,0.14)`,
  borderRadius: 12,
  outline: 'none',
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'needsLogin' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; requestId: string | null }

export default function SubscribePanel({
  serviceId,
  price,
  currency,
  title,
}: {
  serviceId: string
  price: number
  currency: string
  title: string
}) {
  const [preferredDate, setPreferredDate] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  async function handleSubscribe() {
    // Auth is a bearer token stored in localStorage after login/signup.
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('qk_token') : null
    if (!token) {
      setStatus({ kind: 'needsLogin' })
      return
    }

    setStatus({ kind: 'loading' })
    try {
      const res = await fetch(`${API_URL}/api/local/service-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          service_id: serviceId,
          preferred_date: preferredDate || undefined,
          note: note.trim() || undefined,
        }),
      })

      if (res.status === 401) {
        setStatus({ kind: 'needsLogin' })
        return
      }

      const data = await res.json().catch(() => ({}))

      if (res.status === 201) {
        setStatus({
          kind: 'success',
          requestId: typeof data.id === 'string' ? data.id : null,
        })
        return
      }

      // 400 (e.g. "already have a pending request") and anything else → surface
      // the server's message gracefully.
      setStatus({
        kind: 'error',
        message: data.error || 'Something went wrong. Please try again.',
      })
    } catch {
      setStatus({
        kind: 'error',
        message: 'Network error. Please try again.',
      })
    }
  }

  const loading = status.kind === 'loading'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: COLORS.burgundy }}>
          EGP {price}
        </span>
        <span style={{ fontSize: 15, color: COLORS.muted }}>/ booking</span>
      </div>
      <p style={{ margin: '6px 0 18px', fontSize: 13, color: COLORS.muted }}>
        Prices in EGP
      </p>

      <div>
        <DatePickerField
          label="Preferred date (optional)"
          value={preferredDate}
          ariaLabel="Preferred date"
          onChange={(iso) => {
            setPreferredDate(iso)
            setStatus({ kind: 'idle' })
          }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label htmlFor="sp-note" style={labelStyle}>
          Note to host (optional)
        </label>
        <textarea
          id="sp-note"
          value={note}
          onChange={(e) => {
            setNote(e.target.value)
            setStatus({ kind: 'idle' })
          }}
          placeholder="Anything the host should know?"
          style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
        />
      </div>

      <button
        type="button"
        onClick={handleSubscribe}
        disabled={loading}
        className={loading ? undefined : 'qk-press qk-pulse'}
        style={{
          marginTop: 18,
          width: '100%',
          padding: '15px',
          fontSize: 16,
          fontWeight: 700,
          fontFamily: FONT,
          color: '#fff',
          background: 'linear-gradient(135deg,#5B0F16,#8a2530)',
          border: 'none',
          borderRadius: 15,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.55 : 1,
          boxShadow: loading ? 'none' : '0 10px 24px rgba(91,15,22,0.28)',
        }}
      >
        {loading ? 'Sending…' : 'Subscribe'}
      </button>

      <p
        style={{
          margin: '10px 0 0',
          fontSize: 13,
          color: COLORS.muted,
          textAlign: 'center',
        }}
      >
        You won&apos;t be charged yet — the host confirms your request first.
      </p>

      {/* Feedback */}
      {status.kind === 'needsLogin' && (
        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 12,
            background: COLORS.tan,
            fontSize: 14,
            color: COLORS.ink,
          }}
        >
          Please sign in to subscribe.{' '}
          <a
            href="/login"
            style={{ color: COLORS.burgundy, fontWeight: 700, textDecoration: 'none' }}
          >
            Log in
          </a>
        </div>
      )}

      {status.kind === 'error' && (
        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(91,15,22,0.08)',
            border: `1px solid rgba(91,15,22,0.2)`,
            fontSize: 14,
            color: COLORS.burgundy,
            fontWeight: 600,
          }}
        >
          {status.message}
        </div>
      )}

      {status.kind === 'success' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Subscription request sent"
          onClick={() => setStatus({ kind: 'idle' })}
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
              position: 'relative',
              width: '100%',
              maxWidth: 360,
              background: '#fff',
              borderRadius: 28,
              border: '1px solid rgba(42,34,32,0.06)',
              boxShadow: '0 24px 60px rgba(42,34,32,0.28)',
              padding: 28,
              textAlign: 'center',
              fontFamily: FONT,
              animation: 'qkPop 0.22s cubic-bezier(0.2,0.8,0.2,1)',
            }}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setStatus({ kind: 'idle' })}
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                width: 30,
                height: 30,
                borderRadius: 15,
                border: 'none',
                background: COLORS.tan,
                color: COLORS.muted,
                fontSize: 17,
                lineHeight: 1,
                cursor: 'pointer',
              }}
            >
              ×
            </button>

            {/* Burgundy "sent" badge — pops in with a soft pulse ring. */}
            <div
              className="qk-pop qk-pulse"
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                background: 'linear-gradient(135deg,#5B0F16,#8a2530)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '4px auto 16px',
                boxShadow: '0 8px 20px rgba(91,15,22,0.30)',
              }}
            >
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
              </svg>
            </div>

            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: COLORS.ink }}>
              Request sent
            </h2>
            <p style={{ margin: '0 0 18px', fontSize: 15, color: COLORS.muted, lineHeight: 1.45 }}>
              Waiting for the host to accept your subscription.
            </p>

            {/* Summary */}
            <div style={{ background: COLORS.tan, borderRadius: 16, padding: 14, textAlign: 'left' }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: COLORS.ink,
                }}
              >
                {title}
              </div>
              <div style={{ height: 1, background: 'rgba(42,34,32,0.10)', margin: '10px 0' }} />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <span style={{ fontSize: 14, color: COLORS.muted }}>Price</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: COLORS.burgundy }}>
                  EGP {price}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <a
                href="/subscriptions"
                className="qk-press"
                style={{
                  display: 'block',
                  padding: '13px',
                  borderRadius: 14,
                  background: 'linear-gradient(135deg,#5B0F16,#8a2530)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 15,
                  textDecoration: 'none',
                  boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
                }}
              >
                View my subscriptions
              </a>
              <button
                type="button"
                onClick={() => setStatus({ kind: 'idle' })}
                style={{
                  padding: '11px',
                  color: COLORS.muted,
                  fontWeight: 600,
                  fontSize: 14,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: FONT,
                }}
              >
                Done
              </button>
            </div>
          </div>

          <style>{`
            @keyframes qkFade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes qkPop { from { opacity: 0; transform: translateY(8px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
          `}</style>
        </div>
      )}
    </div>
  )
}
