// Base URL of the QuickIn backend API.
// Set NEXT_PUBLIC_API_URL in the environment (.env.local for dev, Vercel env for
// production). Falls back to the local backend default during development.
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000'

// ---- Shared data shapes (mirror the backend JSON responses) -----------------

// A listing's cancellation policy. Drives the refund a guest gets when they
// cancel (see getCancellationQuote). Mirrors the backend enum.
export type CancellationPolicy = 'flexible' | 'moderate' | 'strict'

// A listing's moderation state. New listings start `pending` (unpublished, not
// shown publicly) until an admin approves them; `rejected` keeps them
// unpublished. Mirrors the backend's `approval_status`.
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface ListingImage {
  url: string
  order: number
}

export interface Listing {
  id: string
  title: string
  description: string | null
  location: string | null
  country: string | null
  price_per_night: number
  currency: string
  bedrooms: number | null
  beds: number | null
  bathrooms: number | null
  max_guests: number | null
  property_type: string | null
  region: string | null
  is_guest_favorite: boolean
  listing_code: string | null
  lat: number | null
  lng: number | null
  listing_images: ListingImage[]
  amenities?: string[]
  // Real aggregate review stats (backend computes these). `rating` is the
  // average (0 when there are no reviews); `review_count` is how many.
  rating?: number
  review_count?: number
  // The host who owns this listing. `host_id` powers the "More from this host"
  // section (GET /api/local/listings?host=<host_id>); `host_name` is the display
  // label shown on the detail page. Both may be absent on older rows.
  host_id?: string | null
  host_name?: string | null
  // The host-set cancellation policy. The backend defaults missing rows to
  // 'moderate', so it's effectively always present, but typed optional for
  // older cached shapes.
  cancellation_policy?: CancellationPolicy
  // Whether the listing's host has a verified identity. Powers the "Verified"
  // trust chip on the host area without an extra profile fetch.
  host_verified?: boolean
  // Moderation state. New listings are created `pending` (and unpublished) and
  // only go public once an admin approves them. Typed optional for older cached
  // shapes; the host listings + admin queue surface it as a badge.
  approval_status?: ApprovalStatus
  // The host-submitted ownership / right-to-rent document (a data:/http image
  // URL). Only returned to the listing's host and to admins (in the moderation
  // queue); absent on public listing responses.
  ownership_doc?: string | null
  // Length-of-stay discounts (percent off), set by the host. The backend applies
  // them to booking totals automatically (≥28 nights → monthly%, ≥7 → weekly%).
  // 0 / absent means no discount. Typed optional for older cached shapes.
  weekly_discount?: number
  monthly_discount?: number
}

// ---- Listing search filters -------------------------------------------------

// The full set of query filters GET /api/local/listings accepts. All fields are
// optional; only the populated ones are serialized into the query string by
// buildListingQuery() below. `amenities` is a list (a listing must have ALL of
// them); `propertyType` is a single coarse type (matched case-insensitively);
// `bbox` is a viewport "minLng,minLat,maxLng,maxLat" used by "Search this area".
export interface ListingFilters {
  // Free-text destination search. NB: the backend param is `location`.
  location?: string
  checkIn?: string
  checkOut?: string
  guests?: string
  region?: string
  sort?: 'recommended' | 'price_asc' | 'price_desc' | 'newest'
  minPrice?: string
  maxPrice?: string
  // One of: Apartment, Chalet, House, Villa (case-insensitive on the backend).
  propertyType?: string
  // Canonical amenity strings (see host AMENITIES). A listing must have ALL.
  amenities?: string[]
  // Map viewport as GeoJSON order: west,south,east,north (minLng,minLat,maxLng,maxLat).
  bbox?: string
}

