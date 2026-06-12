// Base URL of the QuickIn backend API.
// Set NEXT_PUBLIC_API_URL in the environment (.env.local for dev, Vercel env for
// production). Falls back to the local backend default during development.
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000'

// ---- Shared data shapes (mirror the backend JSON responses) -----------------

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
  is_guest_favorite: boolean
  listing_code: string | null
  lat: number | null
  lng: number | null
  listing_images: ListingImage[]
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
  status: 'pending' | 'confirmed' | 'rejected' | string
  title: string
  location: string | null
  check_in: string
  check_out: string
  guests: number
  total_price: number
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
