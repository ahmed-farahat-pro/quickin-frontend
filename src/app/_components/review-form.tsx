'use client'

// "Leave a review" control for a completed stay. A 1–5 gold-star picker + a
// comment textarea that POSTs to /api/local/reviews. On success it collapses to
// a "thanks" summary showing the submitted rating. Shown for confirmed bookings
// whose checkout has passed (the caller decides eligibility, typically via the
// reviewable-stays list). Requires the bearer token in qk_token.
import { useState } from 'react'
import { API_URL, getToken } from '@/lib/api'
import { useLanguage } from '@/lib/i18n/language-provider'

const COLORS = {
  burgundy: '#5B0F16',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  gold: '#B07A2A',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

// 1–5 clickable stars with a hover preview. Gold when lit.
function StarPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  const { t } = useLanguage()
  const [hover, setHover] = useState(0)
  const shown = hover || value
  return (
    <div
      role="radiogroup"
      aria-label={t('reviews.yourRating')}
      style={{ display: 'inline-flex', gap: 4 }}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const lit = n <= shown
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={t('reviews.starsN', { count: n })}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="qk-tap"
            style={{
              appearance: 'none',
              border: 'none',
              background: 'transparent',
              padding: 2,
              fontSize: 30,
              lineHeight: 1,
              cursor: 'pointer',
              color: lit ? COLORS.gold : 'rgba(42,34,32,0.22)',
            }}
          >
            ★
          </button>
        )
      })}
    </div>
  )
}

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; rating: number }

export default function ReviewForm({
  bookingId,
  // Lets the caller refresh its list (e.g. drop this stay from "to review") once
  // a review lands.
  onSubmitted,
  compact = false,
}: {
  bookingId: string
  onSubmitted?: (rating: number) => void
  compact?: boolean
}) {
  const { t } = useLanguage()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  async function submit() {
    if (rating < 1 || rating > 5) {
      setStatus({ kind: 'error', message: t('reviews.pickRating') })
      return
    }
    const token = getToken()
    if (!token) {
      setStatus({ kind: 'error', message: t('reviews.pleaseSignIn') })
      return
    }
    setStatus({ kind: 'saving' })
    try {
      const res = await fetch(`${API_URL}/api/local/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          booking_id: bookingId,
          rating,
          comment: comment.trim(),
        }),
      })
      if (res.status === 201) {
        setStatus({ kind: 'done', rating })
        onSubmitted?.(rating)
        return
      }
      const data = await res.json().catch(() => ({}))
      setStatus({ kind: 'error', message: data.error || t('reviews.submitError') })
    } catch {
      setStatus({ kind: 'error', message: t('reviews.networkError') })
    }
  }

  // Submitted → a calm "thanks" summary with the rating they gave.
  if (status.kind === 'done') {
    return (
      <div
        style={{
          background: COLORS.tan,
          borderRadius: 16,
          padding: '16px 18px',
          fontFamily: FONT,
        }}
      >
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: COLORS.ink }}>
          {t('reviews.thanks')}
        </p>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 14,
            color: COLORS.muted,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                style={{
                  color: i < status.rating ? COLORS.gold : 'rgba(42,34,32,0.22)',
                  fontSize: 16,
                }}
              >
                ★
              </span>
            ))}
          </span>
          {t('reviews.youRated', { count: status.rating })}
        </p>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: FONT }}>
      {!compact && (
        <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: COLORS.ink }}>
          {t('reviews.howWasStay')}
        </p>
      )}
      <StarPicker value={rating} onChange={(n) => { setRating(n); setStatus({ kind: 'idle' }) }} />

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t('reviews.commentPlaceholder')}
        rows={compact ? 2 : 3}
        style={{
          display: 'block',
          width: '100%',
          boxSizing: 'border-box',
          marginTop: 10,
          padding: '10px 12px',
          fontSize: 14,
          fontFamily: FONT,
          color: COLORS.ink,
          background: '#fff',
          border: '1px solid rgba(42,34,32,0.14)',
          borderRadius: 12,
          outline: 'none',
          resize: 'vertical',
        }}
      />

      {status.kind === 'error' && (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: COLORS.burgundy, fontWeight: 600 }}>
          {status.message}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={status.kind === 'saving'}
        className="qk-press"
        style={{
          marginTop: 12,
          padding: '11px 22px',
          fontSize: 15,
          fontWeight: 700,
          fontFamily: FONT,
          color: '#fff',
          background: 'linear-gradient(135deg,#5B0F16,#8a2530)',
          border: 'none',
          borderRadius: 14,
          cursor: status.kind === 'saving' ? 'progress' : 'pointer',
          opacity: status.kind === 'saving' ? 0.7 : 1,
          boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
        }}
      >
        {status.kind === 'saving' ? t('reviews.submitting') : t('reviews.submit')}
      </button>
    </div>
  )
}
