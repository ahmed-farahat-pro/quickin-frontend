// Wishlist client helpers — shared by the explore cards, the listing detail
// page, and the /wishlist page so the fetch + toggle contract lives in one
// place. All calls require the bearer token in localStorage (qk_token); the UI
// routes unauthenticated users to /login before calling these.
import { API_URL, getToken, type WishlistResponse } from '@/lib/api'

export type WishlistItemType = 'listing' | 'service'

// Fetch the signed-in user's wishlist. Returns null when signed out / on error
// so callers can simply skip lighting up hearts.
export async function fetchWishlist(
  signal?: AbortSignal
): Promise<WishlistResponse | null> {
  const token = getToken()
  if (!token) return null
  try {
    const res = await fetch(`${API_URL}/api/local/wishlist`, {
      headers: { Authorization: 'Bearer ' + token },
      signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as Partial<WishlistResponse>
    return {
      listings: Array.isArray(data.listings) ? data.listings : [],
      services: Array.isArray(data.services) ? data.services : [],
      listingIds: Array.isArray(data.listingIds) ? data.listingIds : [],
      serviceIds: Array.isArray(data.serviceIds) ? data.serviceIds : [],
    }
  } catch {
    return null
  }
}

// Fetch only the saved-id sets (cheap membership lists for hearts). Returns
// empty sets when signed out / on error.
export async function fetchWishlistIds(
  signal?: AbortSignal
): Promise<{ listingIds: Set<string>; serviceIds: Set<string> }> {
  const data = await fetchWishlist(signal)
  return {
    listingIds: new Set(data?.listingIds ?? []),
    serviceIds: new Set(data?.serviceIds ?? []),
  }
}

// Toggle (or explicitly add/remove) an item. Resolves to the server's new saved
// state. Throws when signed out or the request fails so callers can roll back an
// optimistic update.
export async function toggleWishlist(
  itemType: WishlistItemType,
  itemId: string,
  action: 'toggle' | 'add' | 'remove' = 'toggle'
): Promise<boolean> {
  const token = getToken()
  if (!token) throw new Error('not-signed-in')
  const res = await fetch(`${API_URL}/api/local/wishlist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ item_type: itemType, item_id: itemId, action }),
  })
  if (!res.ok) throw new Error(`wishlist-failed-${res.status}`)
  const data = (await res.json().catch(() => ({}))) as { saved?: boolean }
  return Boolean(data.saved)
}