// Serialize ListingFilters into a query string for GET /api/local/listings.
// Empty/whitespace-only/default values are omitted so the URL stays clean and
// equal filter states produce equal strings (used to skip redundant fetches).
export function buildListingQuery(f: ListingFilters): string {
  const params = new URLSearchParams()
  const loc = f.location?.trim()
  if (loc) params.set('location', loc)
  if (f.checkIn) params.set('checkIn', f.checkIn)
  if (f.checkOut) params.set('checkOut', f.checkOut)
  const guests = f.guests?.trim()
  if (guests) params.set('guests', guests)
  if (f.region) params.set('region', f.region)
  if (f.sort && f.sort !== 'recommended') params.set('sort', f.sort)
  const minPrice = f.minPrice?.trim()
  if (minPrice) params.set('minPrice', minPrice)
  const maxPrice = f.maxPrice?.trim()
  if (maxPrice) params.set('maxPrice', maxPrice)
  const propertyType = f.propertyType?.trim()
  if (propertyType) params.set('propertyType', propertyType)
  const amenities = (f.amenities ?? []).map((a) => a.trim()).filter(Boolean)
  if (amenities.length) params.set('amenities', amenities.join(','))
  const bbox = f.bbox?.trim()
  if (bbox) params.set('bbox', bbox)
  return params.toString()
}

// Fetch listings from the backend with the given filters. `signal` lets callers
// abort a stale in-flight request (live search). Throws on a non-2xx response so
// callers can show an error; returns the parsed Listing[] otherwise.
export async function getListings(
  filters: ListingFilters,
  signal?: AbortSignal
): Promise<Listing[]> {
  const query = buildListingQuery(filters)
  const res = await fetch(
    `${API_URL}/api/local/listings${query ? `?${query}` : ''}`,
    { signal }
  )
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? (data as Listing[]) : []
}

// ---- Availability -----------------------------------------------------------

// One unavailable span on a listing's calendar. The range is HALF-OPEN
// [start, end): the start day is taken but the `end` (check-out) day is free
// again as a new check-in. `kind` distinguishes a guest booking from a
// host-placed block (only blocks are removable by the host). Dates are
// "YYYY-MM-DD". Mirrors GET /api/local/listings/:id/availability.
export interface AvailabilitySpan {
  id: string
  start: string
  end: string
  kind: 'booked' | 'blocked'
  note: string | null
}

// Fetch a listing's unavailable spans (public, no auth). `signal` lets callers
// abort a stale request. Returns [] on any non-2xx / parse error so the UI can
// degrade gracefully (calendar simply shows nothing disabled).
export async function getAvailability(
  listingId: string,
  signal?: AbortSignal
): Promise<AvailabilitySpan[]> {
  try {
    const res = await fetch(
      `${API_URL}/api/local/listings/${encodeURIComponent(listingId)}/availability`,
      { signal, cache: 'no-store' }
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as AvailabilitySpan[]) : []
  } catch {
    return []
  }
}

export interface Booking {
  id: string
  listing_id: string
  check_in: string
  check_out: string
  guests: number
  total_price: number
  status: string
  created_at: string
  title: string
  location: string | null
  image: string | null
  reservation_code?: string | null
  // Cancellation fields (present on every booking row; the policy comes from
  // the listing, the rest are filled in once the guest cancels).
  cancellation_policy?: CancellationPolicy
  cancelled_at?: string | null
  refund_percent?: number | null
}

// One row of the host's "Reservation requests" list (GET /host/bookings).
export interface HostBooking {
  id: string
  reservation_code: string | null
  title: string
  location: string | null
  check_in: string
  check_out: string
  guests: number
  total_price: number
  status: 'pending' | 'confirmed' | 'rejected' | string
  user_id: string
}

// A single reservation (GET /bookings/:id) — owner or host view.
export interface Reservation {
  id: string
  reservation_code: string | null
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled' | string
  title: string
  location: string | null
  check_in: string
  check_out: string
  guests: number
  total_price: number
  // Cancellation fields (see Booking).
  cancellation_policy?: CancellationPolicy
  cancelled_at?: string | null
  refund_percent?: number | null
}

// A standalone experience a host offers (jet ski, diving, yacht…). Browsed
// publicly at /services and subscribed to like a booking. Mirrors the backend
// GET /api/local/services JSON.
export interface Service {
  id: string
  host_id: string
  host_name: string | null
  title: string
  description: string | null
  category: string | null
  location: string | null
  price: number
  currency: string
  image_url: string | null
  lat: number | null
  lng: number | null
  is_published: boolean
  created_at: string
}

