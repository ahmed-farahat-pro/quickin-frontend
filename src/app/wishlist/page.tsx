'use client'

// Saved stays + experiences (the user's wishlist). Fetched client-side with the
// bearer token in localStorage (qk_token); signed-out users see a sign-in
// prompt. Reuses the Explore/Services qk-card look. Each card carries a heart so
// the user can un-save in place — removing a card optimistically drops it from
// the grid here. Mirrors the page shell (header + AuthArea + footer) used across
// the public surfaces.
import { useCallback, useEffect, useState } from 'react'
import { getToken, type Listing, type Service } from '@/lib/api'
import { fetchWishlist } from '@/lib/wishlist'
import AuthArea from '../_components/auth-area'
import ImagePlaceholder from '../_components/image-placeholder'
import HeartButton from '../_components/heart-button'
import RatingStars from '../_components/rating-stars'
import { useLanguage } from '@/lib/i18n/language-provider'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  page: '#E4DECF',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  gold: '#B07A2A',
}

const GRAD_BURGUNDY = 'linear-gradient(135deg,#5B0F16,#8a2530)'
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'
const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif'

type State =
  | { kind: 'loading' }
  | { kind: 'anon' }
  | { kind: 'error' }
  | { kind: 'ready'; listings: Listing[]; services: Service[] }

