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
  /** Seasonal per-month nightly rates, month "1".."12" → price. The rung of the
   *  ladder under the weekend rate; a month with no entry uses price_per_night.
   *  Same projection as the prices above (guest = commission-inclusive). The
   *  backend COALESCEs a missing column to `{}`, so this is never null. */
  monthly_prices?: Record<string, number>
  /** Host projection only — the guest-facing twin of `monthly_prices`. */
  guest_monthly_prices?: Record<string, number>
  /** Whole percent off a stay of WEEKLY_DISCOUNT_MIN_NIGHTS or more. The
   *  backend COALESCEs a missing value to 0, so these are never null. */
  weekly_discount?: number
  /** Whole percent off a stay of MONTHLY_DISCOUNT_MIN_NIGHTS or more. Replaces
   *  the weekly discount rather than compounding with it. */
  monthly_discount?: number
  /** 'flexible' | 'moderate' | 'strict'. The backend always sends one — it
   *  COALESCEs a missing value to 'moderate', the database default. */
  cancellation_policy?: string
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
  /** Average of this listing's review ratings, 0 when it has none. COALESCEd in
   *  LISTING_COLS, so every listing projection carries it. */
  rating: number
  /** How many reviews that average is over. Also never null. */
  review_count: number
  approval_status?: string | null
  /** The operator's reason for rejecting this listing, or null when they gave
   *  none (the note is optional). HOST PROJECTION ONLY — it is staff-authored
   *  text about the host, so it must never reach a guest read. Cleared when the
   *  listing goes back into the queue, so it always describes the CURRENT
   *  'rejected' state rather than a decision the host has already answered. */
  review_note?: string | null
  /** Whether guests can see the listing at all. False covers all four takedown
   *  reasons — the flags below say which. QuickIn has no host-facing DELETE:
   *  "remove my listing" is this flag going false, with every booking, review and
   *  payment record left intact. See the backend README, *A host removes a
   *  listing by hiding it*. */
  is_published?: boolean
  /** HOST PROJECTION ONLY. The host took this listing down themselves — the only
   *  one of the four flags they can clear, and the one the dashboard's
   *  Deactivate / Reactivate button acts on. */
  unpublished_by_host?: boolean
  /** HOST PROJECTION ONLY. An account block hid it; only a restore brings it back. */
  unpublished_by_admin?: boolean
  /** HOST PROJECTION ONLY. The identity gate hid it; only re-verifying brings it back. */
  unpublished_by_verification?: boolean
  /** HOST PROJECTION ONLY. Booking requests still waiting on this host — the
   *  number a deactivate would decline, named in the confirmation dialog before
   *  the host commits. */
  pending_request_count?: number
  /** HOST PROJECTION ONLY. True when a proof-of-ownership document is stored for
   *  this listing — never the document itself, which is admin-only and served
   *  one at a time from the audited /api/local/admin/documents/ownership/:id.
   *  The document is optional at create time, so this is the flag that decides
   *  whether the card offers "Upload ownership document" or "Re-upload ownership
   *  document" (see ownershipDocAction in lib/local/ownership-doc-core.ts). */
  has_ownership_doc?: boolean
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
  /** The raw `bookings.payment_status` rollup as quickin-backend's BOOKING_COLS
   *  sends it: 'unpaid' | 'submitted' | 'paid' | 'rejected' | 'disputed', plus the
   *  legacy Paymob values. NOT a derived paid/unpaid flag — the old web API's
   *  narrower projection is what the `'paid' | 'unpaid'` here used to describe. */
  payment_status: string
  /** The old web API's name for the same column. **Absent from today's payload** —
   *  keep reading it as `payment_state ?? payment_status` so either shape works. */
  payment_state?: string
  /** 'instapay' once a transfer screenshot is submitted (else null / legacy value). */
  payment_method?: string | null
  /** Latest payment_proofs row status: submitted | approved | rejected | disputed (null = no proof). */
  payment_proof_status?: string | null
  /** Reason the host/admin gave when rejecting the latest transfer screenshot. */
  payment_reject_reason?: string | null
  /** ⚠️ CLEARED by a refund — see the paid_at trap in analytics-core.ts. Read it as
   *  "is this paid right now", never as "was this ever paid". */
  paid_at: string | null
  /** ISO-8601 timestamp the booking was cancelled, from `cancelled_at`. */
  cancelled_at?: string | null
  /** Percent of the total refunded on cancel (0–100), null until cancelled. What
   *  separates the "Refunded" and "Partially refunded" chips — see
   *  reservation-filter-core.ts. */
  refund_percent?: number | null
  created_at: string
  title: string
  location: string | null
  currency: string
  image: string | null
  /** Issued once, at the confirmation transition. NULL while pending — and a
   *  booking without a code has no QR, no wallet pass and no /stay link. Note a
   *  code is only HALF the gate: it is minted when the host approves, while the
   *  pass itself waits for payment (`isLiveStayPass`). */
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