// One subscription (request) to a service — the user-facing equivalent of a
// booking. Returned by GET /api/local/service-requests (user) and
// GET /api/local/host/service-requests (host inbox); both share this shape.
export interface ServiceRequest {
  id: string
  service_id: string
  user_id: string
  status: 'pending' | 'confirmed' | 'rejected' | string
  preferred_date: string | null
  note: string | null
  request_code: string | null
  created_at: string
  service_title: string
  service_category: string | null
  service_image: string | null
  service_price: number
  service_currency: string
  service_location: string | null
  host_id: string
  host_name: string | null
  requester_name: string | null
  requester_email: string | null
}

// ---- Wishlist ---------------------------------------------------------------

// GET /api/local/wishlist (Bearer) — the user's saved items. `listings` and
// `services` are full objects (for rendering cards); the *Ids arrays are the
// cheap membership lists used to light up already-saved hearts.
export interface WishlistResponse {
  listings: Listing[]
  services: Service[]
  listingIds: string[]
  serviceIds: string[]
}

// ---- Reviews ----------------------------------------------------------------

// One public review of a listing (GET /api/local/reviews?listing_id=ID).
// `photos` is a list (≤6) of data:/http image URLs the guest attached; may be
// absent/empty on older rows or text-only reviews.
export interface Review {
  rating: number
  comment: string | null
  reviewer_name: string | null
  created_at: string
  photos?: string[]
}

// A stay the signed-in user can review (GET /api/local/reviews with Bearer):
// a confirmed booking whose checkout has passed and isn't reviewed yet.
export interface ReviewableStay {
  booking_id: string
  listing_id: string
  title: string
  check_out: string
}

// One public review a host left ABOUT a guest
// (GET /api/local/guest-reviews?guest_id=ID).
export interface GuestReview {
  id: string
  booking_id: string
  guest_id: string
  host_id: string
  rating: number
  comment: string | null
  created_at: string
  host_name: string | null
}

// A past stay the signed-in HOST can review the GUEST for
// (GET /api/local/guest-reviews with Bearer).
export interface ReviewableGuest {
  booking_id: string
  listing_id: string
  title: string
  guest_name: string | null
  check_out: string
}

// Fetch the public reviews a guest has received (host → guest). Returns [] on
// any non-2xx / parse error so callers can degrade gracefully.
export async function getGuestReviews(
  guestId: string,
  signal?: AbortSignal
): Promise<GuestReview[]> {
  try {
    const res = await fetch(
      `${API_URL}/api/local/guest-reviews?guest_id=${encodeURIComponent(guestId)}`,
      { signal }
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as GuestReview[]) : []
  } catch {
    return []
  }
}

