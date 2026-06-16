'use client'

// Public host profile — reached by tapping the "Hosted by …" area on a listing
// detail page. Shows ONLY what's safe to surface publicly (the backend's
// /users/:id endpoint deliberately omits email/phone, and we never request or
// render them here):
//
//   • avatar (gold-gradient initial) + name + TrustBadges (Verified / Superhost
//     / New host) + "member since" + host rating
//   • a short bio when present
//   • "Reviews" — every review left across the host's listings (stars, comment,
//     reviewer, the listing it was left on, and any attached photos)
//   • a grid of the host's other published listings (the shared ListingCard)
//
// All three datasets come from the deployed backend:
//   GET /api/local/users/:id              → profile + badges
//   GET /api/local/users/:id/reviews      → reviews across the host's listings
//   GET /api/local/listings?host=:id      → the host's published listings
//
// Fetched client-side (mirrors the other client pages) so it can reuse the
// i18n + currency contexts and the shared card. Fully bilingual + RTL-safe.
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { fetchWishlistIds } from '@/lib/wishlist'
import {
  getHostListings,
  getHostReviews,
  getPublicProfile,
  type HostReview,
  type Listing,
  type PublicProfile,
} from '@/lib/api'
import AuthArea from '../../_components/auth-area'
import ListingCard from '../../_components/listing-card'
import TrustBadges from '../../_components/trust-badges'
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
const GRAD_GOLD = 'linear-gradient(135deg,#B07A2A,#d8a55a)'
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'
const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif'

function initialOf(name: string | null | undefined): string {
  const c = (name ?? '').trim().charAt(0)
  return c ? c.toUpperCase() : '·'
}

// Render `n` gold stars (out of 5) for one review.
function Stars({ n }: { n: number }) {
  const full = Math.max(0, Math.min(5, Math.round(n)))
  return (
    <span aria-hidden="true" style={{ letterSpacing: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          style={{
            color: i < full ? COLORS.gold : 'rgba(42,34,32,0.20)',
            fontSize: 15,
          }}
        >
          ★
        </span>
      ))}
    </span>
  )
}

type Status = 'loading' | 'ready' | 'notfound' | 'error'

