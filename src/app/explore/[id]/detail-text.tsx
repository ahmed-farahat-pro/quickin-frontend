'use client'

// Tiny client helpers that localize the STATIC text on the (server-rendered)
// listing detail page. The page itself stays a server component so its data
// fetch + SEO metadata are unchanged; only these small text bits opt into the
// client-side i18n context.
import { useLanguage } from '@/lib/i18n/language-provider'

// Inline localized string — use anywhere a bare label is needed.
export function T({
  k,
  vars,
}: {
  k: string
  vars?: Record<string, string | number>
}) {
  const { t } = useLanguage()
  return <>{t(k, vars)}</>
}

const COLORS = {
  burgundy: '#5B0F16',
  ink: '#2A2220',
}

// "← Back to Explore" link (arrow flips automatically under dir="rtl").
export function BackToExplore() {
  const { t } = useLanguage()
  return (
    <a
      href="/explore"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 14,
        fontWeight: 600,
        color: COLORS.burgundy,
        textDecoration: 'none',
        marginBottom: 22,
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>&larr;</span>
      {t('listing.backToExplore')}
    </a>
  )
}

// Guest-favorite pill (shown above the title on the detail page).
export function GuestFavoriteBadge({
  background,
}: {
  background: string
}) {
  const { t } = useLanguage()
  return (
    <span
      style={{
        display: 'inline-block',
        background,
        color: COLORS.burgundy,
        fontSize: 12,
        fontWeight: 600,
        padding: '5px 12px',
        borderRadius: 999,
        marginBottom: 12,
      }}
    >
      ★ {t('listing.guestFavorite')}
    </span>
  )
}