// Fetch the past stays the signed-in host can review their guest for. Requires
// the bearer token. Returns [] on any non-2xx / parse error.
export async function getReviewableGuests(
  token: string,
  signal?: AbortSignal
): Promise<ReviewableGuest[]> {
  try {
    const res = await fetch(`${API_URL}/api/local/guest-reviews`, {
      headers: { Authorization: 'Bearer ' + token },
      signal,
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as ReviewableGuest[]) : []
  } catch {
    return []
  }
}

// Host leaves (or replaces) a review about a guest for a past stay. Resolves to
// the Response so callers can branch on res.ok / res.status themselves.
export async function postGuestReview(
  token: string,
  body: { booking_id: string; rating: number; comment: string }
): Promise<Response> {
  return fetch(`${API_URL}/api/local/guest-reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(body),
  })
}

// ---- Cancellation -----------------------------------------------------------

// What a guest would get back if they cancelled now. Mirrors GET (no mutation)
// and the `refund` block of POST /api/local/bookings/:id/cancel.
export interface CancellationQuote {
  policy: CancellationPolicy
  daysUntilCheckIn: number
  refundPercent: number
  refundAmount: number
  total: number
  currency: string
}

// Fetch the refund quote for cancelling a booking (no mutation). Bearer = the
// booking's guest. Throws on a non-2xx response so callers can surface an error.
export async function getCancellationQuote(
  token: string,
  bookingId: string,
  signal?: AbortSignal
): Promise<CancellationQuote> {
  const res = await fetch(
    `${API_URL}/api/local/bookings/${encodeURIComponent(bookingId)}/cancel`,
    {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
      signal,
    }
  )
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return (await res.json()) as CancellationQuote
}

// Cancel a booking. Bearer = the booking's guest. Resolves to the updated
// booking (status 'cancelled') plus the applied refund quote. Throws on a
// non-2xx response (e.g. 400 when the booking isn't cancellable).
export async function cancelBooking(
  token: string,
  bookingId: string
): Promise<{ booking: Booking; refund: CancellationQuote }> {
  const res = await fetch(
    `${API_URL}/api/local/bookings/${encodeURIComponent(bookingId)}/cancel`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
    }
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data && data.error) || `Request failed: ${res.status}`)
  }
  return (await res.json()) as { booking: Booking; refund: CancellationQuote }
}

// Host updates a listing's cancellation policy. Bearer must be the listing's
// host (403 otherwise). Resolves to the refreshed listing; throws on non-2xx.
export async function updateListingPolicy(
  token: string,
  listingId: string,
  policy: CancellationPolicy
): Promise<Listing> {
  const res = await fetch(
    `${API_URL}/api/local/listings/${encodeURIComponent(listingId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({ cancellation_policy: policy }),
    }
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data && data.error) || `Request failed: ${res.status}`)
  }
  return (await res.json()) as Listing
}

// ---- Growth: length-of-stay discounts ---------------------------------------

// Host updates a listing's length-of-stay discounts (percent off). Bearer must
// be the listing's host (403 otherwise). `weekly` applies at ≥7 nights and
// `monthly` at ≥28 nights (the backend applies them to totals). Resolves to the
// refreshed listing; throws on non-2xx.
export async function updateListingDiscounts(
  token: string,
  listingId: string,
  discounts: { weekly_discount: number; monthly_discount: number }
): Promise<Listing> {
  const res = await fetch(
    `${API_URL}/api/local/listings/${encodeURIComponent(listingId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({
        weekly_discount: discounts.weekly_discount,
        monthly_discount: discounts.monthly_discount,
      }),
    }
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data && data.error) || `Request failed: ${res.status}`)
  }
  return (await res.json()) as Listing
}

// ---- Growth: promo codes ----------------------------------------------------

// The preview a promo code yields against a given subtotal. `kind` is the
// discount type; `value` its raw amount (percent or fixed); `discount` the EGP
// the guest would save; `message` a human reason when invalid. Mirrors
// POST /api/local/promo/validate.
export interface PromoPreview {
  valid: boolean
  code: string | null
  kind: 'percent' | 'fixed' | null
  value: number | null
  discount: number
  message: string | null
}

// Preview a promo code against the current subtotal (no mutation, no auth). The
// real discount is applied server-side at /pay. Returns a safe `invalid`
// preview on any non-2xx / parse error so the UI can simply show "invalid".
export async function validatePromo(
  code: string,
  subtotal: number
): Promise<PromoPreview> {
  try {
    const res = await fetch(`${API_URL}/api/local/promo/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, subtotal }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        valid: false,
        code: null,
        kind: null,
        value: null,
        discount: 0,
        message: (data && data.message) || (data && data.error) || null,
      }
    }
    return {
      valid: Boolean(data && data.valid),
      code: (data && data.code) ?? null,
      kind: (data && data.kind) ?? null,
      value: typeof data?.value === 'number' ? data.value : null,
      discount: typeof data?.discount === 'number' ? data.discount : 0,
      message: (data && data.message) ?? null,
    }
  } catch {
    return { valid: false, code: null, kind: null, value: null, discount: 0, message: null }
  }
}

// ---- Growth: referrals ------------------------------------------------------

// One friend the user has referred (GET /api/local/referrals → referred[]).
export interface ReferredFriend {
  name: string | null
  created_at: string
  reward_amount: number
}

