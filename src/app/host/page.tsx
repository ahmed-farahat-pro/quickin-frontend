// Host dashboard (no Supabase) — the signed-in host's listings + incoming
// reservations. Server-side auth reads the qk_token cookie (same pattern as
// /explore and /reservations); the interactive Approve/Decline panel lives in
// the 'use client' component below.
import type { Metadata } from 'next'
import type { HostStatus, Listing } from '@/lib/types'
import { viewer, backendFetchOr } from '@/lib/backend'
import { cookies } from 'next/headers'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatPrice } from '@/lib/utils'
import { HostReservations } from './host-reservations'
import { HostTabs, HostListingsFilter, type HostListingStatus } from './host-tabs'
import { ListingStatusChip } from './listing-status-chip'
import { OwnershipDocAction } from './ownership-doc'
import { ListingVisibilityAction } from './listing-visibility'
import { hostVisibilityState } from '@/lib/local/host-visibility-core'
import { CARD_ACTION_STYLE } from './card-action-style'
import { BecomeHostButton } from '../account/account-forms'
import { HostQuickActions } from './host-quick-actions'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hostPage')
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: { canonical: '/host' },
    robots: { index: false, follow: true },
  }
}

type T = Awaited<ReturnType<typeof getTranslations<'hostPage'>>>

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

const FALLBACK_IMG =
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80'

/**
 * The single state the card is shown in, from the SAME rules the backend enforces
 * on the write (host-visibility-core.ts, byte-identical in both repos). It folds
 * moderation and visibility together, because from the host's side "why can
 * nobody see this?" has one answer, not two — and because a listing can be both
 * approved and hidden at once.
 *
 * `live` is renamed to 'approved' here only because that is the wire name the
 * filter chips have always used. Legacy rows with no approval_status still land
 * on 'approved', as they always did.
 */
function listingStatus(listing: Listing): HostListingStatus {
  const state = hostVisibilityState(listing)
  return state === 'live' ? 'approved' : state === 'under_review' ? 'pending' : state
}

/**
 * "Listed 27 Jul 2026" in the active locale. Returns null when created_at is
 * missing or unparseable so the card simply omits the line.
 */
function formatListedOn(
  t: T,
  fmt: Intl.DateTimeFormat,
  createdAt: string | null | undefined
): string | null {
  if (!createdAt) return null
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return null
  return t('dashboard.listedOn', { date: fmt.format(date) })
}

interface HostViewer {
  id: string
  firstName: string
  is_host: boolean
  host_status: HostStatus
  host_review_note: string | null
}

function Header({ backLabel }: { backLabel: string }) {
  return (
    <header
      style={{
        background: `linear-gradient(180deg, ${COLORS.tan} 0%, ${COLORS.cream} 100%)`,
        borderBottom: `1px solid rgba(91,15,22,0.10)`,
        padding: '20px 24px',
      }}
    >
      <div
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
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
        <a
          href="/explore"
          style={{
            color: COLORS.burgundy,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ← {backLabel}
        </a>
      </div>
    </header>
  )
}

/** First name for a greeting, from whatever the account actually has. */
function firstNameOf(u: { full_name: string | null; email: string }): string {
  const name = u.full_name?.trim() || u.email.split('@')[0] || ''
  return name.split(' ')[0] || ''
}

export default async function HostPage() {
  const user = await viewer()
  const t = await getTranslations('hostPage')

  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.cream,
        color: COLORS.ink,
        fontFamily: FONT,
      }}
    >
      <style>{`
        @media (max-width: 640px) {
          .qk-host-grid { grid-template-columns: 1fr !important; }
          .qk-host-listing-card .qk-host-listing-img {
            width: 100% !important; height: 170px !important;
          }
        }
        /* A listing title is host input: 200 repeated characters with no space
           is one unbreakable word, and a grid item's min-width:auto lets that
           word widen its track until the card overflows the row. Break inside
           the word and clamp to two lines so any title fits the same box. */
        .qk-host-card-title {
          overflow-wrap: anywhere;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }
        .qk-host-card-loc {
          overflow-wrap: anywhere;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }
        /* The whole photo/title area of a host card is a link to its editor —
           give it clear hover affordance so it reads as clickable. */
        .qk-host-listing-card { transition: box-shadow .2s ease, transform .2s ease; }
        .qk-host-listing-card:hover { transform: translateY(-3px); box-shadow: 0 14px 34px rgba(42,34,32,0.14); }
        .qk-host-card-open .qk-host-listing-img img { transition: transform .4s ease; }
        .qk-host-card-open:hover .qk-host-listing-img img { transform: scale(1.04); }
        .qk-host-card-open:hover h3 { color: ${COLORS.burgundy}; }
      `}</style>

      <Header backLabel={t('backToExplore')} />

      <section
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          padding: '36px 24px 72px',
        }}
      >
        {/* Hosting surfaces gate on is_host === true only. */}
        {!user ? (
          <BecomeAHost t={t} signedIn={false} status="none" reviewNote={null} />
        ) : !user.is_host ? (
          <BecomeAHost t={t} signedIn status={user.host_status as HostStatus} reviewNote={user.host_review_note} />
        ) : (
          <HostDashboard userId={user.id} firstName={firstNameOf(user)} t={t} />
        )}
      </section>
    </main>
  )
}

