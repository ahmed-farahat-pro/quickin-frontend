'use client'

// "Review your guests" — the host's side of the two-way review, and the first
// review WRITE path this app has ever had (the web could only ever display the
// reviews /explore/[id] renders).
//
// Fetches GET /api/local/guest-reviews (host session, no query string) and
// POSTs one review per past stay. Same contract iOS's ReviewGuestsView and
// Android's ReviewGuestsTab use; the rules for what is submittable live in
// guest-review-core.ts, so all three surfaces refuse the same drafts.
import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { ReviewableGuest } from '@/lib/types'
import { ShimmerStyles, SkeletonRow } from '@/components/ui/skeleton-block'
import {
  MAX_COMMENT_LENGTH,
  MAX_RATING,
  guestReviewBody,
  guestReviewProblem,
} from '@/lib/local/guest-review-core'

const C = {
  burgundy: '#5B0F16',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  gold: '#B07A2A',
}

const DATE_LOCALE: Record<string, string> = {
  ar: 'ar-EG',
  fr: 'fr-FR',
  es: 'es-ES',
  en: 'en-US',
}

export function ReviewGuests() {
  const t = useTranslations('hostReviews')
  const locale = useLocale()

  const [guests, setGuests] = useState<ReviewableGuest[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Bookings reviewed in THIS session — removed from the list with a thank-you
   *  rather than vanishing, so the host sees the submit landed. */
  const [done, setDone] = useState<Record<string, true>>({})

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await fetch('/api/local/guest-reviews', { credentials: 'same-origin' })
      if (!res.ok) throw new Error(String(res.status))
      const body = await res.json()
      setGuests(Array.isArray(body) ? body : [])
    } catch {
      setGuests([])
      setLoadError(t('loadFailed'))
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  if (guests === null) {
    return (
      <>
        <ShimmerStyles />
        <div style={{ display: 'grid', gap: 12 }}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </>
    )
  }

  const pending = guests.filter((g) => !done[g.booking_id])
  const reviewedCount = Object.keys(done).length

  return (
    <>
      {loadError && (
        <p style={{ margin: '0 0 16px', fontSize: 14, color: C.burgundy }}>{loadError}</p>
      )}

      {reviewedCount > 0 && (
        <p
          style={{
            margin: '0 0 16px',
            padding: '12px 16px',
            borderRadius: 14,
            background: '#e7f5ec',
            color: '#177245',
            fontSize: 14,
            fontWeight: 600,
          }}
          role="status"
        >
          {t('thanks', { count: reviewedCount })}
        </p>
      )}

      {pending.length === 0 ? (
        <div
          style={{
            background: '#fff',
            borderRadius: 22,
            border: '1px solid rgba(42,34,32,0.06)',
            boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
            padding: '48px 24px',
            textAlign: 'center',
            color: C.muted,
          }}
        >
          <p style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: C.ink }}>
            {reviewedCount > 0 ? t('allDone.title') : t('empty.title')}
          </p>
          <p style={{ margin: 0, fontSize: 15 }}>
            {reviewedCount > 0 ? t('allDone.hint') : t('empty.hint')}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {pending.map((guest) => (
            <GuestCard
              key={guest.booking_id}
              guest={guest}
              locale={DATE_LOCALE[locale] ?? 'en-US'}
              onDone={() => setDone((d) => ({ ...d, [guest.booking_id]: true }))}
            />
          ))}
        </div>
      )}
    </>
  )
}

function GuestCard({
  guest,
  locale,
  onDone,
}: {
  guest: ReviewableGuest
  locale: string
  onDone: () => void
}) {
  const t = useTranslations('hostReviews')
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const problem = guestReviewProblem({ rating, comment })
  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })

  async function submit() {
    if (problem || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/local/guest-reviews', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(guestReviewBody(guest.booking_id, { rating, comment })),
      })
      if (!res.ok) {
        // The backend's message is the useful one here — it knows why a
        // particular booking is not reviewable (already reviewed, not yours,
        // the stay has not ended), and this form cannot.
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || t('submitFailed'))
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('submitFailed'))
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 20,
        border: '1px solid rgba(42,34,32,0.06)',
        boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
        padding: '18px 20px',
      }}
    >
      <p style={{ margin: '0 0 2px', fontSize: 16.5, fontWeight: 700, color: C.ink }}>
        {guest.guest_name || t('deletedGuest')}
      </p>
      <p style={{ margin: '0 0 14px', fontSize: 13.5, color: C.muted }}>
        {t('stayedAt', { title: guest.title })} · {dateFmt.format(new Date(guest.check_out))}
      </p>

      {/* Stars. Radios rather than buttons so the whole picker is one tab stop
          and arrow keys move between the five, which is what a screen reader
          user expects of a rating. */}
      <fieldset style={{ border: 0, margin: '0 0 12px', padding: 0 }}>
        <legend
          style={{
            padding: 0,
            fontSize: 13,
            fontWeight: 600,
            color: C.muted,
            marginBottom: 6,
          }}
        >
          {t('ratingLegend')}
        </legend>
        <div style={{ display: 'flex', gap: 4 }} onMouseLeave={() => setHovered(0)}>
          {Array.from({ length: MAX_RATING }, (_, i) => i + 1).map((star) => {
            const filled = star <= (hovered || rating)
            return (
              <label
                key={star}
                onMouseEnter={() => setHovered(star)}
                style={{ cursor: saving ? 'default' : 'pointer', lineHeight: 1 }}
              >
                <input
                  type="radio"
                  name={`rating-${guest.booking_id}`}
                  value={star}
                  checked={rating === star}
                  disabled={saving}
                  onChange={() => setRating(star)}
                  // Off-screen rather than display:none — a hidden input is not
                  // focusable, which would take the picker out of the tab order.
                  style={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    opacity: 0,
                    pointerEvents: 'none',
                  }}
                />
                <span
                  aria-label={t('starLabel', { count: star })}
                  style={{
                    fontSize: 27,
                    color: filled ? C.gold : 'rgba(42,34,32,0.20)',
                    transition: 'color 120ms ease',
                  }}
                >
                  ★
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={MAX_COMMENT_LENGTH}
        disabled={saving}
        rows={3}
        placeholder={t('commentPlaceholder')}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          resize: 'vertical',
          borderRadius: 12,
          border: '1px solid rgba(42,34,32,0.14)',
          padding: '10px 12px',
          fontSize: 14.5,
          fontFamily: 'inherit',
          color: C.ink,
          background: saving ? '#faf8f5' : '#fff',
        }}
      />

      {error && (
        <p style={{ margin: '10px 0 0', fontSize: 13.5, color: C.burgundy }} role="alert">
          {error}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 12,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12.5, color: C.muted }}>
          {t('optionalComment')}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={Boolean(problem) || saving}
          style={{
            border: 0,
            borderRadius: 999,
            padding: '10px 22px',
            fontSize: 14.5,
            fontWeight: 700,
            fontFamily: 'inherit',
            color: '#fff',
            background: problem || saving ? 'rgba(91,15,22,0.35)' : C.burgundy,
            cursor: problem || saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? t('submitting') : t('submit')}
        </button>
      </div>
    </div>
  )
}