// The signed-in user's referral surface: their shareable `code`, how many
// friends they've brought (`count`), the total reward earned (`rewardTotal`),
// and the list of referred friends. Mirrors GET /api/local/referrals.
export interface ReferralState {
  code: string
  count: number
  rewardTotal: number
  referred: ReferredFriend[]
}

// Fetch the signed-in user's referral code + stats. Bearer = the user. Returns
// null on any non-2xx / parse error so callers can hide the surface gracefully.
export async function getReferrals(
  token: string,
  signal?: AbortSignal
): Promise<ReferralState | null> {
  try {
    const res = await fetch(`${API_URL}/api/local/referrals`, {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
      signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data || typeof data !== 'object') return null
    return {
      code: String(data.code ?? ''),
      count: Number(data.count ?? 0),
      rewardTotal: Number(data.rewardTotal ?? 0),
      referred: Array.isArray(data.referred) ? (data.referred as ReferredFriend[]) : [],
    }
  } catch {
    return null
  }
}

// ---- Listing approval: ownership document -----------------------------------

// Host (re)submits the ownership / proof-of-right-to-rent document for a
// listing. `doc` is a data:image/* URL (downscale via lib/image first). Bearer
// must be the listing's host (403 otherwise). This re-queues the listing to
// `pending`. Resolves to the refreshed listing; throws on non-2xx.
export async function submitOwnershipDoc(
  token: string,
  listingId: string,
  doc: string
): Promise<Listing> {
  const res = await fetch(
    `${API_URL}/api/local/listings/${encodeURIComponent(listingId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({ ownership_doc: doc }),
    }
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data && data.error) || `Request failed: ${res.status}`)
  }
  return (await res.json()) as Listing
}

// ---- Trust & safety: identity verification ----------------------------------

// A user's identity-verification state. `unverified` (never submitted) →
// `pending` (an ID is awaiting admin review) → `verified` / `rejected`.
export type VerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected'

// GET /api/local/verification (Bearer). The signed-in user's own status, plus
// when they were verified (null until approved).
export interface VerificationState {
  status: VerificationStatus
  verified_at: string | null
}

// Fetch the signed-in user's verification status. Bearer = the user. Returns a
// safe `unverified` default on any non-2xx / parse error so the UI never breaks.
export async function getVerification(
  token: string,
  signal?: AbortSignal
): Promise<VerificationState> {
  try {
    const res = await fetch(`${API_URL}/api/local/verification`, {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
      signal,
    })
    if (!res.ok) return { status: 'unverified', verified_at: null }
    const data = await res.json()
    const status = (data && data.status) as VerificationStatus
    return {
      status: status || 'unverified',
      verified_at: (data && data.verified_at) ?? null,
    }
  } catch {
    return { status: 'unverified', verified_at: null }
  }
}

// Submit an ID image (a data:image/* URL) for review. Bearer = the user; on
// success the status flips to `pending`. Resolves to the updated state; throws
// on a non-2xx response (e.g. 400 missing/too large) so callers can surface it.
export async function submitVerification(
  token: string,
  doc: string
): Promise<VerificationState> {
  const res = await fetch(`${API_URL}/api/local/verification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ doc }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data && data.error) || `Request failed: ${res.status}`)
  }
  const data = await res.json().catch(() => ({}))
  return {
    status: (data && data.status) || 'pending',
    verified_at: (data && data.verified_at) ?? null,
  }
}

// ---- Trust & safety: public profile + badges --------------------------------

// The trust badges the backend computes for a host/user. All booleans/counts
// are derived server-side from reviews, stays, and verification.
export interface TrustBadgeSet {
  verified: boolean
  superhost: boolean
  newHost: boolean
  isHost: boolean
  completedStays: number
  reviewCount: number
  hostRating: number
  memberSince: string | null
}

// GET /api/local/users/:id — a PUBLIC profile. Deliberately carries NO private
// fields (email/phone/id) — only what's safe to show on a listing/host page.
export interface PublicProfile {
  id: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  verification_status: VerificationStatus
  guest_rating: number
  guest_review_count: number
  badges: TrustBadgeSet
}