/**
 * Become-a-host intro: short pitch + the CTA for the viewer's host_status.
 * - signedIn=false → "Log in to start hosting" link (one account; they sign in first).
 * - pending  → "Application under review" (no CTA).
 * - rejected → the admin's reason + a "Reapply" CTA.
 * - none     → "Apply to host" link to /host/apply (admin-reviewed).
 * `approved` never reaches here — that viewer gets the dashboard.
 */
function BecomeAHost({
  t,
  signedIn,
  status,
  reviewNote,
}: {
  t: T
  signedIn: boolean
  status: HostStatus
  reviewNote: string | null
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 28,
        border: `1px solid rgba(42,34,32,0.06)`,
        boxShadow: '0 8px 30px rgba(42,34,32,0.07)',
        padding: '56px 32px',
        textAlign: 'center',
        maxWidth: 620,
        margin: '24px auto 0',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: COLORS.muted,
        }}
      >
        {t('become.eyebrow')}
      </p>
      <h1
        style={{
          margin: '10px 0 0',
          fontFamily: '"Playfair Display", Georgia, serif',
          fontSize: 'clamp(28px, 5vw, 40px)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: COLORS.burgundy,
          lineHeight: 1.1,
        }}
      >
        {t('become.title')}
      </h1>
      <p
        style={{
          margin: '16px auto 0',
          fontSize: 16,
          lineHeight: 1.6,
          color: COLORS.muted,
          maxWidth: 480,
        }}
      >
        {t('become.subtitle')}
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 14,
          margin: '28px 0 0',
        }}
      >
        {[
          { t: t('become.feature1Title'), d: t('become.feature1Desc') },
          { t: t('become.feature2Title'), d: t('become.feature2Desc') },
          { t: t('become.feature3Title'), d: t('become.feature3Desc') },
        ].map((f) => (
          <div
            key={f.t}
            style={{
              flex: '1 1 150px',
              minWidth: 150,
              background: COLORS.cream,
              borderRadius: 18,
              padding: '16px 14px',
              textAlign: 'left',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14.5, color: COLORS.ink }}>{f.t}</div>
            <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>{f.d}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32 }}>
        {signedIn && status === 'pending' ? (
          <div
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                background: '#fff7e6',
                color: '#9a6b00',
                fontSize: 12.5,
                fontWeight: 700,
                padding: '5px 14px',
                borderRadius: 999,
              }}
            >
              {t('become.pendingBadge')}
            </span>
            <p style={{ margin: 0, fontSize: 14.5, color: COLORS.muted, lineHeight: 1.55, maxWidth: 380 }}>
              {t('become.pendingBody')}
            </p>
          </div>
        ) : signedIn && status === 'rejected' ? (
          <div
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                background: '#fdecea',
                color: '#b3261e',
                fontSize: 12.5,
                fontWeight: 700,
                padding: '5px 14px',
                borderRadius: 999,
              }}
            >
              {t('become.rejectedBadge')}
            </span>
            <p style={{ margin: 0, fontSize: 14.5, color: COLORS.muted, lineHeight: 1.55, maxWidth: 420 }}>
              {reviewNote || t('become.rejectedBody')}
            </p>
            <BecomeHostButton label={t('become.ctaReapply')} variant="large" />
          </div>
        ) : signedIn ? (
          <BecomeHostButton label={t('become.ctaApply')} variant="large" />
        ) : (
          <a
            href="/login"
            style={{
              display: 'inline-block',
              color: '#fff',
              background: COLORS.burgundy,
              textDecoration: 'none',
              fontWeight: 700,
              padding: '13px 30px',
              borderRadius: 999,
              fontSize: 15,
            }}
          >
            {t('become.cta')}
          </a>
        )}
      </div>
    </div>
  )
}