export default function WishlistPage() {
  const { t } = useLanguage()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    if (!getToken()) {
      setState({ kind: 'anon' })
      return
    }
    const controller = new AbortController()
    ;(async () => {
      const data = await fetchWishlist(controller.signal)
      if (controller.signal.aborted) return
      if (!data) {
        // fetchWishlist returns null when signed out OR on error. Token exists
        // here, so treat null as a transient error.
        setState({ kind: 'error' })
        return
      }
      setState({ kind: 'ready', listings: data.listings, services: data.services })
    })()
    return () => controller.abort()
  }, [])

  // Drop a card from the grid when its heart is un-saved (optimistic).
  const removeListing = useCallback((id: string) => {
    setState((prev) =>
      prev.kind === 'ready'
        ? { ...prev, listings: prev.listings.filter((l) => l.id !== id) }
        : prev
    )
  }, [])
  const removeService = useCallback((id: string) => {
    setState((prev) =>
      prev.kind === 'ready'
        ? { ...prev, services: prev.services.filter((s) => s.id !== id) }
        : prev
    )
  }, [])

  const total =
    state.kind === 'ready' ? state.listings.length + state.services.length : 0

  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.page,
        color: COLORS.ink,
        fontFamily: FONT,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{`
        @media (max-width: 440px) {
          .qk-wishlist-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header bar — shared look with Explore / Services. */}
      <header
        style={{
          background: `linear-gradient(180deg, ${COLORS.tan} 0%, ${COLORS.cream} 100%)`,
          borderBottom: `1px solid rgba(91,15,22,0.10)`,
          padding: '20px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <a href="/explore" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <img
              src="/logo.png"
              alt="QuickIn"
              height={40}
              style={{ height: 40, width: 'auto', display: 'block' }}
            />
          </a>
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              fontSize: 14,
              flexWrap: 'wrap',
            }}
          >
            <AuthArea />
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section style={{ background: COLORS.page, padding: '40px 24px 8px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: COLORS.gold,
            }}
          >
            {t('wishlist.eyebrow')}
          </p>
          <h1
            style={{
              margin: 0,
              fontFamily: SERIF,
              fontSize: 'clamp(26px, 4vw, 38px)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: COLORS.burgundy,
            }}
          >
            {t('wishlist.title')}
          </h1>
          {state.kind === 'ready' && total > 0 && (
            <p style={{ margin: '10px 0 4px', fontSize: 15, color: COLORS.muted }}>
              {t(total === 1 ? 'wishlist.countOne' : 'wishlist.countMany', {
                count: total,
              })}
            </p>
          )}
        </div>
      </section>

      {/* Body */}
      <section
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
          padding: '28px 24px 72px',
          flex: 1,
        }}
      >
        {state.kind === 'loading' && (
          <p
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              color: COLORS.muted,
              fontSize: 15,
            }}
          >
            {t('wishlist.loading')}
          </p>
        )}

        {state.kind === 'anon' && (
          <CenterNotice
            title={t('wishlist.signInTitle')}
            body={t('wishlist.signInBody')}
            ctaHref="/login?redirect=/wishlist"
            ctaLabel={t('wishlist.logIn')}
          />
        )}

        {state.kind === 'error' && (
          <CenterNotice
            title={t('wishlist.errorTitle')}
            body={t('wishlist.errorBody')}
            ctaHref="/wishlist"
            ctaLabel={t('wishlist.tryAgain')}
          />
        )}

        {state.kind === 'ready' && total === 0 && (
          <div
            style={{
              background: '#fff',
              borderRadius: 22,
              border: `1px solid rgba(42,34,32,0.06)`,
              boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
              padding: '56px 24px',
              textAlign: 'center',
              color: COLORS.muted,
            }}
          >
            <div
              className="qk-pop"
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                background: COLORS.tan,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 18px',
              }}
            >
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke={COLORS.burgundy}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8Z" />
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 600, color: COLORS.ink }}>
              {t('wishlist.emptyTitle')}
            </p>
            <p style={{ margin: '8px 0 20px', fontSize: 15 }}>
              {t('wishlist.emptyBody')}
            </p>
            <a
              href="/explore"
              className="qk-press"
              style={{
                display: 'inline-block',
                color: '#fff',
                background: GRAD_BURGUNDY,
                textDecoration: 'none',
                fontWeight: 700,
                padding: '11px 24px',
                borderRadius: 999,
                boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
              }}
            >
              {t('wishlist.browseStays')}
            </a>
          </div>
        )}

        {state.kind === 'ready' && total > 0 && (
          <div
            className="qk-wishlist-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 28,
            }}
          >
            {state.listings.map((listing) => (
              <SavedListingCard
                key={`l-${listing.id}`}
                listing={listing}
                onRemoved={() => removeListing(listing.id)}
              />
            ))}
            {state.services.map((service) => (
              <SavedServiceCard
                key={`s-${service.id}`}
                service={service}
                onRemoved={() => removeService(service.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Footer (matches the Services page footer) */}
      <footer
        style={{
          background: 'linear-gradient(180deg,#5B0F16,#45070d)',
          color: COLORS.cream,
          padding: '32px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            fontSize: 13,
            color: 'rgba(246,241,230,0.7)',
          }}
        >
          {t('footer.copyright')}
        </div>
      </footer>
    </main>
  )
}

// A saved-listing card — same rounded look as the Explore grid, with a heart to
// remove it (filled, since everything here is already saved).
function SavedListingCard({
  listing,
  onRemoved,
}: {
  listing: Listing
  onRemoved: () => void
}) {
  const { t } = useLanguage()
  const cover = listing.listing_images[0]?.url || null
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
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <ImagePlaceholder />
        )}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, transparent 45%, rgba(42,34,32,0.6))',
            pointerEvents: 'none',
          }}
        />
        <span style={{ position: 'absolute', top: 12, insetInlineEnd: 12, zIndex: 2 }}>
          <HeartButton
            itemType="listing"
            itemId={listing.id}
            initialSaved
            onChange={(saved) => {
              if (!saved) onRemoved()
            }}
          />
        </span>
      </div>

      <div style={{ padding: '16px 20px 22px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.3, color: COLORS.ink }}>
            {listing.title}
          </h2>
          <span style={{ flex: '0 0 auto' }}>
            <RatingStars
              rating={listing.rating ?? 0}
              reviewCount={listing.review_count ?? 0}
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
            EGP {listing.price_per_night}
          </span>{' '}
          <span style={{ color: COLORS.muted }}>{t('listing.perNight')}</span>
        </p>
      </div>
    </a>
  )
}

// A saved-service card — mirrors the Services grid card, with a heart to remove.
function SavedServiceCard({
  service,
  onRemoved,
}: {
  service: Service
  onRemoved: () => void
}) {
  const cover = service.image_url || null
  return (
    <a
      href={`/services/${service.id}`}
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
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '4 / 3',
          overflow: 'hidden',
          background: COLORS.tan,
        }}
      >
        {cover ? (
          <img
            src={cover}
            alt={service.title}
            loading="lazy"
            className="qk-img-zoom"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <ImagePlaceholder />
        )}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, transparent 45%, rgba(42,34,32,0.6))',
            pointerEvents: 'none',
          }}
        />
        <span style={{ position: 'absolute', top: 12, insetInlineEnd: 12, zIndex: 2 }}>
          <HeartButton
            itemType="service"
            itemId={service.id}
            initialSaved
            onChange={(saved) => {
              if (!saved) onRemoved()
            }}
          />
        </span>
        {service.category && (
          <span
            style={{
              position: 'absolute',
              top: 14,
              insetInlineStart: 14,
              background: 'rgba(255,255,255,0.94)',
              color: COLORS.gold,
              fontSize: 12,
              fontWeight: 700,
              padding: '6px 12px',
              borderRadius: 999,
              boxShadow: '0 4px 12px rgba(42,34,32,0.16)',
            }}
          >
            {service.category}
          </span>
        )}
      </div>

      <div style={{ padding: '18px 20px 22px' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.3, color: COLORS.ink }}>
          {service.title}
        </h2>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: COLORS.muted }}>
          {[service.host_name, service.location].filter(Boolean).join(' · ') ||
            'QuickIn host'}
        </p>
        <p style={{ margin: '14px 0 0', fontSize: 15, color: COLORS.ink }}>
          <span style={{ fontWeight: 700, color: COLORS.burgundy }}>
            EGP {service.price}
          </span>
        </p>
      </div>
    </a>
  )
}

function CenterNotice({
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  title: string
  body: string
  ctaHref: string
  ctaLabel: string
}) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 24px', color: COLORS.muted }}>
      <h1
        style={{
          margin: 0,
          fontFamily: SERIF,
          fontSize: 28,
          fontWeight: 700,
          color: COLORS.burgundy,
        }}
      >
        {title}
      </h1>
      <p style={{ margin: '12px auto 22px', fontSize: 15, maxWidth: 420 }}>{body}</p>
      <a
        href={ctaHref}
        className="qk-press"
        style={{
          display: 'inline-block',
          color: '#fff',
          background: GRAD_BURGUNDY,
          textDecoration: 'none',
          fontWeight: 700,
          padding: '12px 26px',
          borderRadius: 999,
          boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
        }}
      >
        {ctaLabel}
      </a>
    </div>
  )
}
