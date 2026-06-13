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
  gold: '#B07A2A',
}

// "← Back to Explore" link. The arrow points toward the inline-start edge, so it
// flips to "→" under dir="rtl" (Arabic).
export function BackToExplore() {
  const { t, lang } = useLanguage()
  const arrow = lang === 'ar' ? '→' : '←'
  return (
    <a
      href="/explore"
      className="qk-press"
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
      <span style={{ fontSize: 18, lineHeight: 1 }}>{arrow}</span>
      {t('listing.backToExplore')}
    </a>
  )
}

// Guest-favorite pill (shown above the title on the detail page). Gold star.
export function GuestFavoriteBadge({
  background,
}: {
  background: string
}) {
  const { t } = useLanguage()
  return (
    <span
      className="qk-pop"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background,
        color: COLORS.ink,
        fontSize: 12,
        fontWeight: 700,
        padding: '5px 12px',
        borderRadius: 999,
        marginBottom: 12,
      }}
    >
      <span className="qk-star" aria-hidden="true">
        ★
      </span>{' '}
      {t('listing.guestFavorite')}
    </span>
  )
}