// Fetch a user's public profile + trust badges (no auth). Returns null on any
// non-2xx / parse error so callers can degrade (hide the badges) gracefully.
export async function getPublicProfile(
  userId: string,
  signal?: AbortSignal
): Promise<PublicProfile | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/local/users/${encodeURIComponent(userId)}`,
      { signal }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data && typeof data === 'object' ? (data as PublicProfile) : null
  } catch {
    return null
  }
}

// ---- Trust & safety: reporting ----------------------------------------------

// What can be reported. Drives POST /api/local/reports { target_type }.
export type ReportTargetType = 'listing' | 'user' | 'review'

// File a report against a listing/user/review. Bearer = the reporter (sign-in
// required). Resolves to the created report id; throws on a non-2xx response.
export async function createReport(
  token: string,
  body: {
    target_type: ReportTargetType
    target_id: string
    reason: string
    details?: string
  }
): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(`${API_URL}/api/local/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data && data.error) || `Request failed: ${res.status}`)
  }
  return (await res.json()) as { ok: boolean; id: string }
}

// ---- Trust & safety: admin triage -------------------------------------------

// One pending identity-verification submission in the admin queue
// (GET /api/local/admin/verifications). `verification_doc` is the submitted ID
// image (data:/http URL) shown as a thumbnail for review.
export interface AdminVerification {
  id: string
  full_name: string | null
  email: string | null
  verification_doc: string | null
  role: string | null
}

// Fetch the pending verification submissions. Bearer = admin. Returns [] on any
// non-2xx / parse error.
export async function listVerifications(
  token: string,
  signal?: AbortSignal
): Promise<AdminVerification[]> {
  try {
    const res = await fetch(`${API_URL}/api/local/admin/verifications`, {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
      signal,
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as AdminVerification[]) : []
  } catch {
    return []
  }
}

// Approve or reject a user's identity verification. Bearer = admin. Throws on a
// non-2xx response so the caller can toast the error.
export async function setVerification(
  token: string,
  userId: string,
  action: 'approve' | 'reject'
): Promise<void> {
  const res = await fetch(`${API_URL}/api/local/admin/verifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ user_id: userId, action }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data && data.error) || `Request failed: ${res.status}`)
  }
}

// One report row in the admin queue (GET /api/local/admin/reports?status=open).
export interface AdminReport {
  id: string
  reporter_id: string
  reporter_name: string | null
  target_type: ReportTargetType
  target_id: string
  reason: string
  details: string | null
  status: string
  created_at: string
  resolved_at: string | null
}

// Fetch reports filtered by status (default 'open'). Bearer = admin. Returns []
// on any non-2xx / parse error.
export async function listReports(
  token: string,
  status: string = 'open',
  signal?: AbortSignal
): Promise<AdminReport[]> {
  try {
    const res = await fetch(
      `${API_URL}/api/local/admin/reports?status=${encodeURIComponent(status)}`,
      {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
        signal,
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as AdminReport[]) : []
  } catch {
    return []
  }
}

// Resolve or dismiss a report. Bearer = admin. Throws on a non-2xx response.
export async function resolveReport(
  token: string,
  reportId: string,
  action: 'resolve' | 'dismiss'
): Promise<void> {
  const res = await fetch(`${API_URL}/api/local/admin/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ report_id: reportId, action }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data && data.error) || `Request failed: ${res.status}`)
  }
}

// ---- Listing approval: admin moderation queue -------------------------------

// One pending listing in the admin moderation queue
// (GET /api/local/admin/listings). It's a full Listing object PLUS the host's
// email and the submitted ownership document, both shown for the review.
export interface AdminPendingListing extends Listing {
  host_email: string | null
  ownership_doc: string | null
}