export default function HostProfilePage() {
  const params = useParams<{ id: string }>()
  const hostId = params?.id ?? ''
  const { t, lang } = useLanguage()
  const locale = lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US'

  const [status, setStatus] = useState<Status>('loading')
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [reviews, setReviews] = useState<HostReview[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [lightbox, setLightbox] = useState<string | null>(null)

  // Load profile + reviews + listings together. The profile drives the page; if
  // it's missing we show a friendly "host not found". Reviews/listings degrade
  // to empty independently.
  useEffect(() => {
    if (!hostId) {
      setStatus('notfound')
      return
    }
    const controller = new AbortController()
    setStatus('loading')
    ;(async () => {
      try {
        const [p, r, l] = await Promise.all([
          getPublicProfile(hostId, controller.signal),
          getHostReviews(hostId, controller.signal),
          getHostListings(hostId, controller.signal),
        ])
        if (controller.signal.aborted) return
        if (!p) {
          setStatus('notfound')
          return
        }
        setProfile(p)
        setReviews(r)
        setListings(l)
        setStatus('ready')
      } catch {
        if (!controller.signal.aborted) setStatus('error')
      }
    })()
    return () => controller.abort()
  }, [hostId])

  // Pre-light hearts on the host's listings from the signed-in user's wishlist.
  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      const { listingIds } = await fetchWishlistIds(controller.signal)
      if (!controller.signal.aborted) setSavedIds(listingIds)
    })()
    return () => controller.abort()
  }, [])

  const displayName = (profile?.full_name ?? '').trim() || t('host.aHost')

  const memberSince = useMemo(() => {
    const iso = profile?.badges.memberSince
    if (!iso) return null
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  }, [profile, locale])

  function fmtDate(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  // The host rating to show: prefer the computed host badge rating, fall back to
  // the guest_rating the profile carries. Only shown when there are reviews.
  const hostRating = profile?.badges.hostRating || 0
  const hostReviewCount = profile?.badges.reviewCount || reviews.length

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
        @media (max-width: 560px) {
          .qk-host-reviews { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 440px) {
          .qk-host-listings { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header bar — shared look with Explore / Wishlist. */}
      <header
        style={{
          background: `linear-gradient(180deg, ${COLORS.tan} 0%, ${COLORS.cream} 100%)`,
          borderBottom: `1px solid rgba(91,15,22,0.10)`,
          padding: '20px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 1100,
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

      <section
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
          padding: '28px 24px 72px',
          flex: 1,
        }}
      >
        {/* Back to the listing the visitor came from (history), else Explore. */}
        <BackLink label={t('host.back')} />

        {status === 'loading' && (
          <p
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              color: COLORS.muted,
              fontSize: 15,
            }}
          >
            {t('host.loading')}
          </p>
        )}

        {status === 'notfound' && (
          <CenterNotice
            title={t('host.notFoundTitle')}
            body={t('host.notFoundBody')}
            ctaHref="/explore"
            ctaLabel={t('host.browseStays')}
          />
        )}

        {status === 'error' && (
          <CenterNotice
            title={t('host.errorTitle')}
            body={t('host.errorBody')}
            ctaHref={`/host-profile/${encodeURIComponent(hostId)}`}
            ctaLabel={t('host.tryAgain')}
          />
        )}

        {status === 'ready' && profile && (
          <>
            {/* Profile header card */}
            <div
              style={{
                background: '#fff',
                borderRadius: 24,
                border: '1px solid rgba(42,34,32,0.06)',
                boxShadow: '0 16px 40px rgba(42,34,32,0.10)',
                padding: '28px 26px',
                display: 'flex',
                gap: 20,
                alignItems: 'flex-start',
                flexWrap: 'wrap',
              }}
            >
              {/* Avatar — the host's photo, or a gold-gradient initial. */}
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={displayName}
                  style={{
                    flex: '0 0 auto',
                    width: 84,
                    height: 84,
                    borderRadius: 999,
                    objectFit: 'cover',
                    boxShadow: '0 8px 20px rgba(42,34,32,0.18)',
                  }}
                />
              ) : (
                <span
                  aria-hidden="true"
                  style={{
                    flex: '0 0 auto',
                    width: 84,
                    height: 84,
                    borderRadius: 999,
                    background: GRAD_GOLD,
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 34,
                    fontWeight: 800,
                    boxShadow: '0 8px 20px rgba(176,122,42,0.35)',
                  }}
                >
                  {initialOf(profile.full_name)}
                </span>
              )}

              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: COLORS.gold,
                  }}
                >
                  {t('host.eyebrow')}
                </p>
                <h1
                  style={{
                    margin: '6px 0 0',
                    fontFamily: SERIF,
                    fontSize: 'clamp(26px, 4vw, 36px)',
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    color: COLORS.burgundy,
                    lineHeight: 1.1,
                  }}
                >
                  {displayName}
                </h1>

                {/* Trust badges (Verified / Superhost / New host). */}
                <TrustBadges badges={profile.badges} style={{ marginTop: 12 }} />

                {/* Stat row: host rating + member since. */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '6px 18px',
                    marginTop: 14,
                    fontSize: 14,
                    color: COLORS.ink,
                  }}
                >
                  {hostReviewCount > 0 && hostRating > 0 ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontWeight: 700,
                      }}
                    >
                      <span className="qk-star" aria-hidden="true" style={{ fontSize: 16 }}>
                        ★
                      </span>
                      {hostRating.toFixed(1)}
                      <span style={{ color: COLORS.muted, fontWeight: 600 }}>
                        ·{' '}
                        {t(
                          hostReviewCount === 1
                            ? 'reviews.countOne'
                            : 'reviews.countMany',
                          { count: hostReviewCount }
                        )}
                      </span>
                    </span>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontWeight: 700,
                      }}
                    >
                      <span className="qk-star" aria-hidden="true" style={{ fontSize: 16 }}>
                        ★
                      </span>
                      {t('reviews.new')}
                    </span>
                  )}

                  {memberSince && (
                    <span style={{ color: COLORS.muted }}>
                      {t('host.memberSince', { date: memberSince })}
                    </span>
                  )}

                  {profile.badges.completedStays > 0 && (
                    <span style={{ color: COLORS.muted }}>
                      {t(
                        profile.badges.completedStays === 1
                          ? 'host.completedStayOne'
                          : 'host.completedStayMany',
                        { count: profile.badges.completedStays }
                      )}
                    </span>
                  )}
                </div>

                {/* Bio */}
                {profile.bio?.trim() && (
                  <p
                    style={{
                      margin: '16px 0 0',
                      fontSize: 15,
                      lineHeight: 1.7,
                      color: COLORS.ink,
                    }}
                  >
                    {profile.bio}
                  </p>
                )}
              </div>
            </div>

            {/* Reviews about the host's listings */}
            <div style={{ marginTop: 40 }}>
              <h2
                style={{
                  margin: '0 0 16px',
                  fontSize: 20,
                  fontWeight: 700,
                  color: COLORS.ink,
                }}
              >
                {reviews.length === 0
                  ? t('host.reviewsTitle')
                  : t(
                      reviews.length === 1
                        ? 'host.reviewsTitleOne'
                        : 'host.reviewsTitleMany',
                      { count: reviews.length }
                    )}
              </h2>

              {reviews.length === 0 ? (
                <p
                  style={{
                    margin: 0,
                    padding: '24px',
                    background: '#fff',
                    borderRadius: 18,
                    border: '1px solid rgba(42,34,32,0.06)',
                    color: COLORS.muted,
                    fontSize: 15,
                  }}
                >
                  {t('host.noReviews')}
                </p>
              ) : (
                <div
                  className="qk-host-reviews"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '16px 24px',
                  }}
                >
                  {reviews.map((r) => (
                    <div
                      key={r.id}
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
                      {/* Which listing this review was left on — links to it. */}
                      {r.listing_title && (
                        <a
                          href={`/explore/${encodeURIComponent(r.listing_id)}`}
                          style={{
                            display: 'inline-block',
                            margin: '2px 0 0',
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: COLORS.gold,
                            textDecoration: 'none',
                          }}
                        >
                          {t('host.reviewOn', { title: r.listing_title })}
                        </a>
                      )}
                      {r.comment && (
                        <p
                          style={{
                            margin: '8px 0 0',
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
              )}
            </div>

            {/* The host's listings */}
            {listings.length > 0 && (
              <div style={{ marginTop: 44 }}>
                <h2
                  style={{
                    margin: '0 0 16px',
                    fontSize: 20,
                    fontWeight: 700,
                    color: COLORS.ink,
                  }}
                >
                  {t(
                    listings.length === 1
                      ? 'host.listingsTitleOne'
                      : 'host.listingsTitleMany',
                    { count: listings.length }
                  )}
                </h2>
                <div
                  className="qk-host-listings"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: 24,
                  }}
                >
                  {listings.map((listing) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      saved={savedIds.has(listing.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Photo lightbox (shared by the review thumbnails). */}
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

      {/* Footer (matches the other public pages). */}
      <footer
        style={{
          background: 'linear-gradient(180deg,#5B0F16,#45070d)',
          color: COLORS.cream,
          padding: '32px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 1100,
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

// "← Back" — goes back in history when possible (so the visitor returns to the
// listing they came from), otherwise falls back to Explore.
function BackLink({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          window.history.back()
        } else {
          window.location.href = '/explore'
        }
      }}
      style={{
        appearance: 'none',
        border: 'none',
        background: 'transparent',
        color: COLORS.burgundy,
        fontFamily: FONT,
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
        padding: 0,
        marginBottom: 18,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span aria-hidden="true">←</span>
      {label}
    </button>
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
