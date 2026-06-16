'use client'

// Reviews list for the listing detail page. Fetches the public reviews
// (GET /api/local/reviews?listing_id=ID) on mount and renders each as a small
// card: a gold star row, the reviewer's name, the date, the comment, and any
// photos the guest attached (a thumbnail row; clicking one opens a lightbox).
// Stays quiet (renders nothing) while loading or when there are no reviews — the
// summary rating shown next to the title already communicates "New".
import { useEffect, useState } from 'react'
import { API_URL, type Review } from '@/lib/api'
import { useLanguage } from '@/lib/i18n/language-provider'

const COLORS = {
  burgundy: '#5B0F16',
  ink: '#2A2220',
  muted: '#6B6055',
  gold: '#B07A2A',
}

// Render `n` gold stars (out of 5) for one review.
function Stars({ n }: { n: number }) {
  const full = Math.max(0, Math.min(5, Math.round(n)))
  return (
    <span aria-hidden="true" style={{ letterSpacing: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          style={{ color: i < full ? COLORS.gold : 'rgba(42,34,32,0.20)', fontSize: 15 }}
        >
          ★
        </span>
      ))}
    </span>
  )
}

export default function ReviewsSection({
  listingId,
  lang,
}: {
  listingId: string
  // Passed from the (server) page so the date formatter matches the UI language
  // without needing another context read on the server side.
  lang?: string
}) {
  const { t, lang: ctxLang } = useLanguage()
  const locale = (lang ?? ctxLang) === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US'
  const [reviews, setReviews] = useState<Review[] | null>(null)
  // Currently zoomed photo (data:/http URL) shown in the lightbox, or null.
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/local/reviews?listing_id=${encodeURIComponent(listingId)}`
        )
        if (!res.ok) {
          if (!cancelled) setReviews([])
          return
        }
        const data = await res.json()
        if (!cancelled) setReviews(Array.isArray(data) ? (data as Review[]) : [])
      } catch {
        if (!cancelled) setReviews([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [listingId])

  // Nothing to show yet (loading) or no reviews → render nothing. The "New"
  // badge by the title already covers the empty case.
  if (!reviews || reviews.length === 0) return null

  function fmtDate(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div style={{ marginTop: 36 }}>
      <h2
        style={{
          margin: '0 0 16px',
          fontSize: 19,
          fontWeight: 700,
          color: COLORS.ink,
        }}
      >
        {t(reviews.length === 1 ? 'reviews.titleOne' : 'reviews.titleMany', {
          count: reviews.length,
        })}
      </h2>

      <div
        className="qk-reviews-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '16px 24px',
        }}
      >
        <style>{`
          @media (max-width: 560px) {
            .qk-reviews-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>

        {reviews.map((r, i) => (
          <div
            key={i}
            style={{
              background: '#fff',
              borderRadius: 18,
              border: '1px solid rgba(42,34,32,0.06)',
              boxShadow: '0 6px 18px rgba(42,34,32,0.07)',
              padding: '16px 18px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <Stars n={r.rating} />
              {r.created_at && (
                <span style={{ fontSize: 12, color: COLORS.muted }}>
                  {fmtDate(r.created_at)}
                </span>
              )}
            </div>
            <p
              style={{
                margin: '8px 0 0',
                fontSize: 14,
                fontWeight: 700,
                color: COLORS.ink,
              }}
            >
              {r.reviewer_name || t('reviews.anonymous')}
            </p>
            {r.comment && (
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: COLORS.ink,
                }}
              >
                {r.comment}
              </p>
            )}
            {Array.isArray(r.photos) && r.photos.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginTop: 10,
                }}
              >
                {r.photos.map((src, pi) => (
                  <button
                    key={pi}
                    type="button"
                    onClick={() => setLightbox(src)}
                    aria-label={t('reviews.viewPhoto', { n: pi + 1 })}
                    className="qk-press"
                    style={{
                      width: 64,
                      height: 64,
                      padding: 0,
                      borderRadius: 10,
                      overflow: 'hidden',
                      border: '1px solid rgba(42,34,32,0.12)',
                      background: '#fff',
                      cursor: 'zoom-in',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={t('reviews.photoAlt', { n: pi + 1 })}
                      loading="lazy"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox — full-bleed dim overlay with the zoomed photo. Click anywhere
          (or the close button) to dismiss. */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('reviews.photo')}
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(20,16,15,0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label={t('reviews.closePhoto')}
            style={{
              position: 'absolute',
              top: 18,
              insetInlineEnd: 18,
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.16)',
              color: '#fff',
              fontSize: 24,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt={t('reviews.photo')}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '92vw',
              maxHeight: '88vh',
              borderRadius: 14,
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
              objectFit: 'contain',
            }}
          />
        </div>
      )}
    </div>
  )
}
