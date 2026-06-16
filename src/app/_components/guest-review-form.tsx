'use client'

// "Review your guest" control for the host area. A 1–5 gold-star picker + a
// comment textarea that POSTs to /api/local/guest-reviews (host → guest). On
// success the caller is told (onSubmitted) so it can drop this stay from the
// "guests to review" list. Requires the bearer token in qk_token.
import { useState } from 'react'
import { getToken, postGuestReview } from '@/lib/api'
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
              fontSize: 28,
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

export default function GuestReviewForm({
  bookingId,
  onSubmitted,
}: {
  bookingId: string
  // Called once the review lands so the caller can drop this stay from the list.
  onSubmitted?: () => void
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
      const res = await postGuestReview(token, {
        booking_id: bookingId,
        rating,
        comment: comment.trim(),
      })
      if (res.status === 201 || res.ok) {
        onSubmitted?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      setStatus({ kind: 'error', message: data.error || t('reviews.submitError') })
    } catch {
      setStatus({ kind: 'error', message: t('reviews.networkError') })
    }
  }

  return (
    <div style={{ fontFamily: FONT }}>
      <StarPicker value={rating} onChange={(n) => { setRating(n); setStatus({ kind: 'idle' }) }} />

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t('reviews.guestCommentPlaceholder')}
        rows={2}
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
        className={status.kind === 'saving' ? undefined : 'qk-press'}
        style={{
          marginTop: 12,
          padding: '10px 20px',
          fontSize: 14,
          fontWeight: 700,
          fontFamily: FONT,
          color: '#fff',
          background: 'linear-gradient(135deg,#5B0F16,#8a2530)',
          border: 'none',
          borderRadius: 12,
          cursor: status.kind === 'saving' ? 'progress' : 'pointer',
          opacity: status.kind === 'saving' ? 0.7 : 1,
          boxShadow: '0 8px 20px rgba(91,15,22,0.24)',
        }}
      >
        {status.kind === 'saving' ? t('reviews.submitting') : t('reviews.submit')}
      </button>
    </div>
  )
}
