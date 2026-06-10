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
}
