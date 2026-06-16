'use client'

// Wishlist heart toggle — preserves the redesign's round white "qk-heart qk-pop"
// chip. Filled burgundy when saved, outline when not. Optimistic: it flips the
// heart immediately, POSTs to the wishlist API, and rolls back if the request
// fails. Signed-out users are routed to /login (with a return path). Used on the
// explore cards and the listing detail page.
import { useEffect, useState } from 'react'
import { getToken } from '@/lib/api'
import { fetchWishlistIds, toggleWishlist, type WishlistItemType } from '@/lib/wishlist'
import { useLanguage } from '@/lib/i18n/language-provider'
import { useToast } from './toast'

const BURGUNDY = '#5B0F16'

export default function HeartButton({
  itemType,
  itemId,
  initialSaved = false,
  size = 36,
  // When true (default), the button stops the click bubbling to a parent <a>
  // (the explore card link). Set false on the detail page where it stands alone.
  stopPropagation = true,
  // Fired after a successful toggle with the new saved state. The /wishlist page
  // uses this to drop a card from the grid when it's un-saved.
  onChange,
  // When true, the button fetches its own saved state on mount (signed-in only).
  // Used on the listing detail page, a server component that can't pre-compute
  // `initialSaved`. The explore grid passes `initialSaved` from a single shared
  // fetch instead, so it leaves this off.
  autoFetchSaved = false,
}: {
  itemType: WishlistItemType
  itemId: string
  initialSaved?: boolean
  size?: number
  stopPropagation?: boolean
  onChange?: (saved: boolean) => void
  autoFetchSaved?: boolean
}) {
  const { t } = useLanguage()
  const toast = useToast()
  const [saved, setSaved] = useState(initialSaved)
  const [busy, setBusy] = useState(false)

  // Self-fetch the saved state on mount when asked (detail page). Skips silently
  // when signed out or on error.
  useEffect(() => {
    if (!autoFetchSaved || !getToken()) return
    const controller = new AbortController()
    ;(async () => {
      const { listingIds, serviceIds } = await fetchWishlistIds(controller.signal)
      if (controller.signal.aborted) return
      const set = itemType === 'listing' ? listingIds : serviceIds
      setSaved(set.has(itemId))
    })()
    return () => controller.abort()
  }, [autoFetchSaved, itemType, itemId])

  async function onClick(e: React.MouseEvent) {
    if (stopPropagation) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (busy) return

    // Signed-out → prompt, then send to login, preserving where they were.
    if (!getToken()) {
      toast.show(t('wishlist.signInToSave'), { kind: 'info' })
      const here =
        typeof window !== 'undefined'
          ? window.location.pathname + window.location.search
          : '/explore'
      window.location.href = `/login?redirect=${encodeURIComponent(here)}`
      return
    }

    const next = !saved
    setSaved(next) // optimistic
    setBusy(true)
    try {
      const serverSaved = await toggleWishlist(
        itemType,
        itemId,
        next ? 'add' : 'remove'
      )
      // Reconcile with the server's authoritative result (never desync) and
      // base the feedback on what the server actually did.
      setSaved(serverSaved)
      onChange?.(serverSaved)
      toast.show(
        serverSaved ? t('wishlist.added') : t('wishlist.removed'),
        { kind: 'success' }
      )
    } catch {
      setSaved(!next) // roll back the optimistic flip
      toast.show(t('wishlist.actionFailed'), { kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const iconSize = Math.round(size / 2)
  const label = saved ? t('wishlist.remove') : t('wishlist.save')

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      className="qk-heart qk-pop"
      style={{
        appearance: 'none',
        width: size,
        height: size,
        padding: 0,
        borderRadius: 999,
        border: 'none',
        background: 'rgba(255,255,255,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(42,34,32,0.16)',
        cursor: busy ? 'progress' : 'pointer',
      }}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill={saved ? BURGUNDY : 'none'}
        stroke={BURGUNDY}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8Z" />
      </svg>
    </button>
  )
}
