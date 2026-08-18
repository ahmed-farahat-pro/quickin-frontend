'use client'

// /login and /signup are full-page cards with no site chrome around them, so once a
// guest lands there the only ways out are the browser's own Back button and the
// address bar. This is the missing door: a link back to browsing that every view of
// the flow keeps on screen.

import { useSyncExternalStore } from 'react'
import { useLocale } from 'next-intl'
import { getDirection, locales, type Locale } from '@/i18n/config'
import { BROWSE_FALLBACK, resolveReturnHref } from '@/lib/local/auth-exit-core'

const COLORS = {
  burgundy: '#5B0F16',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

function readReturnHref(): string {
  return resolveReturnHref(document.referrer, window.location.origin, locales)
}

function serverReturnHref(): string {
  return BROWSE_FALLBACK
}

/** The referrer can't change for the life of the document, so there's nothing to watch. */
function subscribeToNothing(): () => void {
  return () => {}
}

/**
 * The referrer only exists on the client, so the server snapshot is the fallback and
 * React swaps in the real destination on hydration. Either way the exit is a real,
 * working `<a href>` — which matters most in the case where JS is what broke.
 */
export function useAuthReturnHref(): string {
  return useSyncExternalStore(subscribeToNothing, readReturnHref, serverReturnHref)
}

function BackChevron({ flipped }: { flipped: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      // The chevron points at the inline start, which is the right in Arabic.
      style={{ transform: flipped ? 'scaleX(-1)' : undefined, flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

/**
 * "Keep browsing" escape hatch for the auth pages. `label` comes from the caller so
 * each page can use its own message namespace.
 */
export default function AuthExitLink({ label }: { label: string }) {
  const locale = useLocale() as Locale
  const href = useAuthReturnHref()

  return (
    <a
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        fontFamily: FONT,
        fontSize: 14,
        fontWeight: 600,
        color: COLORS.muted,
        textDecoration: 'none',
        // Pulled back into the card's padding so the label lines up with the fields
        // while the tap target still clears the 44px minimum. Logical properties, so
        // the outdent lands on the correct side in Arabic.
        marginBlockStart: -8,
        marginInlineStart: -8,
        padding: 8,
        borderRadius: 12,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = COLORS.burgundy
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = COLORS.muted
      }}
    >
      <BackChevron flipped={getDirection(locale) === 'rtl'} />
      {label}
    </a>
  )
}
