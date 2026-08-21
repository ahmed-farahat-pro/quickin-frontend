// =============================================================================
// /links — QuickIn's bio linktree.
//
// The one URL we put in the Instagram / TikTok / Facebook bios, pointing at
// everything else we run. It sits OUTSIDE the (main) route group on purpose, so
// it renders on the root layout alone: no navbar, no site footer, nothing
// competing with the links themselves — the convention every link-in-bio page
// follows.
//
// Sources, none of them new: socials from @/lib/social, the WhatsApp line from
// @/lib/contact, the site's own address from getBaseUrl(), and the two store
// links from the same /ops-managed rows the top app bar uses. Set those in /ops
// → App links and the two app rows here light up on their own; until then they
// render as "coming soon" rather than vanishing, because a linktree that
// silently drops the apps looks broken rather than early.
// =============================================================================
import type { Metadata } from 'next'
import { backendFetchOr } from '@/lib/backend'
import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import {
  IconBrandInstagram,
  IconBrandTiktok,
  IconBrandFacebook,
  IconBrandWhatsapp,
  IconBrandApple,
  IconBrandGooglePlay,
  IconWorld,
  IconMail,
  IconChevronRight,
} from '@tabler/icons-react'
import { SOCIAL_LINKS, type SocialPlatform } from '@/lib/social'
import { whatsappHref, CONTACT_EMAIL, CONTACT_EMAIL_HREF } from '@/lib/contact'
import { getBaseUrl } from '@/lib/utils'

// Cached HTML, refreshed every 5 minutes. This page is hit straight off social
// bios, so it should be static; 5 minutes is how long an /ops edit to the store
// links takes to show up, which is far tighter than the apps ship.
export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('linksPage')
  return {
    // `absolute` opts out of the root layout's "%s | QuickIn" template — the
    // title already says QuickIn, and the tab is read straight off a bio link.
    title: { absolute: t('meta.title') },
    description: t('meta.description'),
    alternates: { canonical: '/links' },
    openGraph: {
      title: t('meta.title'),
      description: t('meta.description'),
      url: `${getBaseUrl()}/links`,
      images: ['/logo-icon.png'],
    },
  }
}

const SOCIAL_ICONS: Record<SocialPlatform, typeof IconBrandInstagram> = {
  instagram: IconBrandInstagram,
  tiktok: IconBrandTiktok,
  facebook: IconBrandFacebook,
}

