'use client'

// Host bits for the listing detail page (a server component). Two pieces:
//
//  • HostedBy — the "Hosted by {name}" line with a gold-gradient avatar showing
//    the host's initial. Pure presentation; safe to render on the server shell.
//
//  • MoreFromHost — fetches the host's other published listings
//    (GET /api/local/listings?host=<host_id>), drops the current listing, and
//    renders the rest as qk-cards linking to their detail pages. Renders nothing
//    while loading or when the host has no other stays.
//
// Both opt into the client-side i18n context so their labels localize (and stay
// RTL-safe via logical properties).
import { useEffect, useState } from 'react'
import {
  API_URL,
  getPublicProfile,
  type Listing,
  type TrustBadgeSet,
} from '@/lib/api'
import { useLanguage } from '@/lib/i18n/language-provider'
import ImagePlaceholder from '../../_components/image-placeholder'
import RatingStars from '../../_components/rating-stars'
import TrustBadges from '../../_components/trust-badges'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  gold: '#B07A2A',
}
const GRAD_GOLD = 'linear-gradient(135deg,#B07A2A,#d8a55a)'

// First letter of the host name, upper-cased; falls back to a neutral dot.
function initialOf(name: string | null | undefined): string {
  const c = (name ?? '').trim().charAt(0)
  return c ? c.toUpperCase() : '·'
}

// "Hosted by {name}" with a gold-gradient avatar (the host's initial) plus the
// host's trust badges (Verified ✓, Superhost, New host).
//
// The verified chip lights up immediately from the listing's `hostVerified`
// flag (no round-trip). When a `hostId` is known we additionally fetch the
// host's public profile (GET /api/local/users/:id) to surface the full badge
// set; that fetch only ever ADDS badges, so the line is correct on first paint.
export function HostedBy({
  name,
  hostId,
  hostVerified,
}: {
  name: string | null | undefined
  hostId?: string | null
  hostVerified?: boolean
}) {
  const { t } = useLanguage()
  const display = (name ?? '').trim() || t('host.aHost')
  const [badges, setBadges] = useState<TrustBadgeSet | null>(null)

  useEffect(() => {
    if (!hostId) return
    let cancelled = false
    getPublicProfile(hostId).then((p) => {
      if (!cancelled && p) setBadges(p.badges)
    })
    return () => {
      cancelled = true
    }
  }, [hostId])

  // Avatar (gold-gradient initial) + the "Hosted by / {name}" lines. When a
  // hostId is known these are wrapped in a Link to the host's public profile;
  // otherwise they render as static markup.
  const avatar = (
    <span
      aria-hidden="true"
      style={{
        flex: '0 0 auto',
        width: 52,
        height: 52,
        borderRadius: 999,
        background: GRAD_GOLD,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 22,
        fontWeight: 800,
        boxShadow: '0 8px 20px rgba(176,122,42,0.35)',
      }}
    >
      {initialOf(name)}
    </span>
  )

  const nameLines = (
    <div style={{ minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 13, color: COLORS.muted }}>
        {t('host.hostedByLabel')}
      </p>
      <p
        style={{
          margin: '2px 0 0',
          fontSize: 19,
          fontWeight: 700,
          color: COLORS.ink,
        }}
      >
        {display}
      </p>
      {hostId && (
        <span
          style={{
            display: 'inline-block',
            marginTop: 3,
            fontSize: 13,
            fontWeight: 700,
            color: COLORS.gold,
          }}
        >
          {t('host.viewProfile')} →
        </span>
      )}
    </div>
  )

  return (
    <div
      style={{
        marginTop: 30,
        paddingTop: 24,
        borderTop: `1px solid rgba(42,34,32,0.10)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {hostId ? (
          <a
            href={`/host-profile/${encodeURIComponent(hostId)}`}
            className="qk-pop"
            aria-label={t('host.viewProfileOf', { name: display })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              textDecoration: 'none',
              color: 'inherit',
              cursor: 'pointer',
              borderRadius: 16,
            }}
          >
            {avatar}
            {nameLines}
          </a>
        ) : (
          <>
            {avatar}
            {nameLines}
          </>
        )}
      </div>
      <TrustBadges
        badges={badges}
        verifiedOverride={!!hostVerified}
        style={{ marginTop: 12 }}
      />
    </div>
  )
}

// "More from this host" — the host's other published listings as qk-cards.
export function MoreFromHost({
  hostId,
  currentListingId,
}: {
  hostId: string
  currentListingId: string
}) {
  const { t } = useLanguage()
  const [listings, setListings] = useState<Listing[] | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/local/listings?host=${encodeURIComponent(hostId)}`
        )
        if (!res.ok) {
          if (!cancelled) setListings([])
          return
        }
        const data = await res.json()
        const all = Array.isArray(data) ? (data as Listing[]) : []
        // Drop the listing the visitor is already viewing.
        if (!cancelled) setListings(all.filter((l) => l.id !== currentListingId))
      } catch {
        if (!cancelled) setListings([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hostId, currentListingId])

  // Loading, or the host has no other stays → render nothing.
  if (!listings || listings.length === 0) return null

  return (
    <div style={{ marginTop: 40 }}>
      <h2
        style={{
          margin: '0 0 16px',
          fontSize: 19,
          fontWeight: 700,
          color: COLORS.ink,
        }}
      >
        {t('host.moreFromHost')}
      </h2>

      <div
        className="qk-host-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 20,
        }}
      >
        <style>{`
          @media (max-width: 440px) {
            .qk-host-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>

        {listings.map((listing) => (
          <HostListingCard key={listing.id} listing={listing} />
        ))}
      </div>
    </div>
  )
}

// A compact qk-card for the "More from this host" grid — cover, title, rating,
// and price; the whole card links to the stay's detail page.
function HostListingCard({ listing }: { listing: Listing }) {
  const { t } = useLanguage()
  const cover = listing.listing_images[0]?.url || null
  return (
    <a
      href={`/explore/${listing.id}`}
      className="qk-card"
      style={{
        display: 'block',
        background: '#fff',
        borderRadius: 20,
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
          borderRadius: 20,
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
            background: 'linear-gradient(180deg, transparent 45%, rgba(42,34,32,0.55))',
            pointerEvents: 'none',
          }}
        />
      </div>

      <div style={{ padding: '14px 16px 18px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.3, color: COLORS.ink }}>
            {listing.title}
          </h3>
          <span style={{ flex: '0 0 auto' }}>
            <RatingStars
              rating={listing.rating ?? 0}
              reviewCount={listing.review_count ?? 0}
              size={12}
              showCount={false}
            />
          </span>
        </div>
        {listing.location && (
          <p style={{ margin: '5px 0 0', fontSize: 13, color: COLORS.muted }}>
            {listing.location}
          </p>
        )}
        <p style={{ margin: '12px 0 0', fontSize: 14, color: COLORS.ink }}>
          <span style={{ fontWeight: 700, color: COLORS.burgundy }}>
            EGP {listing.price_per_night}
          </span>{' '}
          <span style={{ color: COLORS.muted }}>{t('listing.perNight')}</span>
        </p>
      </div>
    </a>
  )
}
