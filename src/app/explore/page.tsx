// Local browse grid (no Supabase) — boutique stays explorer with search.
// The header/footer + server-side auth are rendered here; the interactive
// search/grid/map lives in the client component below.
import type { Metadata } from 'next'
import type { Listing } from '@/lib/types'
import { viewer, viewerChrome, backendFetchOr } from '@/lib/backend'
import { cookies } from 'next/headers'
import { LocaleSwitcher } from '@/components/layout/locale-switcher'
import { CurrencySwitcher } from '@/components/layout/currency-switcher'
import { NotificationsBell } from './notifications-bell'
import { MobileMenu } from './mobile-menu'
import { getTranslations, getLocale } from 'next-intl/server'
import { Heart, MessageCircleQuestion } from 'lucide-react'
import ExploreClient, { type DestinationRegion } from './explore-client'
import AddListingFab from './add-listing-fab'
import WhatsAppPicker, { WhatsAppGlyph } from '@/components/whatsapp-picker'
import { SOCIAL_LINKS } from '@/lib/social'
import { IconBrandInstagram, IconBrandTiktok, IconBrandFacebook } from '@tabler/icons-react'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('explorePage')
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: { canonical: '/explore' },
    openGraph: {
      title: t('meta.ogTitle'),
      description: t('meta.ogDescription'),
      url: '/explore',
      type: 'website',
      siteName: 'Quick In',
      images: [{ url: '/logo.png', width: 700, height: 454, alt: 'Quick In' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('meta.ogTitle'),
      description: t('meta.ogDescription'),
      images: ['/logo.png'],
    },
  }
}

/** Initials for the header avatar — same rule as the mobile apps' `avatarInitials`:
 *  first + last word of the display name (or of the email's local part), uppercased. */
function initialsFrom(source: string): string {
  const parts = source.trim().split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase()
}

interface Viewer {
  firstName: string | null
  initials: string
  avatarUrl: string | null
  savedIds: string[]
  isHost: boolean
}

