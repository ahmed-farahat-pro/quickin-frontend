'use client'

// The canonical explore "qk-card" — a single listing tile: rounded cover image
// (or a clean placeholder), a wishlist heart, an optional guest-favorite star
// badge, the title + rating, location, and "EGP X / night" in the active
// display currency. Extracted here so every surface (Explore grid, AI results,
// the host profile page) renders the exact same card.
//
// `saved` pre-lights the heart from a shared wishlist fetch. `onRemoved` lets a
// grid drop the card when the heart is un-saved (e.g. the wishlist page).
import { type Listing } from '@/lib/api'
import { useLanguage } from '@/lib/i18n/language-provider'
import { useCurrency } from '@/lib/currency/currency-provider'
import ImagePlaceholder from './image-placeholder'
import HeartButton from './heart-button'
import RatingStars from './rating-stars'

const COLORS = {
  burgundy: '#5B0F16',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

export default function ListingCard({
  listing,
  saved = false,
  onRemoved,
}: {
  listing: Listing
  saved?: boolean
  onRemoved?: () => void
}) {
  const { t } = useLanguage()
  const { format } = useCurrency()
  const cover = listing.listing_images[0]?.url || null
  const reviewCount = listing.review_count ?? 0
  const rating = listing.rating ?? 0
  return (
    <a
      href={`/explore/${listing.id}`}
      className="qk-card"
      style={{
        display: 'block',
        background: '#fff',
        borderRadius: 22,
        overflow: 'hidden',
        textDecoration: 'none',
        color: 'inherit',
        boxShadow: '0 8px 22px rgba(42,34,32,0.10)',
        border: '1px solid rgba(42,34,32,0.05)',
        cursor: 'pointer',
      }}
    >
      {/* Cover */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '4 / 3',
          overflow: 'hidden',
          background: COLORS.tan,
          borderRadius: 22,
        }}
      >
        {cover ? (
          <img
            src={cover}
            alt={listing.title}
            loading="lazy"
            className="qk-img-zoom"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          <ImagePlaceholder />
        )}

        {/* Photo legibility overlay */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, transparent 45%, rgba(42,34,32,0.6))',
            pointerEvents: 'none',
          }}
        />

        {/* Heart — interactive wishlist toggle. Sits above the card's <a>; the
            button stops the click from navigating. */}
        <span
          style={{
            position: 'absolute',
            top: 12,
            insetInlineEnd: 12,
            zIndex: 2,
          }}
        >
          <HeartButton
            itemType="listing"
            itemId={listing.id}
            initialSaved={saved}
            onChange={(s) => {
              if (!s) onRemoved?.()
            }}
          />
        </span>

        {listing.is_guest_favorite && (
          <span
            className="qk-pop"
            style={{
              position: 'absolute',
              top: 14,
              insetInlineStart: 14,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: 'rgba(255,255,255,0.94)',
              color: COLORS.ink,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.01em',
              padding: '6px 12px',
              borderRadius: 999,
              boxShadow: '0 4px 12px rgba(42,34,32,0.16)',
            }}
          >
            <span className="qk-star" aria-hidden="true">
              ★
            </span>{' '}
            {t('listing.guestFavorite')}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '16px 20px 22px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              lineHeight: 1.3,
              color: COLORS.ink,
            }}
          >
            {listing.title}
          </h2>
          {/* Real rating: gold ★ + average, or "New" when no reviews yet. */}
          <span style={{ flex: '0 0 auto' }}>
            <RatingStars
              rating={rating}
              reviewCount={reviewCount}
              size={13}
              showCount={false}
            />
          </span>
        </div>
        {listing.location && (
          <p style={{ margin: '6px 0 0', fontSize: 14, color: COLORS.muted }}>
            {listing.location}
          </p>
        )}
        <p style={{ margin: '14px 0 0', fontSize: 15, color: COLORS.ink }}>
          <span style={{ fontWeight: 700, color: COLORS.burgundy }}>
            {format(listing.price_per_night)}
          </span>{' '}
          <span style={{ color: COLORS.muted }}>{t('listing.perNight')}</span>
        </p>
      </div>
    </a>
  )
}