// Fetch the listings awaiting moderation. Bearer = admin. Returns [] on any
// non-2xx / parse error.
export async function listPendingListings(
  token: string,
  signal?: AbortSignal
): Promise<AdminPendingListing[]> {
  try {
    const res = await fetch(`${API_URL}/api/local/admin/listings`, {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
      signal,
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as AdminPendingListing[]) : []
  } catch {
    return []
  }
}

// Approve or reject a pending listing. Approve publishes it; reject unpublishes
// it. Bearer = admin. Throws on a non-2xx response so the caller can toast it.
export async function moderateListing(
  token: string,
  listingId: string,
  action: 'approve' | 'reject'
): Promise<void> {
  const res = await fetch(`${API_URL}/api/local/admin/listings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ listing_id: listingId, action }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data && data.error) || `Request failed: ${res.status}`)
  }
}

// ---- Growth: admin promo codes ----------------------------------------------

// One promo code in the admin panel (GET /api/local/admin/promos). `kind` is the
// discount type; `value` its raw amount (percent or fixed EGP). `redemptions`
// counts how many times it's been used; `max_redemptions` / `expires_at` are
// optional limits (null = unlimited / never expires).
export interface AdminPromo {
  id: string
  code: string
  kind: 'percent' | 'fixed'
  value: number
  active: boolean
  redemptions: number
  max_redemptions: number | null
  expires_at: string | null
}

// Fetch all promo codes. Bearer = admin. Returns [] on any non-2xx / parse error.
export async function listPromos(
  token: string,
  signal?: AbortSignal
): Promise<AdminPromo[]> {
  try {
    const res = await fetch(`${API_URL}/api/local/admin/promos`, {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
      signal,
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as AdminPromo[]) : []
  } catch {
    return []
  }
}

// Create or update a promo code. Bearer = admin. The backend upserts on `code`.
// Resolves to the saved promo; throws on a non-2xx response so the caller can
// toast the error.
export async function upsertPromo(
  token: string,
  body: {
    code: string
    kind: 'percent' | 'fixed'
    value: number
    max_redemptions?: number | null
    expires_at?: string | null
  }
): Promise<AdminPromo> {
  const res = await fetch(`${API_URL}/api/local/admin/promos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data && data.error) || `Request failed: ${res.status}`)
  }
  return (await res.json()) as AdminPromo
}