const SIGNED_OUT: Viewer = { firstName: null, initials: '?', avatarUrl: null, savedIds: [], isHost: false }

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{
    location?: string
    checkIn?: string
    checkOut?: string
    guests?: string
    type?: string
    region?: string
    area?: string
  }>
}) {
  const t = await getTranslations('explorePage')
  const locale = await getLocale()
  // Locale-prefix internal links so footer links land on the right page without
  // an extra middleware redirect.
  const loc = (href: string) => `/${locale}${href}`
  const sp = await searchParams
  const location = sp.location?.trim() || ''
  const checkIn = sp.checkIn?.trim() || ''
  const checkOut = sp.checkOut?.trim() || ''
  const guestsRaw = sp.guests?.trim() || ''
  const type = sp.type?.trim() || ''
  const region = sp.region?.trim() || ''
  const area = region ? sp.area?.trim().toLowerCase() || '' : ''
  const guests = guestsRaw ? Number(guestsRaw) : undefined

  const query = new URLSearchParams()
  if (location) query.set('location', location)
  if (checkIn) query.set('checkIn', checkIn)
  if (checkOut) query.set('checkOut', checkOut)
  if (guests && Number.isFinite(guests)) query.set('guests', String(guests))
  if (type) query.set('propertyType', type)
  if (region) query.set('region', region)
  if (area) query.set('area', area)
  const [listings, destinations, currentUser] = await Promise.all([
    backendFetchOr<Listing[]>(`/api/local/listings?${query}`, []),
    // The region rail. [] (backend down / old backend) just hides the rail.
    backendFetchOr<DestinationRegion[]>('/api/local/destinations', []),
    viewerChrome(),
  ])
  const { firstName, initials, avatarUrl, savedIds, isHost } = currentUser
  // The avatar carries the greeting ("Hi, {name}") as its label so the crowded
  // header doesn't need a separate text link to /account.
  const accountLabel = firstName ? t('nav.greeting', { name: firstName }) : t('nav.account')

  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.cream,
        color: COLORS.ink,
        fontFamily: FONT,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Footer grid collapses from 4 cols → 2 → 1 as the viewport narrows so
          it never overflows on phones. Inline styles can't hold media queries. */}
      <style>{`
        @media (max-width: 720px) {
          .qk-footer-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 440px) {
          .qk-footer-grid {
            grid-template-columns: 1fr !important;
          }
        }
        /* Header: full nav on desktop, logo + bell + hamburger on mobile. */
        .qk-nav-desktop { display: flex; align-items: center; gap: 18px; font-size: 14px; }
        .qk-header-mobile { display: none; align-items: center; gap: 2px; }
        @media (max-width: 820px) {
          .qk-nav-desktop { display: none; }
          .qk-header-mobile { display: flex; }
        }
      `}</style>

      {/* Header bar */}
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
          {/* Logo */}
          <a href="/explore" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <img
              src="/logo.png"
              alt={t('logoAlt')}
              height={40}
              style={{ height: 40, width: 'auto', display: 'block' }}
            />
          </a>

          {/* Right side (desktop ≥820px): notifications, language, host, auth */}
          <nav className="qk-nav-desktop">
            <NotificationsBell />
            <LocaleSwitcher className="font-semibold text-[color:var(--qk-ink,#3a2a23)]" />
            <CurrencySwitcher className="font-semibold text-[color:var(--qk-ink,#3a2a23)]" />
            {isHost && (
              // Guest questions — where the Messages inbox used to sit. Host ⇄ guest
              // messaging was replaced by public questions on each listing, so the
              // header affordance now leads a host to the questions waiting on them.
              <a
                href="/host/questions"
                aria-label={t('nav.guestQuestions')}
                title={t('nav.guestQuestions')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#2A2220] transition-colors hover:bg-black/5"
              >
                <MessageCircleQuestion className="h-5 w-5" />
              </a>
            )}
            {firstName && (
              <a
                href="/saved"
                aria-label={t('nav.saved')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#2A2220] transition-colors hover:bg-black/5"
              >
                <Heart className="h-5 w-5" />
              </a>
            )}
            {isHost ? (
              // A host is also a guest — this links to the hosting dashboard;
              // "Add listing" now lives in the floating action button (bottom-end).
              <a
                href="/host"
                style={{ color: COLORS.ink, textDecoration: 'none', fontWeight: 600 }}
              >
                {t('nav.hosting')}
              </a>
            ) : (
              <a
                href="/host"
                style={{
                  color: COLORS.ink,
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                {t('nav.becomeHost')}
              </a>
            )}
            {firstName ? (
              <>
                <a
                  href="/reservations"
                  style={{ color: COLORS.ink, textDecoration: 'none', fontWeight: 600 }}
                >
                  {t('nav.trips')}
                </a>
                <a
                  href="/saved"
                  style={{ color: COLORS.ink, textDecoration: 'none', fontWeight: 600 }}
                >
                  {t('nav.saved')}
                </a>
                {/* Profile avatar → /account, matching the mobile apps' top bar.
                    Its label is the "Hi, {name}" greeting the text link used to show. */}
                <ProfileAvatar initials={initials} avatarUrl={avatarUrl} label={accountLabel} />
                <a
                  href="/api/auth/logout"
                  style={{
                    color: COLORS.muted,
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  {t('nav.logout')}
                </a>
              </>
            ) : (
              <>
                <a
                  href="/login"
                  style={{
                    color: COLORS.ink,
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  {t('nav.login')}
                </a>
                <a
                  href="/signup"
                  style={{
                    color: '#fff',
                    background: COLORS.burgundy,
                    textDecoration: 'none',
                    fontWeight: 600,
                    padding: '9px 18px',
                    borderRadius: 999,
                  }}
                >
                  {t('nav.signup')}
                </a>
              </>
            )}
          </nav>

          {/* Right side (mobile <820px): bell + avatar + hamburger that slides out the rest */}
          <div className="qk-header-mobile">
            <NotificationsBell />
            {firstName && (
              <a
                href="/saved"
                aria-label={t('nav.saved')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#2A2220] transition-colors hover:bg-black/5"
              >
                <Heart className="h-5 w-5" />
              </a>
            )}
            {firstName && (
              <ProfileAvatar
                initials={initials}
                avatarUrl={avatarUrl}
                label={accountLabel}
                size={34}
                // The neighbouring icon buttons are 40px with built-in padding;
                // the bare circle needs a little breathing room in the 2px gap.
                marginInline={5}
              />
            )}
            <MobileMenu firstName={firstName} isHost={isHost} />
          </div>
        </div>
      </header>

      {/* Live search + results grid + map view (client component).
          The server-fetched listings seed the first paint; the client then
          re-fetches /api/local/listings live as the user types/filters. */}
      <ExploreClient
        initialListings={listings}
        initialFilters={{ location, checkIn, checkOut, guests: guestsRaw, type, region, area }}
        destinations={destinations}
        savedIds={savedIds}
      />

      {/* Footer */}
      <footer
        style={{
          background: COLORS.burgundy,
          color: COLORS.cream,
          padding: '48px 24px 32px',
        }}
      >
        <div
          className="qk-footer-grid"
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(3, 1fr)',
            gap: 32,
          }}
        >
          <div>
            <img
              src="/logo.png"
              alt={t('logoAlt')}
              height={36}
              style={{
                height: 36,
                width: 'auto',
                display: 'block',
                marginBottom: 14,
                filter: 'brightness(0) invert(1)',
              }}
            />
            <p
              style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.6,
                color: 'rgba(246,241,230,0.78)',
                maxWidth: 280,
              }}
            >
              {t('footer.tagline')}
            </p>
          </div>

          <FooterColumn
            title={t('footer.support.title')}
            links={[
              { label: t('footer.support.contact'), href: loc('/contact') },
            ]}
          />
          <FooterColumn
            title={t('footer.hosting.title')}
            links={[
              { label: t('footer.hosting.becomeHost'), href: loc('/host') },
            ]}
          />
          <FooterColumn
            title={t('footer.about.title')}
            links={[
              { label: t('footer.about.ourStory'), href: loc('/about') },
            ]}
          />
        </div>

        {/* Bottom bar: copyright · legal links · WhatsApp */}
        <div
          style={{
            maxWidth: 1200,
            margin: '32px auto 0',
            paddingTop: 22,
            borderTop: '1px solid rgba(246,241,230,0.18)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            fontSize: 13,
            color: 'rgba(246,241,230,0.7)',
          }}
        >
          <span>{t('footer.copyright')}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
            <a href={loc('/terms')} style={{ color: 'rgba(246,241,230,0.85)', textDecoration: 'none' }}>{t('footer.legal.terms')}</a>
            <span aria-hidden>·</span>
            <a href={loc('/privacy')} style={{ color: 'rgba(246,241,230,0.85)', textDecoration: 'none' }}>{t('footer.legal.privacy')}</a>
            <span aria-hidden>·</span>
            <a href={loc('/sitemap')} style={{ color: 'rgba(246,241,230,0.85)', textDecoration: 'none' }}>{t('footer.legal.sitemap')}</a>
            {/* The same three accounts /links and the (main) footer list, from
                @/lib/social. Rendered inline rather than via the CMS-driven
                Footer component because this page ships its own footer. */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginInlineStart: 2 }}>
              {SOCIAL_LINKS.map(({ platform, label, url }) => {
                const Icon =
                  platform === 'instagram'
                    ? IconBrandInstagram
                    : platform === 'tiktok'
                      ? IconBrandTiktok
                      : IconBrandFacebook
                return (
                  // Hover inverts to the cream-on-burgundy pill this footer
                  // already uses for "Chat on WhatsApp" two elements along, so
                  // the whole bottom bar reacts in one visual language. 36px
                  // hit area — the icon is 18px, the rest is padding you can
                  // still click. Tailwind (not the inline styles around it)
                  // because :hover and :focus-visible need real CSS.
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                    className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[#F6F1E6]/85 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#F6F1E6] hover:text-[#5B0F16] focus-visible:-translate-y-0.5 focus-visible:bg-[#F6F1E6] focus-visible:text-[#5B0F16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6F1E6]/60 active:translate-y-0 active:scale-95 motion-reduce:transform-none motion-reduce:transition-none"
                  >
                    <Icon size={18} stroke={1.8} aria-hidden />
                  </a>
                )
              })}
            </span>
            <WhatsAppPicker
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                color: COLORS.burgundy, background: COLORS.cream,
                fontWeight: 700, textDecoration: 'none',
                padding: '7px 14px', borderRadius: 999, marginInlineStart: 4,
                border: 'none', fontSize: 'inherit', fontFamily: 'inherit',
              }}
            >
              <WhatsAppGlyph size={15} />
              {t('footer.whatsapp')}
            </WhatsAppPicker>
          </div>
        </div>
      </footer>

      {/* Hosts get "Add listing" as a floating button on the bottom-end corner
          (the WhatsApp FAB sits on the bottom-start corner). Same host gate the
          top-nav pill used to have. */}
      {isHost && <AddListingFab href="/host/new" label={t('nav.addListing')} />}
    </main>
  )
}

/** Circular account avatar for the header — the user's photo when they have one,
 *  otherwise their initials on the app's gold gradient (Gold → GoldSoft, white
 *  bold initials) inside a soft burgundy ring. Mirrors the mobile apps' top bar. */
function ProfileAvatar({
  initials,
  avatarUrl,
  label,
  size = 36,
  marginInline = 0,
}: {
  initials: string
  avatarUrl: string | null
  label: string
  size?: number
  marginInline?: number
}) {
  return (
    <a
      href="/account"
      title={label}
      aria-label={label}
      style={{
        display: 'inline-flex',
        flex: '0 0 auto',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        marginInline,
        borderRadius: 999,
        overflow: 'hidden',
        background: avatarUrl ? COLORS.tan : 'linear-gradient(135deg, #B07A2A 0%, #D8A55A 100%)',
        color: '#fff',
        fontWeight: 700,
        fontSize: Math.round(size * 0.38),
        lineHeight: 1,
        letterSpacing: 0.3,
        textDecoration: 'none',
        boxShadow: `0 0 0 2px rgba(91,15,22,0.18)`,
      }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar_url may be an inline data: URL
        <img
          src={avatarUrl}
          alt=""
          width={size}
          height={size}
          style={{ width: size, height: size, objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </a>
  )
}

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h3
        style={{
          margin: '0 0 12px',
          fontSize: 14,
          fontWeight: 700,
          color: COLORS.cream,
        }}
      >
        {title}
      </h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {links.map((link) => (
          <li key={link.href} style={{ marginBottom: 8 }}>
            <a
              href={link.href}
              style={{
                fontSize: 14,
                color: 'rgba(246,241,230,0.78)',
                textDecoration: 'none',
              }}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
