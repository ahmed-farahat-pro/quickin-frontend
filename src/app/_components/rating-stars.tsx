'use client'

// Read-only rating display: a gold ★ + the average + "(N)" review count. Shows
// the localized "New" label when there are no reviews yet. Used on the listing
// detail page (and reusable elsewhere). The gold star matches the redesign's
// .qk-star token (#B07A2A).
import { useLanguage } from '@/lib/i18n/language-provider'

const GOLD = '#B07A2A'
const INK = '#2A2220'
const MUTED = '#6B6055'

export default function RatingStars({
  rating,
  reviewCount,
  size = 15,
  showCount = true,
}: {
  rating: number
  reviewCount: number
  size?: number
  showCount?: boolean
}) {
  const { t } = useLanguage()

  // No reviews yet → a calm "New" pill instead of a fake 0.0 / 5.0.
  if (!reviewCount || reviewCount <= 0) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: size,
          fontWeight: 700,
          color: INK,
        }}
      >
        <span className="qk-star" aria-hidden="true" style={{ fontSize: size + 1 }}>
          ★
        </span>
        {t('reviews.new')}
      </span>
    )
  }

  const avg = rating.toFixed(1)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 5,
        fontSize: size,
        fontWeight: 700,
        color: INK,
      }}
    >
      <span className="qk-star" aria-hidden="true" style={{ fontSize: size + 1 }}>
        ★
      </span>
      <span>{avg}</span>
      {showCount && (
        <span style={{ color: MUTED, fontWeight: 600 }}>
          (
          {t(reviewCount === 1 ? 'reviews.countOne' : 'reviews.countMany', {
            count: reviewCount,
          })}
          )
        </span>
      )}
    </span>
  )
}

export { GOLD }