// Enable / disable a promo code by id. Bearer = admin. Throws on a non-2xx
// response.
export async function togglePromo(
  token: string,
  id: string,
  active: boolean
): Promise<void> {
  const res = await fetch(`${API_URL}/api/local/admin/promos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ id, action: 'toggle', active }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data && data.error) || `Request failed: ${res.status}`)
  }
}

// Delete a promo code by id. Bearer = admin. Throws on a non-2xx response.
export async function deletePromo(token: string, id: string): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/local/admin/promos?id=${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token },
    }
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data && data.error) || `Request failed: ${res.status}`)
  }
}

// ---- Money: host earnings & payouts -----------------------------------------

// One booking row in the host's earnings breakdown. `gross` is what the guest
// paid for the stay; `net` is what the host keeps after the platform commission
// (host keeps 90% — commissionRate 0.1). `status` is 'paid_out' once the stay is
// complete, else 'upcoming'. `paid_at` is when the payout cleared (null while
// upcoming). All amounts are EGP. Mirrors GET /api/local/host/earnings → recent[].
export interface HostEarningRow {
  booking_id: string
  title: string
  check_in: string
  check_out: string
  gross: number
  net: number
  status: 'paid_out' | 'upcoming'
  paid_at: string | null
}

// The host's earnings dashboard (GET /api/local/host/earnings, Bearer = host).
// `totalEarned` is lifetime net; `paidOut` is what's already cleared; `pending`
// is the net still upcoming. `commissionRate` is the platform's cut (0.1 → host
// keeps 90%). All amounts are EGP.
export interface HostEarnings {
  currency: string
  totalEarned: number
  paidOut: number
  pending: number
  bookingsCount: number
  commissionRate: number
  recent: HostEarningRow[]
}

// Fetch the signed-in host's earnings + per-booking breakdown. Bearer = host.
// Returns null on any non-2xx / parse error so the dashboard can degrade
// gracefully (show an empty/retry state).
export async function getHostEarnings(
  token: string,
  signal?: AbortSignal
): Promise<HostEarnings | null> {
  try {
    const res = await fetch(`${API_URL}/api/local/host/earnings`, {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
      signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data || typeof data !== 'object') return null
    return {
      currency: String(data.currency ?? 'EGP'),
      totalEarned: Number(data.totalEarned ?? 0),
      paidOut: Number(data.paidOut ?? 0),
      pending: Number(data.pending ?? 0),
      bookingsCount: Number(data.bookingsCount ?? 0),
      commissionRate: Number(data.commissionRate ?? 0.1),
      recent: Array.isArray(data.recent) ? (data.recent as HostEarningRow[]) : [],
    }
  } catch {
    return null
  }
}

// ---- Money: guest receipts --------------------------------------------------

// One paid receipt for the signed-in guest (GET /api/local/receipts, Bearer).
// Itemizes a paid stay: `subtotal` (nights × nightly), `serviceFee` (10%),
// `methodFee` (card +5% / bank −5%), `promoDiscount` (when a code applied),
// and `total` (the grand total charged). All amounts are EGP.
export interface Receipt {
  booking_id: string
  reservation_code: string | null
  title: string
  check_in: string
  check_out: string
  nights: number
  subtotal: number
  serviceFee: number
  method: string
  methodFee: number
  promoCode: string | null
  promoDiscount: number
  total: number
  paidAt: string | null
  currency: string
}

// Fetch the signed-in guest's paid receipts. Bearer = the guest. Returns [] on
// any non-2xx / parse error so the receipts surface degrades gracefully.
export async function getReceipts(
  token: string,
  signal?: AbortSignal
): Promise<Receipt[]> {
  try {
    const res = await fetch(`${API_URL}/api/local/receipts`, {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
      signal,
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as Receipt[]) : []
  } catch {
    return []
  }
}

// ---- Money: multi-currency display ------------------------------------------

// The supported display currencies. EGP is the base (everything the backend
// returns is EGP); the rest are conversion targets for display only — bookings
// are always charged in EGP.
export type CurrencyCode = 'EGP' | 'USD' | 'EUR' | 'GBP' | 'SAR' | 'AED'

// The currency rate table (GET /api/local/currencies). `base` is 'EGP'; `rates`
// maps each currency to its multiplier against 1 EGP (EGP:1). To convert an EGP
// amount to a target: amount * rates[target].
export interface CurrencyRates {
  base: string
  rates: Record<string, number>
}

// Static fallback rates so currency formatting still works (in EGP, and
// approximately for others) if the backend fetch fails. Mirrors the documented
// GET /api/local/currencies contract.
export const FALLBACK_RATES: CurrencyRates = {
  base: 'EGP',
  rates: { EGP: 1, USD: 0.0203, EUR: 0.0188, GBP: 0.016, SAR: 0.0762, AED: 0.0746 },
}

// Fetch the currency rate table (no auth). Returns the documented fallback on
// any non-2xx / parse error so display conversion never breaks.
export async function getCurrencies(
  signal?: AbortSignal
): Promise<CurrencyRates> {
  try {
    const res = await fetch(`${API_URL}/api/local/currencies`, { signal })
    if (!res.ok) return FALLBACK_RATES
    const data = await res.json()
    if (!data || typeof data !== 'object' || !data.rates) return FALLBACK_RATES
    return {
      base: String(data.base ?? 'EGP'),
      rates: { ...FALLBACK_RATES.rates, ...(data.rates as Record<string, number>) },
    }
  } catch {
    return FALLBACK_RATES
  }
}

// The shape persisted in localStorage 'qk_user' after login/signup.
export interface StoredUser {
  id?: string
  email?: string | null
  full_name?: string | null
  name?: string | null
  role?: string | null
}

// Read + parse the signed-in user from localStorage. Safe on the server (SSR)
// and against malformed JSON — returns null in either case.
export function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('qk_user')
    return raw ? (JSON.parse(raw) as StoredUser) : null
  } catch {
    return null
  }
}

// The bearer token persisted after login/signup. null on the server / when absent.
export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem('qk_token')
  } catch {
    return null
  }
}
