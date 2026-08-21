// Data shapes the UI renders.
//
// These used to be imported from `@/lib/local/db` and `@/lib/local/staff`, back when
// this app queried Postgres itself. It no longer does — quickin-backend owns the data
// (see lib/backend.ts) — but the components still need the shapes, so they live here.
//
// A copy, deliberately: TypeScript types are erased at build, so importing them across
// repos would drag a runtime dependency in for nothing. The cost is that a backend
// response shape can change without this file noticing, which is what the fetch call
// sites' explicit generics are for.
//
// PriceSource / DayStatus still come from date-pricing-core, and StaffModule from the
// staff module catalog: those are pure, dependency-free modules kept byte-identical
// with the backend by its parity guards, so importing them is not a database
// dependency and does not need copying.

import type { PriceSource, DayStatus } from './local/date-pricing-core'
import { STAFF_MODULES } from './local/staff-modules'

export interface Listing {
  id: string
  title: string
  description: string | null
  location: string | null
  country: string | null
  /** Guest projection: commission-inclusive. Host projection: the host's raw
   *  price. See LISTING_COLS vs LISTING_COLS_HOST. */
  price_per_night: number
  weekend_price: number | null
  weekend_days: number[] | null
  /** The commission rate these prices were projected with (0.1 = 10%). */
  commission_rate?: number
  /** Host projection only — what a guest is quoted for the same nights. */
  guest_price_per_night?: number
  guest_weekend_price?: number | null
  currency: string
  bedrooms: number | null
  beds: number | null
  bathrooms: number | null
  max_guests: number | null
  property_type: string | null
  /** Curated browse area (one of REGION_VALUES), or null when the host hasn't picked one. */
  region: string | null
  /** The catalog resort this listing belongs to, or null when the host typed
   *  their own (see `resort`). Region is derived from it. */
  resort_id?: string | null
  /** Display name: the catalog resort's name, or the host's free text.
   *  Free text still shows to guests as typed while it awaits moderation. */
  resort?: string | null
  /** Amenity names, canonical English (see lib/listing-options.ts). Never null. */
  amenities: string[]
  is_guest_favorite: boolean
  listing_code: string | null
  lat: number | null
  lng: number | null
  listing_images: ListingImage[]
  approval_status?: string | null
  /** The operator's reason for rejecting this listing, or null when they gave
   *  none (the note is optional). HOST PROJECTION ONLY — it is staff-authored
   *  text about the host, so it must never reach a guest read. Cleared when the
   *  listing goes back into the queue, so it always describes the CURRENT
   *  'rejected' state rather than a decision the host has already answered. */
  review_note?: string | null
  created_at?: string | null
  host_id?: string | null
  host_name?: string | null
  host_avatar?: string | null
  host_type?: string | null
  host_company?: string | null
  /** True when the host's ID has been verified by staff — drives the green pill on
   *  listing cards and the listing page. Comes from users.verification_status. */
  host_verified?: boolean
  image_url?: string | null
}

export interface ListingImage {
  url: string
  order: number
}

export interface ListingCalendar {
  listing_id: string
  currency: string
  commission_rate: number
  /** listings.price_per_night, in the same raw/guest terms as `days[].price`. */
  base_price: number
  start: string
  /** Inclusive — the last day in `days`, not a half-open bound. */
  end: string
  days: CalendarDay[]
}

/** One day on a listing's calendar. */
export interface CalendarDay {
  date: string
  /** Nightly rate for the night starting on `date`. RAW for the host,
   *  commission-inclusive for a public reader — same rule as LISTING_COLS. */
  price: number
  /** What a guest pays for this night. Host reads only; publicly it would just
   *  repeat `price`. */
  guest_price?: number
  /** Which rung of the ladder produced `price`. 'custom' = pinned by the host. */
  source: PriceSource
  /** Whether the host may still edit this day. */
  status: DayStatus
  /** The host's note on the block covering this day, when there is one. */
  note?: string | null
}

export type StaffModule = (typeof STAFF_MODULES)[number]['key']
export type StaffRole = 'super_admin' | 'moderator'

/** Where a host stands in the application flow. Mirrors the backend's host_status. */
export type HostStatus = 'none' | 'pending' | 'approved' | 'rejected'

