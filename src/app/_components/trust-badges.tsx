'use client'

// Reusable trust-badge chips for QuickIn — shown on a host/profile area.
//
// <TrustBadges> renders up to three small pills derived from a host's computed
// badge set (Verified ✓, Superhost, New host). It hides itself entirely when
// none apply, so callers can drop it in unconditionally. Localized + RTL-safe
// (logical gaps; icons are decorative).
//
// <VerificationPill> is the standalone "Verified" chip used where only the
// verified state matters (e.g. the listing's host line via host_verified).
import { useLanguage } from '@/lib/i18n/language-provider'
import type { TrustBadgeSet } from '@/lib/api'

const COLORS = {
  burgundy: '#5B0F16',
  ink: '#2A2220',
  gold: '#B07A2A',
  green: '#0f5132',
}

// A small inline check mark (decorative).
function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

type Tone = { bg: string; fg: string; border: string }

const TONES: Record<'verified' | 'superhost' | 'newHost', Tone> = {
  verified: { bg: 'rgba(15,81,50,0.10)', fg: COLORS.green, border: 'rgba(15,81,50,0.25)' },
  superhost: { bg: 'rgba(176,122,42,0.14)', fg: COLORS.gold, border: 'rgba(176,122,42,0.30)' },
  newHost: { bg: 'rgba(91,15,22,0.08)', fg: COLORS.burgundy, border: 'rgba(91,15,22,0.20)' },
}

// One badge pill. `icon` is optional (only Verified shows a check).
function Pill({
  tone,
  label,
  title,
  withCheck,
}: {
  tone: Tone
  label: string
  title?: string
  withCheck?: boolean
}) {
  return (
    <span
      className="qk-pop"
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.border}`,
        fontSize: 12,
        fontWeight: 700,
        padding: '4px 11px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
      }}
    >
      {withCheck && <CheckIcon />}
      {label}
    </span>
  )
}

// The "Verified" chip on its own — handy when all you know is host_verified.
export function VerificationPill({ size }: { size?: number }) {
  const { t } = useLanguage()
  return (
    <span
      className="qk-pop"
      title={t('badge.verifiedTitle')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: TONES.verified.bg,
        color: TONES.verified.fg,
        border: `1px solid ${TONES.verified.border}`,
        fontSize: size ?? 12,
        fontWeight: 700,
        padding: '4px 11px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
      }}
    >
      <CheckIcon size={size ?? 12} />
      {t('badge.verified')}
    </span>
  )
}

// The full badge row. Renders Verified / Superhost / New host as applicable.
// `verifiedOverride` lets a caller force the verified chip from a cheaper
// signal (e.g. a listing's host_verified) when the full badge set isn't loaded.
export default function TrustBadges({
  badges,
  verifiedOverride,
  style,
}: {
  badges?: TrustBadgeSet | null
  verifiedOverride?: boolean
  style?: React.CSSProperties
}) {
  const { t } = useLanguage()

  const verified = verifiedOverride || !!badges?.verified
  const superhost = !!badges?.superhost
  // "New host" only when they ARE a host and aren't already a superhost.
  const newHost = !!badges?.newHost && !superhost

  if (!verified && !superhost && !newHost) return null

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        ...style,
      }}
    >
      {verified && (
        <Pill
          tone={TONES.verified}
          label={t('badge.verified')}
          title={t('badge.verifiedTitle')}
          withCheck
        />
      )}
      {superhost && (
        <Pill tone={TONES.superhost} label={t('badge.superhost')} title={t('badge.superhostTitle')} />
      )}
      {newHost && (
        <Pill tone={TONES.newHost} label={t('badge.newHost')} title={t('badge.newHostTitle')} />
      )}
    </span>
  )
}