/** Signed-in dashboard: listings grid + a "Create a listing" CTA + incoming reservations. */
async function HostDashboard({ userId, firstName, t }: { userId: string; firstName: string; t: T }) {
  const listings = await backendFetchOr<Listing[]>('/api/local/host/listings', [])
  const locale = await getLocale()
  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })

  const cardLabels: CardLabels = {
    perNight: t('perNight'),
    view: t('dashboard.view'),
    edit: t('dashboard.edit'),
    calendar: t('dashboard.calendar'),
    badgePending: t('dashboard.badge.pending'),
    badgeRejected: t('dashboard.badge.rejected'),
    badgeDeactivated: t('dashboard.badge.deactivated'),
    badgeBlocked: t('dashboard.badge.blocked'),
    deactivatedHeading: t('dashboard.deactivated.heading'),
    deactivatedBody: t('dashboard.deactivated.body'),
    blockedHeading: t('dashboard.blocked.heading'),
    blockedBody: t('dashboard.blocked.body'),
    rejectedHeading: t('dashboard.rejected.heading'),
    rejectedNoReason: t('dashboard.rejected.noReason'),
  }

  const emptyState = (
    <div
      style={{
        background: '#fff',
        borderRadius: 22,
        border: `1px solid rgba(42,34,32,0.06)`,
        boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
        padding: '44px 24px',
        textAlign: 'center',
        color: COLORS.muted,
      }}
    >
      <p style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: COLORS.ink }}>
        {t('dashboard.emptyTitle')}
      </p>
      <p style={{ margin: '0 0 18px', fontSize: 15 }}>
        {t('dashboard.emptyHint')}
      </p>
      <a
        href="/host/new"
        style={{
          display: 'inline-block',
          color: '#fff',
          background: COLORS.burgundy,
          textDecoration: 'none',
          fontWeight: 700,
          padding: '11px 24px',
          borderRadius: 999,
        }}
      >
        {t('dashboard.createListing')}
      </a>
    </div>
  )

  // Cards stay server-rendered; the client filter below only picks which of
  // these slots to mount for the active status.
  const listingsGrid = (
    <HostListingsFilter
      items={listings.map((l) => {
        const status = listingStatus(l)
        return {
          id: l.id,
          status,
          card: (
            <ListingCard
              listing={l}
              status={status}
              listedLabel={formatListedOn(t, dateFmt, l.created_at)}
              labels={cardLabels}
            />
          ),
        }
      })}
      labels={{
        all: t('dashboard.filters.all'),
        approved: t('dashboard.filters.published'),
        pending: t('dashboard.filters.pending'),
        rejected: t('dashboard.filters.rejected'),
        deactivated: t('dashboard.filters.deactivated'),
        // Not a chip (see FILTER_ORDER in host-tabs.tsx) — supplied so the label
        // map stays total and a future chip cannot ship without its wording.
        blocked: t('dashboard.filters.blocked'),
      }}
      emptyLabel={t('dashboard.emptyFiltered')}
      emptyTitle={t('dashboard.emptyFilteredTitle')}
      showAllLabel={t('dashboard.showAll')}
    />
  )

  return (
    <>
      <div style={{ marginBottom: 22 }}>
        <h1
          style={{
            margin: '0 0 6px',
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(26px, 4vw, 34px)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: COLORS.burgundy,
          }}
        >
          {t('dashboard.greeting', { name: firstName })}
        </h1>
        <p style={{ margin: 0, fontSize: 15, color: COLORS.muted }}>
          {listings.length === 0
            ? t('dashboard.noListings')
            : t('dashboard.countPublished', { count: listings.length })}
        </p>
      </div>

      {/* Everything the dashboard offers beyond listings and reservations. iOS
          has carried these four as cards since the dashboard shipped; the web
          had none of them, which is the parity gap this closes. */}
      <HostQuickActions
        ariaLabel={t('dashboard.quickActions.label')}
        actions={[
          {
            href: '/host/reviews',
            glyph: '★',
            label: t('dashboard.quickActions.reviews.label'),
            hint: t('dashboard.quickActions.reviews.hint'),
          },
          {
            href: '/host/analytics',
            glyph: '▤',
            label: t('dashboard.quickActions.analytics.label'),
            hint: t('dashboard.quickActions.analytics.hint'),
          },
          {
            href: '/host/earnings',
            glyph: '◈',
            label: t('dashboard.quickActions.earnings.label'),
            hint: t('dashboard.quickActions.earnings.hint'),
          },
          {
            href: '/host/services',
            glyph: '❖',
            label: t('dashboard.quickActions.services.label'),
            hint: t('dashboard.quickActions.services.hint'),
          },
        ]}
      />

      {/* My Listings | Incoming Reservations tabs (client toggle, server slots) */}
      <HostTabs
        listingsLabel={t('dashboard.tabs.listings')}
        reservationsLabel={t('dashboard.tabs.reservations')}
        listings={listings.length === 0 ? emptyState : listingsGrid}
        reservations={<HostReservations />}
      />

      {/* Floating "Create listing" shortcut. It shares the --qk-fab-bottom shelf
          (globals.css) and the 56px height of the WhatsApp FAB in the opposite
          corner, so the two sit level on every breakpoint. */}
      <a
        href="/host/new"
        aria-label={t('dashboard.createListing')}
        style={{
          position: 'fixed',
          bottom: 'var(--qk-fab-bottom, 22px)',
          insetInlineEnd: 22,
          zIndex: 900,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          height: 56,
          background: COLORS.burgundy,
          color: '#fff',
          textDecoration: 'none',
          fontWeight: 700,
          fontSize: 14.5,
          padding: '0 22px',
          borderRadius: 999,
          boxShadow: '0 8px 24px rgba(91,15,22,0.34)',
          whiteSpace: 'nowrap',
        }}
      >
        <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>+</span>
        {t('dashboard.createListing')}
      </a>
    </>
  )
}