export interface Booking {
  id: string
  listing_id: string
  check_in: string
  check_out: string
  guests: number
  total_price: number
  status: string
  payment_status: 'paid' | 'unpaid'
  /** Raw rollup from the shared bookings.payment_status column: 'paid' | 'unpaid' |
   *  'submitted' | 'rejected' | 'disputed' | 'pending' | 'failed' | 'refunded' | 'voided'.
   *  Written by the backend Paymob webhook AND the Instapay manual-payment flow. */
  payment_state?: string
  /** 'instapay' once a transfer screenshot is submitted (else null / legacy value). */
  payment_method?: string | null
  /** Latest payment_proofs row status: submitted | approved | rejected | disputed (null = no proof). */
  payment_proof_status?: string | null
  /** Reason the host/admin gave when rejecting the latest transfer screenshot. */
  payment_reject_reason?: string | null
  paid_at: string | null
  created_at: string
  title: string
  location: string | null
  currency: string
  image: string | null
  /** Issued once, at the confirmation transition. NULL while pending — and a
   *  booking without a code has no QR, no wallet pass and no /stay link. */
  reservation_code: string | null
  host_notes: string | null
}

export interface HostApplication {
  id: string
  user_id: string
  full_name: string | null
  national_id: string | null
  phone: string | null
  address: string | null
  company: string | null
  notes: string | null
  status: 'pending' | 'approved' | 'rejected'
  submitted_at: string
  reviewed_at: string | null
  review_note: string | null
  email?: string
  host_type?: string | null
  /** The ID submission filed with this application (null for applications made
   *  before identity documents were folded in). Lets the reviewer open the
   *  document before approving, since approving now verifies the identity too. */
  verification_id?: string | null
  /** national_id | passport | residence_permit — what the applicant says it is. */
  doc_type?: string | null
  /** Status of that submission: pending | verified | rejected. */
  verification_status?: string | null
}

export interface PublicUser {
  id: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
}

export interface HostProfile {
  profile: PublicUser & { bio: string | null; verification_status: string }
  listings: HostListingCard[]
  reviews: HostReviewCard[]
  avgRating: number | null
  totalReviews: number
}

export interface HostListingCard {
  id: string
  title: string
  location: string | null
  price_per_night: number
  currency: string
  image_url: string | null
  rating: number | null          // average of this listing's review ratings
  rating_count: number
}

export interface HostReviewCard {
  id: string
  rating: number
  comment: string | null
  created_at: string
  listing_title: string | null
  reviewer_name: string | null
  reviewer_avatar: string | null
}

/** GET /api/local/verification — the ID document on file and where it stands. */
export interface Verification {
  status: string
  id_number: string | null
  verified_at: string | null
  doc_type?: string | null
  notes?: string | null
}

export interface Review {
  rating: number
  comment: string | null
  reviewer_name: string | null
  created_at: string
  photos: string[]
}

/** The signed-in user's own editable profile fields, as `/account` shows them.
 *  `phone` is in here because this is only ever read for the user themselves —
 *  the public projection (`getUserById`) does not carry it. */
export interface OwnProfileFields {
  age: number | null
  phone: string | null
  bio: string | null
}

/** Aliases matching how the pages name these payloads. */
export type ProfileFields = OwnProfileFields

export interface Dispute {
  id: string
  booking_id: string
  guest_id: string
  category: string
  description: string
  photos: string[]
  status: string
  resolution: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  /** Joined for display — a guest looking at a list needs to know which stay. */
  listing_title?: string | null
  reservation_code?: string | null
  check_in?: string | null
  check_out?: string | null
}

export interface ResortOption {
  id: string
  name: string
  region: string
}

export interface StayGuideItem {
  id: string
  kind: StayGuideKind
  title: string | null
  body: string | null
  url: string | null
  order: number
}

/** What the PUBLIC /stay/<code> page may show. Deliberately narrow: no booking
 *  id, no guest email/phone, no prices — anyone holding the code sees this. */
export interface StayPass {
  reservation_code: string
  title: string
  location: string | null
  country: string | null
  check_in: string
  check_out: string
  guests: number
  status: string
  payment_status: 'paid' | 'unpaid'
  host_notes: string | null
  guest_name: string | null   // first name only
  host_name: string | null
  image: string | null
  guide: StayGuideItem[]
}

export type StayGuideKind = 'info' | 'photo' | 'place_qr' | 'attachment'