/**
 * GET /api/local/users/:id — the flat public profile the backend actually returns.
 *
 * Note there is no `created_at` here: the join date lives in `badges.memberSince`,
 * because the badge block is what the backend computes trust from.
 */
export interface PublicProfile {
  id: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  verification_status: string
  guest_rating: number
  guest_review_count: number
  badges: {
    verified: boolean
    superhost: boolean
    newHost: boolean
    isHost: boolean
    completedStays: number
    reviewCount: number
    hostRating: number
    memberSince: string | null
  }
}

/**
 * The host page's view model. No single endpoint returns this — it is assembled in
 * the page from the profile, the host's listings and the host's reviews, which is
 * why it is a local shape rather than a response type.
 */
export interface HostProfile {
  profile: PublicProfile
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
  /** Raw bookings.payment_status: unpaid | submitted | paid | rejected | disputed. */
  payment_status: string
  /** Stamped when the payment was APPROVED; null while unpaid/submitted/disputed. */
  paid_at: string | null
  /** Latest payment_proofs.status, null when the guest hasn't uploaded one. */
  payment_proof_status: string | null
  /** The server's verdict from `isLiveStayPass`: confirmed AND paid, or completed.
   *  Render the pass on THIS, not on `status` — a host-approved booking is still
   *  unpaid, and the guide below is empty whenever this is false. */
  is_live: boolean
  host_notes: string | null
  guest_name: string | null   // first name only
  host_name: string | null
  image: string | null
  guide: StayGuideItem[]
}

export type StayGuideKind = 'info' | 'photo' | 'place_qr' | 'attachment'

// ---- Host money & performance ----------------------------------------------
// Mirrors quickin-backend's `lib/local/money.ts`. Both surfaces read the same
// two endpoints the mobile apps do, so a field added there only has to be
// copied here to reach the web.

/** `GET /api/local/host/earnings` — the signed-in host's payout summary. */
export interface HostEarnings {
  currency: string
  /** The host's own take across every counted booking, net of refunds. */
  totalEarned: number
  paidOut: number
  pending: number
  bookingsCount: number
  /** The live platform rate. Shown as "guests pay N% above your price", NOT as
   *  a deduction — nothing in this object is reduced by it. */
  commissionRate: number
  /** What guests were charged across the same bookings. The gap from
   *  `totalEarned` is the platform's commission. */
  guestPaid: number
  recent: HostEarningsRow[]
}

export interface HostEarningsRow {
  booking_id: string
  title: string
  check_in: string
  check_out: string
  /** What the guest paid and did not get back (commission-inclusive). */
  gross: number
  /** What this host earns — their raw price, less any refunded share. */
  net: number
  /** Only ever these two: a cancellation the host kept money on reads
   *  'paid_out' (no stay is coming, so nothing is pending) and is told apart
   *  by `cancelled` rather than by a third status string. */
  status: 'paid_out' | 'upcoming'
  paid_at: string | null
  cancelled: boolean
  /** How much of the guest's money went back, 0–100. Non-zero only on a refund. */
  refund_percent?: number | null
}

/** `GET /api/local/host/analytics` — the host's performance dashboard. */
export interface HostAnalytics {
  currency: string
  listings: number
  totalBookings: number
  paidBookings: number
  cancelledBookings: number
  revenue: number
  avgRating: number
  reviewCount: number
  /** paid / total bookings, already a 0–1 fraction. */
  conversionRate: number
  byMonth: { month: string; bookings: number; revenue: number }[]
  topListings: { title: string; bookings: number; revenue: number }[]
}

// ---- Services ---------------------------------------------------------------
// Mirrors quickin-backend's `lib/local/services.ts`. Services carry the platform
// commission exactly like listings: `price` is whichever side the projection is
// for — commission-inclusive on the guest routes, the host's raw price on
// `/api/local/host/services`, where `guest_price` carries the quoted figure.

export interface Service {
  id: string
  host_id: string
  host_name: string | null
  title: string
  description: string | null
  category: string | null
  location: string | null
  price: number
  /** Host projection only — what a guest is quoted for this service. */
  guest_price?: number
  commission_rate?: number
  currency: string
  image_url: string | null
  lat: number | null
  lng: number | null
  is_published: boolean
  /** Host projection only. The host took this down themselves — the services
   *  twin of `listings.unpublished_by_host`. */
  unpublished_by_host?: boolean
  /** Host projection only. Requests still waiting on this host — the number a
   *  deactivate would decline. */
  pending_request_count?: number
  created_at: string
}

/** A guest's subscription to a service. The same row serves the guest's list
 *  and the host's inbox, which is why it carries both sides' names. */
export interface ServiceRequest {
  id: string
  service_id: string
  user_id: string
  status: string
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

// ---- Host → guest reviews ----------------------------------------------------

/** One past stay the host may still review the guest for.
 *  `GET /api/local/guest-reviews` (no query string, host session). */
export interface ReviewableGuest {
  booking_id: string
  listing_id: string
  title: string
  guest_name: string | null
  check_out: string
}