type CardLabels = {
  perNight: string
  view: string
  edit: string
  calendar: string
  badgePending: string
  badgeRejected: string
  badgeDeactivated: string
  badgeBlocked: string
  /** Heading over the operator's reason on a rejected card. */
  rejectedHeading: string
  /** Shown in place of the reason when the operator rejected without writing one. */
  rejectedNoReason: string
  /** The "you took this down" explainer, so a deactivated card says what that
   *  means for the bookings the host already has. */
  deactivatedHeading: string
  deactivatedBody: string
  /** The "someone else took this down" explainer. The host cannot undo it, so
   *  the card says who to ask instead of showing a button that would fail. */
  blockedHeading: string
  blockedBody: string
}

/** Which label each non-live status wears on its chip. A map rather than a chain
 *  of ternaries so adding a state cannot silently fall through to the wrong one —
 *  TypeScript demands an entry here the moment HostListingStatus grows. */
const BADGE_LABEL: Record<Exclude<HostListingStatus, 'approved'>, (l: CardLabels) => string> = {
  pending: (l) => l.badgePending,
  rejected: (l) => l.badgeRejected,
  deactivated: (l) => l.badgeDeactivated,
  blocked: (l) => l.badgeBlocked,
}

function ListingCard({
  listing,
  status,
  listedLabel,
  labels,
}: {
  listing: Listing
  status: HostListingStatus
  /** Pre-formatted "Listed 27 Jul 2026", or null when the date is unknown. */
  listedLabel: string | null
  labels: CardLabels
}) {
  const img =
    listing.image_url ||
    listing.listing_images?.[0]?.url ||
    FALLBACK_IMG
  const priceLabel = formatPrice(listing.price_per_night, listing.currency)

  const editHref = `/host/${listing.id}/edit`

  return (
    <article
      className="qk-host-listing-card"
      style={{
        background: '#fff',
        borderRadius: 20,
        border: `1px solid rgba(42,34,32,0.06)`,
        boxShadow: '0 6px 24px rgba(42,34,32,0.07)',
        overflow: 'hidden',
        // A column flexbox, not a grid. Cards in a row are stretched to the
        // tallest one, and an auto-row grid shares that slack out over every
        // row: each card's actions then started at a different height, and the
        // pills — flex children of a row that had itself grown — stretched
        // taller than their neighbours'. A column parks all the slack in one
        // place (the `marginTop: 'auto'` footer below), so the buttons keep
        // their own height and land on the same line across the whole grid.
        display: 'flex',
        flexDirection: 'column',
        // Without this the card floors at its content's min-width, and a long
        // title pushes it wider than its track.
        minWidth: 0,
      }}
    >
      {/* Tapping the photo / title / price opens this listing's editor. Kept as a
          single link (not the whole <article>, which also holds the buttons) so we
          never nest one clickable inside another. */}
      <a
        href={editHref}
        className="qk-host-card-open"
        aria-label={`${labels.edit}: ${listing.title}`}
        style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
      >
        <div className="qk-host-listing-img" style={{ position: 'relative', width: '100%', height: 160, background: COLORS.tan, overflow: 'hidden' }}>
          <img
            src={img}
            alt={listing.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          {status !== 'approved' && (
            <ListingStatusChip
              status={status}
              label={BADGE_LABEL[status](labels)}
              style={{ position: 'absolute', top: 10, insetInlineStart: 10 }}
            />
          )}
        </div>
        <div style={{ padding: '14px 16px 2px' }}>
          <h3
            className="qk-host-card-title"
            title={listing.title}
            style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.3, color: COLORS.ink, transition: 'color .16s ease' }}
          >
            {listing.title}
          </h3>
          {listing.location && (
            <p className="qk-host-card-loc" style={{ margin: '3px 0 0', fontSize: 13.5, lineHeight: 1.35, color: COLORS.muted }}>
              {listing.location}
            </p>
          )}
          <p style={{ margin: '10px 0 0', fontSize: 14.5, color: COLORS.burgundy, fontWeight: 700 }}>
            {priceLabel}
            <span style={{ color: COLORS.muted, fontWeight: 500 }}> {labels.perNight}</span>
          </p>
          {listedLabel && (
            <p style={{ margin: '8px 0 0', fontSize: 12.5, color: COLORS.muted }}>
              {listedLabel}
            </p>
          )}
        </div>
      </a>
      {/* Why it was rejected. A red badge alone tells a host they're blocked without
          telling them what to change, which is the one thing the badge exists to
          prompt. `review_note` is null when the operator rejected without writing a
          reason (it is optional) and on every listing rejected before the column
          existed — both fall back to generic guidance rather than an empty box.
          Outside the <a> above: the reason is text to read, not part of the link. */}
      {/* Keyed on approval_status, not on `status`: a listing the host deactivated
          badges as "Deactivated", but if it was ALSO rejected the host still has
          to be told why — that reason is the thing they have to act on before it
          can ever go live again. */}
      {listing.approval_status === 'rejected' && (
        <div
          style={{
            margin: '12px 16px 0',
            padding: '10px 12px',
            background: '#fdecea',
            border: '1px solid rgba(179,38,30,0.16)',
            borderRadius: 12,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#b3261e' }}>
            {labels.rejectedHeading}
          </p>
          {/* Host-visible staff text: keep the line breaks an operator typed, and
              break inside a long unspaced run so it cannot widen the card. */}
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 13,
              lineHeight: 1.45,
              color: COLORS.ink,
              whiteSpace: 'pre-line',
              overflowWrap: 'anywhere',
            }}
          >
            {listing.review_note || labels.rejectedNoReason}
          </p>
        </div>
      )}
      {/* Three actions now, so they wrap rather than squeezing the labels: the
          calendar is where a host manages day-to-day pricing and availability,
          and it earns a place next to Edit rather than being buried inside it. */}
      {/* `marginTop: 'auto'` collects the card's spare height above this row, so
          the footer sits on the card's floor instead of drifting with however
          much text the listing above it happens to have. `alignItems: 'center'`
          stops the pills stretching to the row: they keep the height
          CARD_ACTION_STYLE gives them, wrapped or not. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 16px', flexWrap: 'wrap', marginTop: 'auto' }}>
        <a
          href={`/explore/${listing.id}`}
          style={{
            ...CARD_ACTION_STYLE,
            flex: '1 1 30%',
            color: COLORS.burgundy,
            background: COLORS.cream,
            borderColor: COLORS.tan,
          }}
        >
          {labels.view}
        </a>
        <a
          href={`/host/${listing.id}/calendar`}
          style={{
            ...CARD_ACTION_STYLE,
            flex: '1 1 30%',
            color: COLORS.burgundy,
            background: COLORS.cream,
            borderColor: COLORS.tan,
          }}
        >
          {labels.calendar}
        </a>
        <a
          href={editHref}
          style={{
            ...CARD_ACTION_STYLE,
            flex: '1 1 30%',
            color: '#fff',
            background: COLORS.burgundy,
          }}
        >
          {labels.edit}
        </a>
      </div>
      {/* What "deactivated" actually means, because the word alone does not say
          whether the guests already booked in have lost their stay. They have not,
          and that is the first thing a host wants to know. */}
      {status === 'deactivated' && (
        <Explainer heading={labels.deactivatedHeading} body={labels.deactivatedBody} tone="neutral" />
      )}
      {/* Hidden by someone other than the host — an account block, the identity
          gate, or an operator. There is no button for this: the host cannot clear
          it, and offering one that the API refuses would be worse than saying so. */}
      {status === 'blocked' && (
        <Explainer heading={labels.blockedHeading} body={labels.blockedBody} tone="warn" />
      )}

      {/* Under review or rejected → let the host (re)submit the ownership
          document straight from the card, which re-queues it for review.
          Mirrors the iOS/Android host dashboards. Whether the button says
          "Upload" or "Re-upload" is a SEPARATE question from the status: the
          document is optional at create time, so a listing reaches the queue
          with nothing attached. */}
      {(status === 'pending' || status === 'rejected') && (
        <OwnershipDocAction listingId={listing.id} hasDoc={listing.has_ownership_doc === true} />
      )}

      {/* Take the listing off the market, or put it back. QuickIn has no
          host-facing delete — this IS "remove my listing", and it keeps every
          booking, review and payment record intact. Offered on every state the
          host controls; withheld only on 'blocked', which is not theirs to undo. */}
      {status !== 'blocked' && (
        <ListingVisibilityAction
          listingId={listing.id}
          listingTitle={listing.title}
          // NOT `!listing.is_published`: a listing an operator hid is unpublished
          // too, and offering the host a Reactivate the API would refuse is the
          // exact confusion this flag exists to prevent.
          deactivated={listing.unpublished_by_host === true}
          pendingRequests={listing.pending_request_count ?? 0}
        />
      )}
    </article>
  )
}

/** A short "here is what this state means" note under a card. Two tones: neutral
 *  for a state the host chose, warn for one imposed on them. */
function Explainer({
  heading,
  body,
  tone,
}: {
  heading: string
  body: string
  tone: 'neutral' | 'warn'
}) {
  const warm = tone === 'warn'
  return (
    <div
      style={{
        margin: '12px 16px 0',
        padding: '10px 12px',
        background: warm ? '#fbf3ee' : COLORS.cream,
        border: `1px solid ${warm ? 'rgba(106,74,60,0.18)' : 'rgba(42,34,32,0.08)'}`,
        borderRadius: 12,
      }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: warm ? '#6A4A3C' : COLORS.ink }}>
        {heading}
      </p>
      <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.45, color: COLORS.muted }}>{body}</p>
    </div>
  )
}
