'use client'

// Reusable "Share" chip — preserves the redesign's pressable pill (qk-press).
// Uses the Web Share API (navigator.share) where available (mobile + some
// desktop browsers), which surfaces the native share sheet → "open in app if
// installed, else website". Where share is unavailable it falls back to copying
// the link to the clipboard and briefly flips to a "Copied!" state.
//
// `path` is an app-relative path (e.g. "/explore/123"); we resolve it against
// the live origin at click time so shared URLs always point at the real domain.
import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/lib/i18n/language-provider'

const BURGUNDY = '#5B0F16'

export default function ShareButton({
  // App-relative path to share, e.g. "/explore/abc". Resolved against the
  // current origin on click.
  path,
  // Title passed to the native share sheet (falls back to document.title).
  title,
  // Visual size of the round button.
  size = 44,
}: {
  path: string
  title?: string
  size?: number
}) {
  const { t } = useLanguage()
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear the pending "Copied!" reset if the component unmounts.
  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

  async function onClick() {
    if (typeof window === 'undefined') return

    const url = new URL(path, window.location.origin).toString()
    const shareTitle = title || document.title || 'QuickIn'

    // Prefer the native share sheet when present.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: shareTitle, url })
        return
      } catch {
        // User dismissed the sheet, or share failed — fall through to copy.
      }
    }

    // Clipboard fallback (+ brief "Copied!" state).
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        // Last-resort fallback for older browsers without the async clipboard.
        const ta = document.createElement('textarea')
        ta.value = url
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      if (resetTimer.current) clearTimeout(resetTimer.current)
      resetTimer.current = setTimeout(() => setCopied(false), 1800)
    } catch {
      // If even copying fails there's nothing more we can do silently.
    }
  }

  const label = copied ? t('share.copied') : t('share.label')
  const iconSize = Math.round(size / 2)

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="qk-press"
      style={{
        appearance: 'none',
        width: size,
        height: size,
        padding: 0,
        borderRadius: 999,
        border: 'none',
        background: 'rgba(255,255,255,0.92)',
        color: BURGUNDY,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(42,34,32,0.16)',
        cursor: 'pointer',
      }}
    >
      {copied ? (
        // Checkmark while in the "Copied!" state.
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke={BURGUNDY}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        // Share / upload glyph (node-link-node with an up arrow).
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke={BURGUNDY}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
          <path d="M16 6l-4-4-4 4" />
          <path d="M12 2v14" />
        </svg>
      )}
    </button>
  )
}
