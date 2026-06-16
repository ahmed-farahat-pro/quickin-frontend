// Listing detail (UI-only) — boutique stay view. Data is fetched from the
// backend API; a missing/unknown id renders the friendly 404.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { API_URL, type Listing } from '@/lib/api'
import ReservePanel from './reserve-panel'
import ReviewsSection from './reviews-section'
import { HostedBy, MoreFromHost } from './host-section'
import ReportListing from './report-listing'
import ImagePlaceholder from '../../_components/image-placeholder'
import AmenityIcon from '../../_components/amenity-icon'
import HeartButton from '../../_components/heart-button'
import ShareButton from '../../_components/share-button'
import RatingStars from '../../_components/rating-stars'
import { JsonLd, listingLd, breadcrumbLd } from '../../_components/structured-data'
import { T, BackToExplore, GuestFavoriteBadge } from './detail-text'

export const dynamic = 'force-dynamic'

// Fetch a single listing from the backend. Returns null on 404 / error.
async function fetchListing(id: string): Promise<Listing | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/local/listings/${encodeURIComponent(id)}`,
      { cache: 'no-store' }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data && typeof data === 'object' ? (data as Listing) : null
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const listing = await fetchListing(id)

  if (!listing) {
    return {
      title: 'Stay not found',
      description:
        'This boutique stay could not be found. Browse other curated homes on QuickIn.',
      robots: { index: false, follow: true },
    }
  }

  const place = [listing.location, listing.country].filter(Boolean).join(', ')
  const description =
    listing.description?.trim() ||
    `A boutique stay${place ? ` in ${place}` : ''} from EGP ${listing.price_per_night} / night on QuickIn.`
  const cover = listing.listing_images[0]?.url || '/logo.png'

  return {
    title: listing.title,
    description: description.slice(0, 160),
    alternates: { canonical: `/explore/${listing.id}` },
    openGraph: {
      title: `${listing.title} | QuickIn`,
      description: description.slice(0, 200),
      url: `/explore/${listing.id}`,
      type: 'website',
      siteName: 'QuickIn',
      images: [{ url: cover, alt: listing.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${listing.title} | QuickIn`,
      description: description.slice(0, 200),
      images: [cover],
    },
  }
}

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  page: '#E4DECF',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  gold: '#B07A2A',
}