/** How the site's own address reads on a button — no scheme, no trailing slash. */
function prettyDomain(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

function Row({
  href,
  icon,
  label,
  sub,
  primary = false,
}: {
  href: string
  icon: React.ReactNode
  label: string
  sub?: string | null
  primary?: boolean
}) {
  // mailto: hands off to the mail client, so target="_blank" would leave the
  // visitor staring at a blank tab. Only the http(s) rows open a new tab.
  const opensTab = href.startsWith('http')
  return (
    <a
      href={href}
      target={opensTab ? '_blank' : undefined}
      rel={opensTab ? 'noopener noreferrer' : undefined}
      className={[
        // min-h keeps every row the same height whether or not it has a sub
        // line — the Facebook row has no handle to print.
        'group flex min-h-[74px] items-center gap-4 rounded-button border px-5 py-4 transition-all',
        'hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        primary
          ? 'border-primary bg-primary text-primary-foreground shadow-[0_10px_30px_rgba(91,15,22,0.25)] hover:shadow-[0_14px_34px_rgba(91,15,22,0.32)]'
          : 'border-border bg-card text-foreground card-shadow hover:border-primary/30 hover:shadow-[0_14px_34px_rgba(0,0,0,0.09)]',
      ].join(' ')}
    >
      <span className={primary ? 'text-primary-foreground' : 'text-primary'}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-tight">{label}</span>
        {sub ? (
          <span
            className={[
              'mt-0.5 block truncate text-[13px] leading-tight',
              primary ? 'text-primary-foreground/75' : 'text-muted-foreground',
            ].join(' ')}
          >
            {/* <bdi>, not a bare string: in the Arabic layout the whole row is
                RTL, and "@quickin.egy_" starts with a neutral character, so the
                bidi algorithm reorders the @ to the far end — the handle renders
                as "_quickin.egy@". bdi isolates the run so it keeps its own LTR
                order without disturbing the row's right alignment. Arabic subs
                are unaffected: bdi auto-detects RTL for them. */}
            <bdi>{sub}</bdi>
          </span>
        ) : null}
      </span>
      <IconChevronRight
        className={[
          'h-[18px] w-[18px] shrink-0 transition-transform rtl:-scale-x-100',
          'group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5',
          primary ? 'text-primary-foreground/70' : 'text-muted-foreground',
        ].join(' ')}
        stroke={2}
      />
    </a>
  )
}

/** An app row for a store we have not shipped to yet — shown, but inert. */
function ComingSoonRow({
  icon,
  label,
  badge,
}: {
  icon: React.ReactNode
  label: string
  badge: string
}) {
  return (
    <div
      aria-disabled="true"
      className="flex min-h-[74px] items-center gap-4 rounded-button border border-dashed border-border bg-card/50 px-5 py-4"
    >
      <span className="text-muted-foreground">{icon}</span>
      {/* The badge sits on the sub line rather than as a right-hand pill: as a
          pill it squeezed "Download on the App Store" into an ellipsis on a
          375px phone, which is the width that matters most here. */}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-tight text-muted-foreground">
          {label}
        </span>
        <span className="mt-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground/80">
          {badge}
        </span>
      </span>
    </div>
  )
}

export default async function LinksPage() {
  const t = await getTranslations('linksPage')
  const { ios, android } = await backendFetchOr<{ ios: string | null; android: string | null }>(
    '/api/local/app-links', { ios: null, android: null })
  const siteUrl = getBaseUrl()

  const iconProps = { className: 'h-[22px] w-[22px] shrink-0', stroke: 1.8 } as const

  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-5 py-12 sm:py-16">
      <div className="w-full max-w-md">
        {/* Identity */}
        <header className="flex flex-col items-center text-center">
          <Image
            src="/logo-icon.png"
            alt="QuickIn"
            width={88}
            height={88}
            priority
            className="h-[88px] w-[88px] rounded-full bg-card object-contain p-3 card-shadow ring-1 ring-border"
          />
          <h1 className="text-hero mt-5 text-[32px] font-bold leading-none text-primary">QuickIn</h1>
          <p className="mt-3 max-w-[19rem] text-[14px] leading-relaxed text-muted-foreground">
            {t('tagline')}
          </p>
        </header>

        {/* Links */}
        <nav className="mt-9 flex flex-col gap-3">
          <Row
            href={siteUrl}
            icon={<IconWorld {...iconProps} />}
            label={t('book')}
            sub={prettyDomain(siteUrl)}
            primary
          />

          {ios ? (
            <Row
              href={ios}
              icon={<IconBrandApple {...iconProps} />}
              label={t('appStore')}
              sub={t('appStoreSub')}
            />
          ) : (
            <ComingSoonRow
              icon={<IconBrandApple {...iconProps} />}
              label={t('appStore')}
              badge={t('comingSoon')}
            />
          )}

          {android ? (
            <Row
              href={android}
              icon={<IconBrandGooglePlay {...iconProps} />}
              label={t('googlePlay')}
              sub={t('googlePlaySub')}
            />
          ) : (
            <ComingSoonRow
              icon={<IconBrandGooglePlay {...iconProps} />}
              label={t('googlePlay')}
              badge={t('comingSoon')}
            />
          )}

          <p className="mt-4 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {t('followUs')}
          </p>

          {SOCIAL_LINKS.map(({ platform, label, url, handle }) => {
            const Icon = SOCIAL_ICONS[platform]
            return <Row key={platform} href={url} icon={<Icon {...iconProps} />} label={label} sub={handle} />
          })}

          <Row
            href={whatsappHref('Hello QuickIn 👋')}
            icon={<IconBrandWhatsapp {...iconProps} />}
            label={t('whatsapp')}
            sub={t('whatsappSub')}
          />

          {/* The address itself is the sub line rather than a description: on a
              linktree it is the thing people want to read off and copy. */}
          <Row
            href={CONTACT_EMAIL_HREF}
            icon={<IconMail {...iconProps} />}
            label={t('email')}
            sub={CONTACT_EMAIL}
          />
        </nav>

        <footer className="mt-12 text-center text-[12px] text-muted-foreground">
          © {new Date().getFullYear()} QuickIn · {t('rights')}
        </footer>
      </div>
    </main>
  )
}
