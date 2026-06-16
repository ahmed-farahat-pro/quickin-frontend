// Base URL of the QuickIn backend API.
// Set NEXT_PUBLIC_API_URL in the environment (.env.local for dev, Vercel env for
// production). Falls back to the local backend default during development.
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000'

// ---- Shared data shapes (mirror the backend JSON responses) -----------------

// A listing's cancellation policy. Drives the refund a guest gets when they
// cancel (see getCancellationQuote). Mirrors the backend enum.
export type CancellationPolicy = 'flexible' | 'moderate' | 'strict'

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