function Spec({ labelKey, value }: { labelKey: string; value: number | null }) {
  if (value == null) return null
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: 84,
      }}
    >
      <span style={{ fontSize: 20, fontWeight: 700, color: COLORS.ink }}>
        {value}
      </span>
      <span style={{ fontSize: 13, color: COLORS.muted }}>
        <T k={labelKey} />
      </span>
    </div>
  )
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const listing = await fetchListing(id)
  if (!listing) notFound()

  const images = listing.listing_images
  const hero = images[0]?.url || null
  const thumbs = images.slice(1)
  const amenities = (listing.amenities || []).filter(Boolean)

  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.page,
        color: COLORS.ink,
        fontFamily:
          '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Rich-result + AEO structured data for this stay. */}
      <JsonLd data={listingLd(listing)} />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', url: '/' },
          { name: 'Explore', url: '/explore' },
          { name: listing.title, url: `/explore/${listing.id}` },
        ])}
      />
      {/* On phones the details + reserve panel stack into one column and the
          sticky panel becomes static. Inline styles can't hold media queries. */}
      <style>{`
        @media (max-width: 760px) {
          .qk-detail-grid {
            grid-template-columns: 1fr !important;
          }
          .qk-detail-aside {
            position: static !important;
            top: auto !important;
          }
        }
        @media (max-width: 440px) {
          .qk-amenity-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 24px 72px' }}>
        {/* Back link (localized client helper) */}
        <BackToExplore />

        {/* Hero — slow Ken Burns drift on the cover, photo overlay for depth. */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 9',
            borderRadius: 24,
            overflow: 'hidden',
            background: COLORS.tan,
            boxShadow: '0 22px 48px rgba(42,34,32,0.18)',
          }}
        >
          {hero ? (
            <>
              <img
                src={hero}
                alt={listing.title}
                className="qk-kenburns"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg, transparent 55%, rgba(42,34,32,0.45))',
                  pointerEvents: 'none',
                }}
              />
            </>
          ) : (
            <ImagePlaceholder iconSize={52} fontSize={15} />
          )}
        </div>

        {/* Thumbnail strip */}
        {thumbs.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 12,
              overflowX: 'auto',
              padding: '16px 2px 4px',
            }}
          >
            {thumbs.map((img, i) => (
              <img
                key={`${img.url}-${i}`}
                src={img.url}
                alt={`${listing.title} photo ${i + 2}`}
                loading="lazy"
                style={{
                  width: 132,
                  height: 96,
                  flex: '0 0 auto',
                  objectFit: 'cover',
                  borderRadius: 14,
                  background: COLORS.tan,
                  boxShadow: '0 3px 12px rgba(42,34,32,0.10)',
                }}
              />
            ))}
          </div>
        )}

        {/* Title + location */}
        <div style={{ marginTop: 34 }}>
          {listing.is_guest_favorite && (
            <GuestFavoriteBadge background={COLORS.tan} />
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontFamily:
                  '"Playfair Display", Georgia, "Times New Roman", serif',
                fontSize: 'clamp(28px, 4.5vw, 42px)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
                color: COLORS.burgundy,
              }}
            >
              {listing.title}
            </h1>
            {/* Share + wishlist heart — stand alone here (no parent link). */}
            <span
              style={{ flex: '0 0 auto', marginTop: 4, display: 'flex', gap: 10 }}
            >
              <ShareButton
                path={`/explore/${listing.id}`}
                title={`${listing.title} | QuickIn`}
                size={44}
              />
              <HeartButton
                itemType="listing"
                itemId={listing.id}
                size={44}
                stopPropagation={false}
                autoFetchSaved
              />
            </span>
          </div>
          {/* Real rating: gold ★ + average + count, or "New" when no reviews. */}
          <div style={{ marginTop: 10 }}>
            <RatingStars
              rating={listing.rating ?? 0}
              reviewCount={listing.review_count ?? 0}
              size={15}
            />
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 16, color: COLORS.muted }}>
            {[listing.location, listing.country].filter(Boolean).join(', ')}
            {listing.property_type ? ` · ${listing.property_type}` : ''}
          </p>
        </div>

        {/* Two-column: details + price card */}
        <div
          className="qk-detail-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 320px)',
            gap: 36,
            marginTop: 30,
            alignItems: 'start',
          }}
        >
          <div>
            {/* Specs row */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 28,
                padding: '20px 0 24px',
                borderTop: `1px solid rgba(42,34,32,0.10)`,
                borderBottom: `1px solid rgba(42,34,32,0.10)`,
              }}
            >
              <Spec labelKey="listing.spec.guests" value={listing.max_guests} />
              <Spec labelKey="listing.spec.bedrooms" value={listing.bedrooms} />
              <Spec labelKey="listing.spec.beds" value={listing.beds} />
              <Spec labelKey="listing.spec.baths" value={listing.bathrooms} />
            </div>

            {/* Description */}
            {listing.description && (
              <div style={{ marginTop: 26 }}>
                <h2
                  style={{
                    margin: '0 0 10px',
                    fontSize: 19,
                    fontWeight: 700,
                    color: COLORS.ink,
                  }}
                >
                  <T k="listing.aboutThisStay" />
                </h2>
                <p
                  style={{
                    margin: 0,
                    fontSize: 16,
                    lineHeight: 1.7,
                    color: COLORS.ink,
                  }}
                >
                  {listing.description}
                </p>
              </div>
            )}

            {/* What this place offers (amenities) */}
            {amenities.length > 0 && (
              <div style={{ marginTop: 30 }}>
                <h2
                  style={{
                    margin: '0 0 16px',
                    fontSize: 19,
                    fontWeight: 700,
                    color: COLORS.ink,
                  }}
                >
                  <T k="listing.whatThisPlaceOffers" />
                </h2>
                <div
                  className="qk-amenity-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '14px 24px',
                  }}
                >
                  {amenities.map((a) => (
                    <div
                      key={a}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        fontSize: 15,
                        color: COLORS.ink,
                      }}
                    >
                      <span
                        style={{
                          flex: '0 0 auto',
                          width: 38,
                          height: 38,
                          borderRadius: 12,
                          background: 'linear-gradient(135deg,#e7ddcb,#d8cdb8)',
                          color: COLORS.burgundy,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <AmenityIcon name={a} />
                      </span>
                      <span>{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Host — "Hosted by {name}" with a gold-gradient avatar + trust
                badges (Verified ✓, Superhost, New host). */}
            {(listing.host_name || listing.host_id) && (
              <HostedBy
                name={listing.host_name}
                hostId={listing.host_id}
                hostVerified={listing.host_verified}
              />
            )}

            {/* Report this listing — opens a small dialog (sign-in required). */}
            <ReportListing listingId={listing.id} />

            {/* Guest reviews (client-fetched). Renders nothing until it has at
                least one review — the "New" badge by the title covers empty. */}
            <ReviewsSection listingId={listing.id} />
          </div>

          {/* Reserve panel */}
          <aside
            className="qk-detail-aside"
            style={{
              background: '#fff',
              borderRadius: 22,
              border: `1px solid rgba(42,34,32,0.06)`,
              boxShadow: '0 22px 48px rgba(42,34,32,0.14)',
              padding: '24px 24px 26px',
              position: 'sticky',
              top: 24,
            }}
          >
            <ReservePanel
              listingId={listing.id}
              pricePerNight={listing.price_per_night}
              currency={listing.currency}
              maxGuests={listing.max_guests}
              cancellationPolicy={listing.cancellation_policy ?? 'moderate'}
              weeklyDiscount={listing.weekly_discount ?? 0}
              monthlyDiscount={listing.monthly_discount ?? 0}
            />
            {listing.listing_code && (
              <div
                style={{
                  marginTop: 20,
                  paddingTop: 18,
                  borderTop: `1px solid rgba(42,34,32,0.10)`,
                  fontSize: 13,
                  color: COLORS.muted,
                }}
              >
                <T k="listing.listingCode" />{' '}
                <span
                  style={{
                    fontFamily:
                      '"Geist Mono", ui-monospace, SFMono-Regular, monospace',
                    fontWeight: 600,
                    color: COLORS.ink,
                  }}
                >
                  {listing.listing_code}
                </span>
              </div>
            )}
          </aside>
        </div>

        {/* More from this host — full-width below the two-column area. Fetches
            the host's other published listings and hides itself if there are
            none (or no host id is known). */}
        {listing.host_id && (
          <MoreFromHost hostId={listing.host_id} currentListingId={listing.id} />
        )}
      </div>
    </main>
  )
}
