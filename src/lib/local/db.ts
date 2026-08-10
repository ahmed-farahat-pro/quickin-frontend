import { randomInt } from 'node:crypto'
import { pool } from './pool'
import { resolveResortSelection } from './resorts'
import { isContactBlockedError } from './contentguard'
import { guardContent, guardSplitContent, countFlaggedUsers, oldestFlaggedAt } from './moderation'
import { countOpenDisputes, oldestOpenDisputeAt } from './disputes'
import { INSTAPAY_KEYS, rowsToPaymentConfig } from './payment-config-core'
import type { PaymentConfig } from './payment-config-core'
import {
  COMMISSION_RATE_KEY,
  COMMISSION_RATE_SQL,
  bookingCommissionSql,
  bookingRateSql,
  parseRate,
  rateToStored,
  roundUpToStep,
  sqlWithCommission,
} from './commission-core'
import { buildUserListWhere, hidesListings, normalizeStatus, orderBySql } from './user-admin-core'
import type { AccountStatus, UserListFilter } from './user-admin-core'
import { idColumnFor, statusForAction } from './document-core'
import { normalizeDocType, normalizeVerificationStatus, revokesListingPrivileges } from './host-verification-core'
import { assertProofImage, canPay, outcomeFor, PaymentProofError } from './payment-flow-core'
import type { PaymentReviewAction } from './payment-flow-core'
import { branchLimit, wantsKind } from './activity-core'
import type { ActivityFilter, AuditFilter } from './activity-core'
import { PAID_SQL } from './analytics-core'
import { buildSeries, bucketsFor, METRICS, publicMetrics, RANGES, windowFor } from './overview-trends-core'
import type { MetricId, MetricSpec, RangeId, SeriesPoint, TrendPayload } from './overview-trends-core'
import type { DocumentKind, VerificationAction, VerificationFilter } from './document-core'
import { isLiveStayStatus, normalizeReservationCode } from '@/lib/stay-code'
// The catalogs the host forms offer — one source of truth for what the API
// accepts and what the create/edit forms render (see lib/listing-options.ts).
import {
  REGION_VALUES,
  PROPERTY_TYPE_VALUES,
  MAX_AMENITY_CHARS,
  MAX_AMENITIES,
  canonicalAmenity,
} from '@/lib/listing-options'

// Data access via node-postgres (parameterized queries). Works locally and on
// Vercel/Neon. No Supabase, no psql CLI.

// Re-exported so server callers keep one import for stay-pass work; the
// implementation lives in lib/stay-code.ts because the browser needs it too.
export { isLiveStayStatus, normalizeReservationCode }

const isUuid = (s: string) => /^[0-9a-fA-F-]{36}$/.test(s)
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

/** Accept http(s) image URLs or inline base64 image data URLs (device uploads). */
const isImageSrc = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(v)) return true
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Cap on an inline proof-of-ownership document (~3.5M chars of base64). */
const OWNERSHIP_DOC_MAX_CHARS = 3_500_000

/**
 * Validate the proof-of-ownership document a host attaches to a listing: an
 * inline image data URL (how the web/mobile uploaders encode a photo) or an
 * http(s) link, capped at OWNERSHIP_DOC_MAX_CHARS. Rules and messages are
 * mirrored verbatim from quickin-backend's setListingOwnershipDoc so a document
 * accepted by the mobile apps is accepted here too. Throws on bad input.
 */
function normalizeOwnershipDoc(value: unknown): string {
  const doc = String(value ?? '').trim()
  if (!/^(data:image\/|https?:\/\/)/i.test(doc)) throw new Error('Please attach a photo of the document')
  if (doc.length > OWNERSHIP_DOC_MAX_CHARS) throw new Error('That image is too large')
  return doc
}

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

export interface SearchFilters {
  location?: string
  guests?: number
  checkIn?: string
  checkOut?: string
  type?: string
  sortBy?: string
}

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

// ---- Price projection (platform commission) ---------------------------------
// A listing carries ONE price in the database: the raw amount its host set and
// is paid. What a guest is quoted is that raw price marked up by the platform
// commission (see commission-core.ts, byte-identical in the backend repo).
// Which of the two lands in `price_per_night` is decided HERE, by whether the
// caller asked for the guest projection or the host one — so no read path can
// forget to apply the markup, and no guest response can leak the raw price.
//
// Guest reads  → price_per_night = marked up. No raw fields at all.
// Host reads   → price_per_night = raw (the number the host edits and saves back,
//                so a load→save round trip must not inflate it), plus read-only
//                guest_* companions for "guests pay X".

const GUEST_PRICE_COLS = `
  ${sqlWithCommission('l.price_per_night')}::float8 AS price_per_night,
  ${sqlWithCommission('l.weekend_price')}::float8 AS weekend_price, l.weekend_days,
  ${COMMISSION_RATE_SQL}::float8 AS commission_rate,`

const HOST_PRICE_COLS = `
  l.price_per_night::float8 AS price_per_night,
  l.weekend_price::float8 AS weekend_price, l.weekend_days,
  ${sqlWithCommission('l.price_per_night')}::float8 AS guest_price_per_night,
  ${sqlWithCommission('l.weekend_price')}::float8 AS guest_weekend_price,
  ${COMMISSION_RATE_SQL}::float8 AS commission_rate,`

/** Everything that isn't a price — identical in both projections. */
const LISTING_COMMON_COLS = `
  l.currency,
  l.bedrooms, l.beds, l.bathrooms, l.max_guests, l.property_type,
  l.region, COALESCE(l.amenities, '{}') AS amenities,
  l.resort_id, COALESCE((SELECT name FROM resorts WHERE id = l.resort_id), l.resort_name) AS resort,
  l.is_guest_favorite, l.listing_code, l.lat::float8 AS lat, l.lng::float8 AS lng,
  COALESCE(l.approval_status, 'approved') AS approval_status,
  -- E3: the host's verified badge, character-for-character the same expression the
  -- backend uses in its own LISTING_COLS — so the web and the mobile apps can never
  -- disagree about whether a host is verified. A correlated subquery rather than a
  -- join because LISTING_COLS is spliced into four different FROM clauses, one of
  -- which already joins users u (a second alias would collide).
  COALESCE((SELECT u.verification_status = 'verified' FROM users u WHERE u.id = l.host_id), false) AS host_verified,
  to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
  COALESCE(
    (SELECT json_agg(json_build_object('url', li.url, 'order', li."order") ORDER BY li."order")
     FROM listing_images li WHERE li.listing_id = l.id), '[]'
  ) AS listing_images
`

/** Guest projection — prices include the platform commission. */
const LISTING_COLS = `
  l.id, l.title, l.description, l.location, l.country,
  ${GUEST_PRICE_COLS}
  ${LISTING_COMMON_COLS}
`

/** Host/staff projection — the host's raw prices, with guest_* companions.
 *  Never serve this to a guest. */
const LISTING_COLS_HOST = `
  l.id, l.title, l.description, l.location, l.country,
  ${HOST_PRICE_COLS}
  ${LISTING_COMMON_COLS}
`

export async function getListings(filters: SearchFilters = {}): Promise<Listing[]> {
  // Only publicly-visible, admin-approved listings appear in search. New listings
  // are created pending (approval_status='pending', is_published=false) and stay
  // hidden until an admin approves them. Existing rows have NULL approval_status,
  // which COALESCEs to 'approved' so they remain visible (grandfathered).
  const where: string[] = ["l.is_published = true", "COALESCE(l.approval_status, 'approved') = 'approved'"]
  const params: unknown[] = []

  if (filters.location && filters.location.trim()) {
    params.push('%' + filters.location.trim() + '%')
    where.push(`l.location ILIKE $${params.length}`)
  }
  if (filters.type && filters.type.trim()) {
    params.push(filters.type.trim())
    where.push(`lower(l.property_type) = lower($${params.length})`)
  }
  // Clamp guests to a sane range so a non-finite / absurd value (e.g. an
  // integer-overflow string) can't reach Postgres and blow up the int comparison.
  if (filters.guests != null && Number.isFinite(filters.guests) && filters.guests > 0) {
    const guests = Math.min(100, Math.max(1, Math.floor(filters.guests)))
    params.push(guests)
    where.push(`COALESCE(l.max_guests, 0) >= $${params.length}`)
  }
  if (filters.checkIn && filters.checkOut && isDate(filters.checkIn) && isDate(filters.checkOut)) {
    params.push(filters.checkOut)
    const a = params.length
    params.push(filters.checkIn)
    const b = params.length
    where.push(`NOT EXISTS (
      SELECT 1 FROM bookings bk
      WHERE bk.listing_id = l.id AND bk.status <> 'cancelled'
        AND bk.check_in < $${a} AND bk.check_out > $${b}
    )`)
  }

  // Whitelisted sort orders → safe to interpolate (never accept raw sort text).
  const ORDER_BY: Record<string, string> = {
    recommended: 'l.is_guest_favorite DESC, l.created_at DESC',
    price_asc: 'l.price_per_night ASC, l.created_at DESC',
    price_desc: 'l.price_per_night DESC, l.created_at DESC',
    newest: 'l.created_at DESC',
  }
  const orderBy = ORDER_BY[filters.sortBy ?? 'recommended'] ?? ORDER_BY.recommended

  const { rows } = await pool.query(
    `SELECT ${LISTING_COLS} FROM listings l
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy}`,
    params
  )
  return rows as Listing[]
}

/**
 * One listing. Defaults to the GUEST projection (commission-inclusive prices,
 * no raw host figures). Pass `{ asHost: true }` only when the response goes to
 * the listing's own host — the edit form loads these values and saves them
 * straight back, so it must see the raw price it typed.
 */
export async function getListingById(id: string, opts: { asHost?: boolean } = {}): Promise<Listing | null> {
  if (!isUuid(id)) return null
  const cols = opts.asHost ? LISTING_COLS_HOST : LISTING_COLS
  const { rows } = await pool.query(
    `SELECT ${cols}, l.host_id, u.full_name AS host_name, u.avatar_url AS host_avatar,
            u.host_type AS host_type, u.company AS host_company
       FROM listings l LEFT JOIN users u ON u.id = l.host_id WHERE l.id = $1`,
    [id]
  )
  return (rows[0] as Listing) ?? null
}

// ---- Bookings ---------------------------------------------------------------

/** The rate to price a booking by — its own snapshot, not the live rate. Defined
 *  in commission-core so every reader of a booking's money agrees; see there. */
const BOOKING_RATE_SQL = bookingRateSql()

/** Guest price − host's raw price, for one booking. See bookingCommissionSql(). */
const COMMISSION_AMOUNT_SQL = bookingCommissionSql()

// bookings.total_price stores the host's RAW stay total. This projection exposes
// only the COMMISSION-INCLUSIVE figure, because a booking response is read by the
// guest and the raw price would hand them the platform's margin. A host's payout
// is added explicitly by the host-only readers (see getHostBookings).
const BOOKING_COLS = `
  b.id, b.listing_id,
  to_char(b.check_in, 'YYYY-MM-DD') AS check_in,
  to_char(b.check_out, 'YYYY-MM-DD') AS check_out,
  b.guests, b.adults, b.children, b.infants, b.pets,
  ${sqlWithCommission('b.total_price', BOOKING_RATE_SQL)}::float8 AS total_price,
  b.status,
  CASE WHEN b.paid_at IS NULL THEN 'unpaid' ELSE 'paid' END AS payment_status,
  COALESCE(b.payment_status, 'unpaid') AS payment_state,
  b.payment_method,
  -- Latest transfer-screenshot submission for this booking (metadata only — the base64
  -- image itself is fetched on demand via getBookingProof to keep list payloads light).
  (SELECT pp.status FROM payment_proofs pp WHERE pp.booking_id = b.id ORDER BY pp.submitted_at DESC LIMIT 1) AS payment_proof_status,
  (SELECT pp.reject_reason FROM payment_proofs pp WHERE pp.booking_id = b.id ORDER BY pp.submitted_at DESC LIMIT 1) AS payment_reject_reason,
  to_char(b.paid_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS paid_at,
  to_char(b.cancelled_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cancelled_at,
  b.cancelled_by, b.cancelled_by_role, b.cancellation_policy AS booked_cancellation_policy,
  b.commission_rate,
  b.refund_percent, b.host_notes,
  -- The REAL column, never a synthesized stand-in: quickin-backend stores the
  -- code here and getStayByCode()/the QR resolve against it. A derived value
  -- would look like a code and never resolve. NULL until the host confirms.
  NULLIF(b.reservation_code, '') AS reservation_code,
  to_char(b.created_at, 'YYYY-MM-DD') AS created_at,
  l.title, l.location, COALESCE(l.currency, 'USD') AS currency,
  (SELECT url FROM listing_images li WHERE li.listing_id = l.id ORDER BY li."order" LIMIT 1) AS image
`

export interface CreateBookingInput {
  listingId: string
  userId: string
  checkIn: string
  checkOut: string
  guests: number
  adults?: number
  children?: number
  infants?: number
  pets?: number
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const { listingId, userId, checkIn, checkOut, guests } = input
  if (!isUuid(listingId) || !isUuid(userId)) throw new Error('Invalid id')
  if (!isDate(checkIn) || !isDate(checkOut)) throw new Error('Invalid dates (use YYYY-MM-DD)')
  // No bookings that start in the past. ISO dates compare correctly as strings.
  const today = new Date().toISOString().slice(0, 10)
  if (checkIn < today) throw new Error('Check-in cannot be in the past')
  if (checkOut <= checkIn) throw new Error('Check-out must be after check-in')
  const nn = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0))
  // Adults + children = the headcount. Infants and pets don't count toward it.
  const adults = Math.max(1, nn(input.adults ?? guests))
  const children = nn(input.children)
  const infants = nn(input.infants)
  const pets = nn(input.pets)
  const g = Math.max(1, adults + children)

  // Load the listing (for max_guests / title / host_id) and enforce capacity.
  // Search already hides unpublished listings, but a booking can arrive with a
  // listing id straight from a deep link or a stale client, so the same rules are
  // enforced here: an unpublished listing and a blocked/removed host are both
  // unbookable. Without this, "hide their listings" would only hide them.
  const { rows: lrows } = await pool.query(
    `SELECT l.title, l.max_guests, l.host_id, COALESCE(l.is_published, false) AS is_published,
            COALESCE(hu.account_status, 'active') AS host_status
       FROM listings l LEFT JOIN users hu ON hu.id = l.host_id
      WHERE l.id = $1`,
    [listingId]
  )
  const listing = lrows[0] as
    | { title: string; max_guests: number | null; host_id: string | null; is_published: boolean; host_status: string }
    | undefined
  if (!listing) throw new Error('Could not create booking (listing not found)')
  if (!listing.is_published || listing.host_status !== 'active') {
    throw new Error('This listing is not available for booking')
  }
  if (listing.max_guests != null && g > listing.max_guests) {
    throw new Error('Exceeds the maximum guests for this listing')
  }

  const clash = await pool.query(
    `SELECT 1 FROM bookings
     WHERE listing_id = $1 AND status NOT IN ('cancelled', 'rejected')
       AND check_in < $2 AND check_out > $3 LIMIT 1`,
    [listingId, checkOut, checkIn]
  )
  if (clash.rowCount && clash.rowCount > 0) throw new Error('Those dates are not available')

  // Total = sum over each night in [check_in, check_out). A night whose weekday
  // (Postgres DOW: 0=Sun … 6=Sat) is in the listing's weekend_days is charged
  // weekend_price; otherwise price_per_night. Falls back to nights × nightly
  // when no weekend price is configured.
  const { rows } = await pool.query(
    `WITH ins AS (
       -- cancellation_policy and commission_rate are SNAPSHOTTED here on purpose:
       -- both are editable after the fact (the listing's policy by its host, the
       -- rate by an admin), and a report must reflect what was in force when the
       -- booking was taken. Mirrors the backend createBooking.
       INSERT INTO bookings (listing_id, user_id, check_in, check_out, guests, adults, children, infants, pets, total_price, status,
                             cancellation_policy, commission_rate)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9,
              -- total_price is the host's RAW stay total — what the host is owed.
              -- The guest's figure is derived as total_price × (1 + commission_rate)
              -- using the rate snapshotted below, so an admin changing the rate can
              -- never restate a live reservation.
              (SELECT COALESCE(SUM(
                 CASE WHEN l.weekend_price IS NOT NULL AND l.weekend_days IS NOT NULL
                           AND EXTRACT(DOW FROM gs)::int = ANY(l.weekend_days)
                      THEN l.weekend_price ELSE l.price_per_night END
               ), 0)
               FROM generate_series($3::date, $4::date - interval '1 day', interval '1 day') AS gs),
              'pending',
              COALESCE(l.cancellation_policy, 'moderate'),
              ${COMMISSION_RATE_SQL}
       FROM listings l WHERE l.id = $1
       RETURNING *
     )
     SELECT ${BOOKING_COLS} FROM ins b JOIN listings l ON l.id = b.listing_id`,
    [listingId, userId, checkIn, checkOut, g, adults, children, infants, pets]
  )
  if (!rows[0]) throw new Error('Could not create booking (listing not found)')
  // Notify the listing host of a new reservation request (if the listing has an owner).
  if (listing.host_id && isUuid(listing.host_id)) {
    await createNotification(
      listing.host_id, 'booking', 'New reservation request',
      `New request for ${listing.title} (${checkIn} -> ${checkOut})`, '/host'
    )
  }
  return rows[0] as Booking
}

// ---- Cancellation (guest) — default "moderate" policy -----------------------

export interface CancellationQuote {
  policy: string
  daysUntilCheckIn: number
  refundPercent: number
  refundAmount: number
  total: number
  currency: string
}

/** Moderate policy: full refund ≥7 days out, half 1–6 days out, none within a day / past. */
function moderateRefundPercent(daysUntilCheckIn: number): number {
  if (daysUntilCheckIn >= 7) return 100
  if (daysUntilCheckIn >= 1) return 50
  return 0
}

async function loadCancelable(userId: string, bookingId: string) {
  const { rows } = await pool.query(
    // Commission-inclusive: a refund is a percentage of what the GUEST paid, not
    // of the host's raw price.
    `SELECT b.status, ${sqlWithCommission('b.total_price', BOOKING_RATE_SQL)}::float8 AS total,
            COALESCE(l.currency,'EGP') AS currency,
            (b.check_in - CURRENT_DATE)::int AS days_until
       FROM bookings b JOIN listings l ON l.id = b.listing_id
      WHERE b.id = $1 AND b.user_id = $2`,
    [bookingId, userId]
  )
  return rows[0] as { status: string; total: number; currency: string; days_until: number } | undefined
}

export async function getCancellationQuote(userId: string, bookingId: string): Promise<CancellationQuote> {
  if (!isUuid(bookingId)) throw new Error('Invalid booking')
  const b = await loadCancelable(userId, bookingId)
  if (!b) throw new Error('Booking not found')
  const percent = b.status === 'cancelled' ? 0 : moderateRefundPercent(b.days_until)
  return {
    policy: 'moderate',
    daysUntilCheckIn: b.days_until,
    refundPercent: percent,
    refundAmount: Math.round(b.total * percent) / 100,
    total: b.total,
    currency: b.currency,
  }
}

export async function cancelBooking(
  userId: string,
  bookingId: string
): Promise<{ booking: Booking; refund: { refundPercent: number; refundAmount: number; currency: string } }> {
  if (!isUuid(bookingId)) throw new Error('Invalid booking')
  const b = await loadCancelable(userId, bookingId)
  if (!b) throw new Error('Booking not found')
  if (b.status === 'cancelled') throw new Error('This booking is already cancelled')
  const percent = moderateRefundPercent(b.days_until)
  const { rows } = await pool.query(
    `WITH upd AS (
       UPDATE bookings SET status = 'cancelled', cancelled_at = now(), refund_percent = $3,
              -- B3: record the actor in the SAME statement as the status change, so
              -- it can never be skipped. $2 is the guest's own id (also the WHERE guard).
              cancelled_by = $2::text, cancelled_by_role = 'guest'
        WHERE id = $1 AND user_id = $2 RETURNING *
     )
     SELECT ${BOOKING_COLS} FROM upd b JOIN listings l ON l.id = b.listing_id`,
    [bookingId, userId, percent]
  )
  if (!rows[0]) throw new Error('Could not cancel booking')
  return {
    booking: rows[0] as Booking,
    refund: { refundPercent: percent, refundAmount: Math.round(b.total * percent) / 100, currency: b.currency },
  }
}

// ---- Mock payment (keeps the booking 'pending' awaiting host approval) ------

// PaymentReceipt was the return of the retired mock payBooking(). Instapay has no
// gateway receipt — the guest's screenshot IS the receipt (payment_proofs).

/** Records a mock payment. Only allowed once the host has APPROVED the request
 *  (status 'confirmed'); a pending reservation can't be paid yet. Payment doesn't
 *  change the status — it sets paid_at, so an approved booking becomes "confirmed & paid". */
export async function createNotification(
  userId: string, type: string, title: string, body?: string | null, link?: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1, $2, $3, $4, $5)`,
    [userId, type, title, body ?? null, link ?? null]
  )
}

export async function getNotifications(userId: string): Promise<{ notifications: unknown[]; unreadCount: number }> {
  if (!isUuid(userId)) return { notifications: [], unreadCount: 0 }
  const { rows } = await pool.query(
    `SELECT id, type, title, body, link, read,
            to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
       FROM notifications WHERE user_id = $1 ORDER BY notifications.created_at DESC LIMIT 50`,
    [userId]
  )
  return { notifications: rows, unreadCount: rows.filter((r) => !r.read).length }
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  if (!isUuid(userId)) return
  await pool.query(`UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`, [userId])
}

export async function markNotificationRead(userId: string, id: string): Promise<void> {
  if (!isUuid(userId) || !isUuid(id)) return
  await pool.query(`UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2`, [id, userId])
}

export async function registerPushToken(userId: string, fcmToken: string, platform: string): Promise<void> {
  if (!isUuid(userId) || !fcmToken) return
  await pool.query(`UPDATE users SET fcm_token = $2, push_platform = $3 WHERE id = $1`, [userId, fcmToken, platform || null])
}

// ---- Single booking + host notes / status patch -----------------------------

export async function getBookingById(userId: string, bookingId: string): Promise<Booking | null> {
  if (!isUuid(bookingId) || !isUuid(userId)) return null
  const { rows } = await pool.query(
    `SELECT ${BOOKING_COLS} FROM bookings b JOIN listings l ON l.id = b.listing_id
      WHERE b.id = $1 AND b.user_id = $2`,
    [bookingId, userId]
  )
  return (rows[0] as Booking) ?? null
}

/** Host actions on a single reservation: set host_notes and/or decide status.
 *  Authorization: this endpoint is HOST-ONLY — the caller must own the booking's
 *  listing (listings.host_id === callerId). Guests manage their own reservations
 *  via cancelBooking(), which scopes by user_id.
 *  Status is a strict allowlist: 'confirm'→'confirmed', 'reject'→'rejected', and
 *  only from a 'pending' reservation. Any other value is rejected (no raw writes).
 *  Returns the updated booking, or null if the booking does not exist. */
const BOOKING_STATUS_ACTIONS: Record<string, 'confirmed' | 'rejected'> = {
  confirm: 'confirmed',
  reject: 'rejected',
}

/** Short reservation code shown on the pass + encoded in the QR, e.g. "QK-7F3K9Q".
 *  Byte-for-byte the same format quickin-backend's genReservationCode() produces —
 *  both projects write this into the SAME shared column, so a code issued by
 *  either side resolves at /stay/<code> on the web and in both mobile apps. */
export function genReservationCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars
  let s = ''
  for (let i = 0; i < 6; i++) s += alphabet[randomInt(0, alphabet.length)]
  return `QK-${s}`
}

export async function patchBooking(
  callerId: string,
  bookingId: string,
  hostNotes: string | null | undefined,
  status: string | null | undefined
): Promise<Booking | null> {
  if (!isUuid(callerId)) throw new Error('Invalid caller')
  if (!isUuid(bookingId)) throw new Error('Invalid booking')

  // Always load the booking + its listing's owner and enforce authorization for
  // EVERY call (reads included), so this endpoint can never read or mutate
  // another user's reservation. This closes the IDOR.
  const { rows: orows } = await pool.query(
    `SELECT b.status AS current_status, l.host_id
       FROM bookings b JOIN listings l ON l.id = b.listing_id WHERE b.id = $1`,
    [bookingId]
  )
  const owner = orows[0] as { current_status: string; host_id: string | null } | undefined
  if (!owner) return null
  if (!owner.host_id || owner.host_id !== callerId) {
    throw new Error('Forbidden: only the listing host can update this reservation')
  }

  const sets: string[] = []
  const params: unknown[] = [bookingId]
  // host_notes is only touched when explicitly supplied (undefined = leave as-is),
  // so a status-only decision never clobbers existing notes.
  if (hostNotes !== undefined) { params.push(hostNotes); sets.push(`host_notes = $${params.length}`) }
  let newStatus: 'confirmed' | 'rejected' | null = null
  if (status !== undefined && status !== null && status !== '') {
    const mapped = BOOKING_STATUS_ACTIONS[status]
    if (!mapped) throw new Error('Invalid status (allowed actions: confirm, reject)')
    if (owner.current_status !== 'pending') {
      throw new Error('Invalid status transition: only a pending reservation can be confirmed or rejected')
    }
    newStatus = mapped
    params.push(newStatus); sets.push(`status = $${params.length}`)
    // THE RULE: the QR/pass code is minted at the confirmation transition and
    // never before — a reservation still awaiting approval keeps a NULL code, so
    // no client can build a /stay link, a QR or a wallet pass for it. COALESCE
    // makes this idempotent: once issued, the code never changes.
    if (newStatus === 'confirmed') {
      params.push(genReservationCode())
      sets.push(`reservation_code = COALESCE(NULLIF(reservation_code, ''), $${params.length})`)
    }
  }
  const select = `SELECT ${BOOKING_COLS} FROM bookings b JOIN listings l ON l.id = b.listing_id WHERE b.id = $1`
  if (!sets.length) {
    const { rows } = await pool.query(select, [bookingId])
    return (rows[0] as Booking) ?? null
  }
  const update = `WITH upd AS (UPDATE bookings SET ${sets.join(', ')} WHERE id = $1 RETURNING *)
     SELECT ${BOOKING_COLS}, b.user_id AS _uid FROM upd b JOIN listings l ON l.id = b.listing_id`
  let rows: unknown[] = []
  // Reservation codes are unique (ux_bookings_reservation_code). A collision is
  // vanishingly rare but it would fail the host's approval, so draw again rather
  // than surface an error. Nothing was written when the statement raised.
  for (let attempt = 0; ; attempt++) {
    try {
      rows = (await pool.query(update, params)).rows
      break
    } catch (err) {
      const duplicate =
        (err as { code?: string }).code === '23505' && newStatus === 'confirmed' && attempt < 2
      if (!duplicate) throw err
      params[params.length - 1] = genReservationCode()
    }
  }
  const row = rows[0] as (Booking & { _uid?: string; title?: string }) | undefined
  // Notify the guest when the host approves (prompt them to pay) or declines.
  if (row && row._uid && (newStatus === 'confirmed' || newStatus === 'rejected') && isUuid(row._uid)) {
    const title = row.title ?? 'your stay'
    if (newStatus === 'confirmed') {
      await createNotification(row._uid!, 'booking', 'Reservation approved',
        `Your reservation at ${title} was approved. Complete your payment to confirm your stay.`, '/reservations')
    } else {
      await createNotification(row._uid!, 'booking', 'Reservation declined',
        `Your reservation at ${title} was declined by the host.`, '/reservations')
    }
  }
  if (row) delete row._uid
  return (row as Booking) ?? null
}

// ---- Stay pass (public, by reservation code) + host-authored stay guide -----

export type StayGuideKind = 'info' | 'photo' | 'place_qr' | 'attachment'

const STAY_GUIDE_KINDS: readonly StayGuideKind[] = ['info', 'photo', 'place_qr', 'attachment']

/** Caps mirror normalizeOwnershipDoc / the mobile editors — same rules everywhere. */
const STAY_GUIDE_TITLE_MAX = 120
const STAY_GUIDE_BODY_MAX = 4000
const STAY_GUIDE_URL_MAX = 3_500_000

/** Every message the stay-guide validators below can throw. Routes use
 *  isStayGuideInputError() to answer 400 (and echo the message to the host)
 *  instead of a generic 500 — listing them here keeps that mapping exact. */
const STAY_GUIDE_INPUT_ERRORS: ReadonlySet<string> = new Set([
  'Invalid caller',
  'Invalid booking',
  'Invalid item',
  'Invalid item type',
  'That text is too long',
  'That file is too large',
  'Please add the link this QR should open',
  'Please attach a file',
  'Please attach a file or use an http(s) link',
  'Place links must start with http:// or https://',
  'Add a title or some text',
  'The stay guide opens once the reservation is confirmed',
])

/** True when the error is the host's input to fix, not a server fault. */
export function isStayGuideInputError(err: unknown): err is Error {
  return err instanceof Error && STAY_GUIDE_INPUT_ERRORS.has(err.message)
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

function normalizeGuideText(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null
  // Stored as plain text and rendered escaped (never dangerouslySetInnerHTML) —
  // this is host-supplied content shown to strangers. Control characters are
  // stripped; newlines survive so an info block can hold paragraphs.
  const text = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
  if (!text) return null
  if (text.length > max) throw new Error('That text is too long')
  return text
}

/** Per-kind URL rules. `place_qr` is a link a guest's phone will open, so only
 *  http(s) — never `data:` or `javascript:`. Photos/attachments may also be the
 *  inline data URLs the device uploaders produce. */
function normalizeGuideUrl(kind: StayGuideKind, value: unknown): string | null {
  const url = String(value ?? '').trim()
  if (kind === 'info') return url ? normalizeGuideText(url, STAY_GUIDE_URL_MAX) : null
  if (!url) throw new Error(kind === 'place_qr' ? 'Please add the link this QR should open' : 'Please attach a file')
  if (url.length > STAY_GUIDE_URL_MAX) throw new Error('That file is too large')
  if (kind === 'place_qr') {
    if (!/^https?:\/\//i.test(url)) throw new Error('Place links must start with http:// or https://')
    return url
  }
  if (!/^(data:|https?:\/\/)/i.test(url)) throw new Error('Please attach a file or use an http(s) link')
  return url
}

function normalizeGuideKind(value: unknown): StayGuideKind {
  const kind = String(value ?? '').trim() as StayGuideKind
  if (!STAY_GUIDE_KINDS.includes(kind)) throw new Error('Invalid item type')
  return kind
}

/** Items for one booking, ordered. Tolerates a database that has not run the
 *  stay_guide_items migration yet (returns []) so the pass still renders. */
async function listStayGuideItems(bookingId: string): Promise<StayGuideItem[]> {
  if (!isUuid(bookingId)) return []
  try {
    const { rows } = await pool.query(
      `SELECT id, kind, title, body, url, "order"
         FROM stay_guide_items WHERE booking_id = $1
        ORDER BY "order" ASC, created_at ASC`,
      [bookingId]
    )
    return rows as StayGuideItem[]
  } catch (err) {
    if ((err as { code?: string }).code === '42P01') return [] // table not migrated yet
    throw err
  }
}

/**
 * PUBLIC lookup for /stay/<code> — no auth, because anyone holding the code
 * (Wallet pass, in-app QR, printed card) must be able to open it. Returns null
 * for a missing/unknown code so the page can render a friendly not-found rather
 * than a raw 404. Only bookings that actually own a code can be found, and a
 * code only exists once the reservation was confirmed.
 */
export async function getStayByCode(codeRaw: unknown): Promise<StayPass | null> {
  const code = normalizeReservationCode(codeRaw)
  if (!code) return null
  const { rows } = await pool.query(
    `SELECT b.id AS _bid,
            NULLIF(b.reservation_code, '') AS reservation_code,
            l.title, l.location, l.country,
            to_char(b.check_in, 'YYYY-MM-DD') AS check_in,
            to_char(b.check_out, 'YYYY-MM-DD') AS check_out,
            b.guests, b.status,
            CASE WHEN b.paid_at IS NULL THEN 'unpaid' ELSE 'paid' END AS payment_status,
            b.host_notes,
            (SELECT split_part(btrim(u.full_name), ' ', 1) FROM users u WHERE u.id = b.user_id) AS guest_name,
            (SELECT u.full_name FROM users u WHERE u.id = l.host_id) AS host_name,
            (SELECT url FROM listing_images li WHERE li.listing_id = l.id ORDER BY li."order" LIMIT 1) AS image
       FROM bookings b JOIN listings l ON l.id = b.listing_id
      WHERE upper(b.reservation_code) = $1
      LIMIT 1`,
    [code]
  )
  const row = rows[0] as (StayPass & { _bid: string }) | undefined
  if (!row) return null
  const { _bid, ...pass } = row
  // The guide is host-authored content for a live stay — nothing to show once
  // the reservation is cancelled/rejected. 'completed' still counts: the stay
  // happened, the guest keeps their pass, and quickin-backend's getStayByCode
  // (plus iOS `isApproved` / Android `isApproved`) draw the line in exactly the
  // same place — a stay pass that worked yesterday must not go blank at checkout.
  const guide = isLiveStayStatus(pass.status) ? await listStayGuideItems(_bid) : []
  return { ...pass, guide }
}

/** Authorization for every stay-guide write: the caller must be the host of the
 *  listing this booking belongs to (never a client-supplied host id), and the
 *  booking must be confirmed. Returns the booking's status. */
async function assertStayGuideHost(callerId: string, bookingId: string): Promise<void> {
  if (!isUuid(callerId)) throw new Error('Invalid caller')
  if (!isUuid(bookingId)) throw new Error('Invalid booking')
  const { rows } = await pool.query(
    `SELECT b.status, l.host_id FROM bookings b JOIN listings l ON l.id = b.listing_id WHERE b.id = $1`,
    [bookingId]
  )
  const row = rows[0] as { status: string; host_id: string | null } | undefined
  if (!row) throw new Error('Reservation not found')
  if (!row.host_id || row.host_id !== callerId) {
    throw new Error('Forbidden: only the listing host can edit this stay guide')
  }
  if (row.status !== 'confirmed') {
    throw new Error('The stay guide opens once the reservation is confirmed')
  }
}

/** Read access: the booking's host OR its guest. `canEdit` is true only for the
 *  host of a confirmed booking. Returns null when the viewer is neither. */
export async function getStayGuideForViewer(
  viewerId: string,
  bookingId: string
): Promise<{ items: StayGuideItem[]; canEdit: boolean } | null> {
  if (!isUuid(viewerId) || !isUuid(bookingId)) return null
  const { rows } = await pool.query(
    `SELECT b.status, b.user_id, l.host_id FROM bookings b JOIN listings l ON l.id = b.listing_id WHERE b.id = $1`,
    [bookingId]
  )
  const row = rows[0] as { status: string; user_id: string; host_id: string | null } | undefined
  if (!row) return null
  const isHost = !!row.host_id && row.host_id === viewerId
  if (!isHost && row.user_id !== viewerId) return null
  return {
    items: await listStayGuideItems(bookingId),
    canEdit: isHost && row.status === 'confirmed',
  }
}

export interface StayGuideItemInput {
  kind?: unknown
  title?: unknown
  body?: unknown
  url?: unknown
  order?: unknown
}

export async function addStayGuideItem(
  callerId: string,
  bookingId: string,
  input: StayGuideItemInput
): Promise<StayGuideItem> {
  await assertStayGuideHost(callerId, bookingId)
  const kind = normalizeGuideKind(input.kind)
  const title = normalizeGuideText(input.title, STAY_GUIDE_TITLE_MAX)
  const body = normalizeGuideText(input.body, STAY_GUIDE_BODY_MAX)
  const url = normalizeGuideUrl(kind, input.url)
  if (kind === 'info' && !title && !body) throw new Error('Add a title or some text')
  const { rows } = await pool.query(
    `INSERT INTO stay_guide_items (booking_id, kind, title, body, url, "order")
     VALUES ($1, $2, $3, $4, $5,
             COALESCE((SELECT MAX("order") + 1 FROM stay_guide_items WHERE booking_id = $1), 0))
     RETURNING id, kind, title, body, url, "order"`,
    [bookingId, kind, title, body, url]
  )
  return rows[0] as StayGuideItem
}

export async function updateStayGuideItem(
  callerId: string,
  bookingId: string,
  itemId: string,
  patch: StayGuideItemInput
): Promise<StayGuideItem | null> {
  await assertStayGuideHost(callerId, bookingId)
  if (!isUuid(itemId)) throw new Error('Invalid item')
  const { rows: existing } = await pool.query(
    `SELECT id, kind, title, body, url, "order" FROM stay_guide_items WHERE id = $1 AND booking_id = $2`,
    [itemId, bookingId]
  )
  const current = existing[0] as StayGuideItem | undefined
  if (!current) return null
  // Merge then re-validate as a whole: changing the kind re-checks the URL under
  // the new kind's rules (e.g. an existing data: URL can't become a place_qr).
  const kind = patch.kind === undefined ? current.kind : normalizeGuideKind(patch.kind)
  const title = patch.title === undefined ? current.title : normalizeGuideText(patch.title, STAY_GUIDE_TITLE_MAX)
  const body = patch.body === undefined ? current.body : normalizeGuideText(patch.body, STAY_GUIDE_BODY_MAX)
  const url = normalizeGuideUrl(kind, patch.url === undefined ? current.url : patch.url)
  const order = patch.order === undefined ? current.order : Math.max(0, Math.floor(Number(patch.order) || 0))
  const { rows } = await pool.query(
    `UPDATE stay_guide_items SET kind = $3, title = $4, body = $5, url = $6, "order" = $7
      WHERE id = $1 AND booking_id = $2
      RETURNING id, kind, title, body, url, "order"`,
    [itemId, bookingId, kind, title, body, url, order]
  )
  return (rows[0] as StayGuideItem) ?? null
}

export async function deleteStayGuideItem(
  callerId: string,
  bookingId: string,
  itemId: string
): Promise<boolean> {
  await assertStayGuideHost(callerId, bookingId)
  if (!isUuid(itemId)) throw new Error('Invalid item')
  const res = await pool.query(
    `DELETE FROM stay_guide_items WHERE id = $1 AND booking_id = $2`,
    [itemId, bookingId]
  )
  return !!res.rowCount && res.rowCount > 0
}

// ---- Promo codes (mock) -----------------------------------------------------

const PROMO_CODES: Record<string, { kind: 'percent' | 'fixed'; value: number; message: string }> = {
  WELCOME10: { kind: 'percent', value: 10, message: '10% off your stay' },
  QUICKIN15: { kind: 'percent', value: 15, message: '15% off applied' },
  SAVE50:    { kind: 'fixed',   value: 50, message: 'EGP 50 off applied' },
}

export function quotePromo(codeRaw: string, subtotal: number): {
  valid: boolean; code: string; kind: string | null; value: number; discount: number; message: string
} {
  const code = String(codeRaw || '').trim().toUpperCase()
  const sub = Math.max(0, Math.round(Number(subtotal) || 0))
  const p = PROMO_CODES[code]
  if (!p) return { valid: false, code, kind: null, value: 0, discount: 0, message: 'Invalid or expired promo code' }
  const discount = p.kind === 'percent' ? Math.round((sub * p.value) / 100) : Math.min(p.value, sub)
  return { valid: true, code, kind: p.kind, value: p.value, discount, message: p.message }
}

// ---- Referrals --------------------------------------------------------------

/** A stable share code derived from the user id (no referral-tracking table yet). */
export async function getReferralSummary(
  userId: string
): Promise<{ code: string; count: number; rewardTotal: number; referred: unknown[] }> {
  if (!isUuid(userId)) return { code: '', count: 0, rewardTotal: 0, referred: [] }
  const code = 'QK-' + userId.replace(/-/g, '').slice(0, 6).toUpperCase()
  return { code, count: 0, rewardTotal: 0, referred: [] }
}

export async function getUserBookings(userId: string): Promise<Booking[]> {
  if (!isUuid(userId)) return []
  const { rows } = await pool.query(
    `SELECT ${BOOKING_COLS} FROM bookings b JOIN listings l ON l.id = b.listing_id
     WHERE b.user_id = $1 ORDER BY b.check_in DESC`,
    [userId]
  )
  return rows as Booking[]
}

export interface PublicUser {
  id: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
}

// ---- Email OTP codes --------------------------------------------------------

/** Store (or replace) the active 6-digit code for an email. */
export async function createOtpCode(email: string, code: string, ttlMinutes = 10): Promise<void> {
  await pool.query(
    `INSERT INTO otp_codes (email, code, expires_at, attempts)
     VALUES (lower($1), $2, now() + make_interval(mins => $3), 0)
     ON CONFLICT (email)
     DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at,
                   attempts = 0, created_at = now()`,
    [email, code, ttlMinutes]
  )
}

/** Flip an account to verified after a successful OTP check (the email gate). */
export async function markEmailVerified(email: string): Promise<void> {
  await pool.query(`UPDATE users SET email_verified = true WHERE lower(email) = lower($1)`, [email])
}

/** True if [code] matches the unexpired stored code (≤5 tries). Consumes it on success. */
export async function verifyOtpCode(email: string, code: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT code, expires_at, attempts FROM otp_codes WHERE email = lower($1)`,
    [email]
  )
  const row = rows[0]
  if (!row) return false
  if (new Date(row.expires_at).getTime() < Date.now()) return false
  if (row.attempts >= 5) return false
  if (String(row.code) !== String(code).trim()) {
    await pool.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE email = lower($1)`, [email])
    return false
  }
  await pool.query(`DELETE FROM otp_codes WHERE email = lower($1)`, [email])
  return true
}

export async function getUserById(userId: string): Promise<PublicUser | null> {
  if (!isUuid(userId)) return null
  const { rows } = await pool.query(
    `SELECT id, full_name, avatar_url, created_at FROM users WHERE id = $1`,
    [userId]
  )
  return rows[0] ?? null
}

// ---- ID verification --------------------------------------------------------

export interface VerificationRow {
  /** Row id — null when the user has never submitted. Lets a host application
   *  link to the submission it was filed with. */
  id: string | null
  status: string                 // unverified | pending | verified | rejected
  id_number: string | null
  full_name: string | null
  /** national_id | passport | residence_permit; null on rows predating doc_type. */
  doc_type: string | null
  notes: string | null
  submitted_at: string | null
  reviewed_at: string | null
}

const UNVERIFIED: VerificationRow = {
  id: null, status: 'unverified', id_number: null, full_name: null,
  doc_type: null, notes: null, submitted_at: null, reviewed_at: null,
}

/** Latest verification submission for a user, or 'unverified' if none. */
export async function getVerification(userId: string): Promise<VerificationRow> {
  if (!isUuid(userId)) return UNVERIFIED
  const { rows } = await pool.query(
    `SELECT id, status, id_number, full_name, doc_type, notes, submitted_at, reviewed_at
       FROM id_verifications WHERE user_id = $1
      ORDER BY submitted_at DESC LIMIT 1`,
    [userId]
  )
  return (rows[0] as VerificationRow) ?? UNVERIFIED
}

/** Submit ID photos (front + optional back + selfie) for review — reuses the user's pending row if one exists. */
export async function submitVerification(args: {
  userId: string
  imageData: string
  backImageData?: string | null
  selfieImageData?: string | null
  idNumber?: string | null
  fullName?: string | null
  /** Which document this is; the reviewer checks the photo against it. */
  docType?: string | null
  source?: string
}): Promise<VerificationRow> {
  const { userId, imageData, backImageData = null, selfieImageData = null, idNumber = null, fullName = null, docType = null, source = 'manual' } = args
  const existing = await pool.query(
    `SELECT id FROM id_verifications WHERE user_id = $1 AND status = 'pending' LIMIT 1`,
    [userId]
  )
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE id_verifications
          SET image_data = $2, back_image_data = $3, selfie_image_data = $4,
              id_number = COALESCE($5, id_number),
              full_name = COALESCE($6, full_name), source = $7,
              doc_type = COALESCE($8, doc_type),
              submitted_at = now(), reviewed_at = NULL, reviewed_by = NULL, notes = NULL
        WHERE id = $1`,
      [existing.rows[0].id, imageData, backImageData, selfieImageData, idNumber, fullName, source, docType]
    )
  } else {
    await pool.query(
      `INSERT INTO id_verifications (user_id, image_data, back_image_data, selfie_image_data, id_number, full_name, source, doc_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, imageData, backImageData, selfieImageData, idNumber, fullName, source, docType]
    )
  }
  // Mirror onto the source of truth. Without this the backend's own verification
  // queue (which reads users WHERE verification_status = 'pending') stays empty
  // forever, and a re-submission after a rejection would still show as rejected.
  //
  // Deliberately NOT applied to an already-verified account: a host renewing an
  // expiring ID would otherwise drop their badge — and the verified pill on every
  // one of their listings — for however long the review takes. They keep it until
  // an admin actually decides on the new document.
  await pool.query(
    `UPDATE users SET verification_status = 'pending', verified_at = NULL
      WHERE id = $1 AND COALESCE(verification_status, 'unverified') <> 'verified'`,
    [userId],
  )
  return getVerification(userId)
}

// ---- Reviews (guest → listing, "rate the place") ----------------------------

export interface Review {
  rating: number
  comment: string | null
  reviewer_name: string | null
  created_at: string
  photos: string[]
}

/** Public, newest-first reviews for a listing. */
export async function getListingReviews(listingId: string): Promise<Review[]> {
  if (!isUuid(listingId)) return []
  const { rows } = await pool.query(
    `SELECT r.rating, r.comment, u.full_name AS reviewer_name,
            to_char(r.created_at, 'YYYY-MM-DD') AS created_at, r.photos
       FROM reviews r JOIN users u ON u.id = r.reviewer_id
      WHERE r.listing_id = $1
      ORDER BY r.created_at DESC`,
    [listingId]
  )
  return rows.map((r) => ({ ...r, photos: Array.isArray(r.photos) ? r.photos : [] })) as Review[]
}

export interface ReviewableStay {
  booking_id: string
  listing_id: string
  title: string
  location: string | null
  image: string | null
  check_in: string
  check_out: string
}

/** Stays the user may review: their confirmed bookings, past check-out, not yet reviewed. */
export async function getReviewableStays(userId: string): Promise<ReviewableStay[]> {
  if (!isUuid(userId)) return []
  const { rows } = await pool.query(
    `SELECT b.id AS booking_id, b.listing_id, l.title, l.location,
            (SELECT url FROM listing_images li WHERE li.listing_id = l.id ORDER BY "order" LIMIT 1) AS image,
            to_char(b.check_in,'YYYY-MM-DD')  AS check_in,
            to_char(b.check_out,'YYYY-MM-DD') AS check_out
       FROM bookings b JOIN listings l ON l.id = b.listing_id
      WHERE b.user_id = $1 AND b.status = 'confirmed' AND b.check_out < CURRENT_DATE
        AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id AND r.reviewer_id = $1)
      ORDER BY b.check_out DESC`,
    [userId]
  )
  return rows as ReviewableStay[]
}

/** Submit (or update) a guest's review of the place. Requires a past, confirmed, owned booking. */
export async function submitReview(args: {
  userId: string
  bookingId: string
  rating: number
  comment?: string | null
  photos?: string[]
}): Promise<void> {
  const { userId, bookingId, rating, comment = null, photos = [] } = args
  if (!isUuid(bookingId)) throw new Error('Invalid booking')
  // A review is public and permanent, so it's the most attractive place to park
  // a phone number. Same guard as chat.
  await guardContent(userId, comment ?? '', 'review', { type: 'booking', id: bookingId })
  const r = Math.max(1, Math.min(5, Math.round(rating)))
  const { rows } = await pool.query(
    `SELECT listing_id FROM bookings
      WHERE id = $1 AND user_id = $2 AND status = 'confirmed' AND check_out < CURRENT_DATE`,
    [bookingId, userId]
  )
  if (!rows[0]) throw new Error('This stay is not eligible for a review yet')
  const listingId = rows[0].listing_id
  // reviews.photos is a Postgres text[] (not jsonb) on the live DB — pass the JS
  // array directly so node-postgres maps it to a text[] (no ::jsonb cast).
  const photosArr = (photos || []).slice(0, 6)
  // Manual upsert (no ON CONFLICT) so a missing/late UNIQUE(booking_id,reviewer_id)
  // constraint on the live DB can't 500 the write — the eligibility guard above
  // already restricts this to one booking per reviewer.
  const upd = await pool.query(
    `UPDATE reviews SET rating = $3, comment = $4, photos = $5, created_at = now()
      WHERE booking_id = $1 AND reviewer_id = $2 RETURNING id`,
    [bookingId, userId, r, comment, photosArr]
  )
  if (!upd.rows[0]) {
    await pool.query(
      `INSERT INTO reviews (booking_id, listing_id, reviewer_id, rating, comment, photos)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [bookingId, listingId, userId, r, comment, photosArr]
    )
  }
}

// ---- Guest reviews (host → guest). Listings carry no owner, so "reviewable
// guests" can't be derived; the endpoints exist so clients don't 404. ---------

export interface GuestReview {
  id: string
  booking_id: string | null
  guest_id: string | null
  host_id: string | null
  rating: number
  comment: string | null
  created_at: string
  host_name: string | null
}

export async function getGuestReviews(guestId: string): Promise<GuestReview[]> {
  if (!isUuid(guestId)) return []
  const { rows } = await pool.query(
    `SELECT g.id, g.booking_id, g.guest_id, g.host_id, g.rating, g.comment,
            to_char(g.created_at,'YYYY-MM-DD') AS created_at, u.full_name AS host_name
       FROM guest_reviews g LEFT JOIN users u ON u.id = g.host_id
      WHERE g.guest_id = $1 ORDER BY g.created_at DESC`,
    [guestId]
  )
  return rows as GuestReview[]
}

/** No host-ownership model in this schema → a host has no derivable reviewable guests. */
export async function getReviewableGuests(_userId: string): Promise<unknown[]> {
  return []
}

export async function submitGuestReview(args: {
  hostId: string
  bookingId: string
  rating: number
  comment?: string | null
}): Promise<void> {
  const { hostId, bookingId, rating, comment = null } = args
  if (!isUuid(bookingId)) throw new Error('Invalid booking')
  const r = Math.max(1, Math.min(5, Math.round(rating)))
  const { rows } = await pool.query(
    `SELECT b.user_id AS guest_id, b.listing_id, l.host_id
       FROM bookings b JOIN listings l ON l.id = b.listing_id
      WHERE b.id = $1 AND b.status = 'confirmed' AND b.check_out < CURRENT_DATE`,
    [bookingId]
  )
  if (!rows[0]) throw new Error('This guest is not eligible for a review yet')
  const { guest_id, listing_id, host_id } = rows[0]
  // Only the listing's host may review the guest (when ownership is known).
  if (host_id && host_id !== hostId) {
    throw new Error('Forbidden: only the listing host can review this guest')
  }
  // guest_reviews.listing_id is NOT NULL; provide it. Manual upsert (no ON CONFLICT)
  // so a missing UNIQUE(booking_id) constraint on the live DB can't 500 the write.
  const upd = await pool.query(
    `UPDATE guest_reviews SET rating = $2, comment = $3, host_id = $4, created_at = now()
      WHERE booking_id = $1 RETURNING id`,
    [bookingId, r, comment, hostId]
  )
  if (upd.rows[0]) return
  await pool.query(
    `INSERT INTO guest_reviews (booking_id, listing_id, guest_id, host_id, rating, comment)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [bookingId, listing_id, guest_id, hostId, r, comment]
  )
}

// ---- Host applications (Become a host → admin review → approve) -------------

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

/** The host types a user can apply as. Stored on users.host_type (no such column
 *  on host_applications) so listings can show a "Company"/"Brokerage" badge. */
export const HOST_TYPES = ['individual', 'company', 'brokerage'] as const
export type HostType = (typeof HOST_TYPES)[number]

/** Application failure carrying the HTTP status + per-field messages the route returns. */
export class HostApplicationError extends Error {
  status: number
  fields?: Record<string, string>
  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message)
    this.name = 'HostApplicationError'
    this.status = status
    this.fields = fields
  }
}

/**
 * Submit (or re-submit) a host application. Does NOT grant host — it only sets the
 * row pending for admin review; only `reviewHostApplication` flips users.is_host.
 * Conflicts (already a host / already under review) are 409s, not silent re-writes.
 * Re-submitting after a rejection clears the previous decision — that is "reapply".
 */
export async function submitHostApplication(
  userId: string,
  f: {
    full_name?: string; national_id?: string; phone?: string; address?: string
    company?: string; notes?: string; host_type?: string
    // Identity documents submitted WITH the application, so one admin decision
    // approves both host status and identity. Required for a new applicant; a
    // host who already has a verified/pending submission need not repeat it.
    doc_type?: string; id_front?: string; id_back?: string; id_selfie?: string
  }
): Promise<{ host_status: 'pending'; application: HostApplication | null }> {
  if (!isUuid(userId)) throw new HostApplicationError('Invalid user', 400)

  // Everything except company + notes is required.
  const full_name = String(f.full_name ?? '').trim()
  const national_id = String(f.national_id ?? '').trim()
  const phone = String(f.phone ?? '').trim()
  const address = String(f.address ?? '').trim()
  const host_type = String(f.host_type ?? '').trim()
  const fields: Record<string, string> = {}
  if (!full_name) fields.full_name = 'Full name is required'
  if (!national_id) fields.national_id = 'National ID is required'
  if (!phone) fields.phone = 'Phone is required'
  if (!address) fields.address = 'Address is required'
  if (!(HOST_TYPES as readonly string[]).includes(host_type)) fields.host_type = 'Choose individual, company or brokerage'

  // Identity documents. An applicant who already has a verified or pending
  // submission (e.g. they verified as a guest first) doesn't upload again.
  const priorVerification = await getVerification(userId)
  const alreadySubmitted = priorVerification?.status === 'verified' || priorVerification?.status === 'pending'
  const idFront = String(f.id_front ?? '').trim()
  let docType: string | null = null
  if (!alreadySubmitted) {
    if (!idFront) {
      fields.id_front = 'A photo of your ID is required'
    }
    try {
      docType = normalizeDocType(f.doc_type)
    } catch (e) {
      fields.doc_type = e instanceof Error ? e.message : 'Choose a document type'
    }
  }
  if (Object.keys(fields).length) {
    throw new HostApplicationError('Please check the highlighted fields', 400, fields)
  }

  const { rows: urows } = await pool.query(`SELECT COALESCE(is_host, false) AS is_host FROM users WHERE id=$1`, [userId])
  if (!urows[0]) throw new HostApplicationError('Invalid user', 400)
  if (urows[0].is_host) throw new HostApplicationError('Already a host', 409)
  const existing = await getHostApplication(userId)
  if (existing?.status === 'pending') throw new HostApplicationError('Application already under review', 409)

  // Upsert on the UNIQUE (user_id) constraint, clearing any previous decision.
  const vals = [userId, full_name, national_id, phone, address, f.company?.trim() || null, f.notes?.trim() || null]
  const upd = await pool.query(
    `UPDATE host_applications
        SET full_name=$2, national_id=$3, phone=$4, address=$5, company=$6, notes=$7,
            status='pending', submitted_at=now(), reviewed_at=NULL, reviewed_by=NULL, review_note=NULL
      WHERE user_id=$1 RETURNING id`,
    vals
  )
  if (!upd.rows[0]) {
    await pool.query(
      `INSERT INTO host_applications (user_id, full_name, national_id, phone, address, company, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      vals
    )
  }
  // File the identity documents and link them to the application, so approving
  // the application can approve the identity in the same decision.
  if (!alreadySubmitted && idFront) {
    const v = await submitVerification({
      userId,
      imageData: idFront,
      backImageData: String(f.id_back ?? '').trim() || null,
      selfieImageData: String(f.id_selfie ?? '').trim() || null,
      idNumber: national_id,
      fullName: full_name,
      docType,
      source: 'host_application',
    })
    await pool.query(`UPDATE host_applications SET verification_id=$2 WHERE user_id=$1`, [userId, v.id])
  } else if (priorVerification?.id) {
    await pool.query(`UPDATE host_applications SET verification_id=$2 WHERE user_id=$1`, [userId, priorVerification.id])
  }
  // Persist the host type + company name on the user so listings can show a
  // "Company"/"Brokerage" badge (an individual has no company name).
  const company = host_type === 'individual' ? null : (f.company?.trim() || null)
  await pool.query(`UPDATE users SET host_type=$2, company=$3 WHERE id=$1`, [userId, host_type, company])
  return { host_status: 'pending', application: await getHostApplication(userId) }
}

export async function getHostApplication(userId: string): Promise<HostApplication | null> {
  if (!isUuid(userId)) return null
  const { rows } = await pool.query(
    `SELECT id, user_id, full_name, national_id, phone, address, company, notes, status,
            to_char(submitted_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS submitted_at,
            to_char(reviewed_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS reviewed_at, review_note,
            verification_id,
            (SELECT v.doc_type FROM id_verifications v WHERE v.id = host_applications.verification_id) AS doc_type,
            (SELECT v.status   FROM id_verifications v WHERE v.id = host_applications.verification_id) AS verification_status
       FROM host_applications WHERE user_id=$1`,
    [userId]
  )
  return (rows[0] as HostApplication) ?? null
}

/** The admin queue. Defaults to the applications still awaiting a decision;
 *  `status` accepts 'pending' | 'approved' | 'rejected' | 'all'. */
export async function getPendingHostApplications(status: string = 'pending'): Promise<HostApplication[]> {
  const filter = ['pending', 'approved', 'rejected'].includes(status) ? status : null
  const { rows } = await pool.query(
    // The linked ID submission rides along so the reviewer can open the document
    // before approving — approving an application now verifies the identity too,
    // and approving that blind would defeat the point of the check.
    `SELECT a.id, a.user_id, a.full_name, a.national_id, a.phone, a.address, a.company, a.notes, a.status,
            to_char(a.submitted_at,'YYYY-MM-DD HH24:MI') AS submitted_at,
            to_char(a.reviewed_at,'YYYY-MM-DD HH24:MI') AS reviewed_at, a.review_note,
            u.email, u.host_type,
            a.verification_id,
            (SELECT v.doc_type FROM id_verifications v WHERE v.id = a.verification_id) AS doc_type,
            (SELECT v.status   FROM id_verifications v WHERE v.id = a.verification_id) AS verification_status
       FROM host_applications a JOIN users u ON u.id = a.user_id
      WHERE ($1::text IS NULL OR a.status = $1) ORDER BY a.submitted_at ASC`,
    [filter]
  )
  return rows as HostApplication[]
}

/** Admin decision on a host application. Approve → set users.is_host + notify; reject → notify.
 *  The application row and the users flip are one transaction so an approval can never
 *  half-land (approved application, still not a host). The notification is sent after
 *  the commit — it must never roll a decision back. */
export async function reviewHostApplication(appId: string, action: 'approve' | 'reject', note: string | null, actor: string): Promise<void> {
  if (!isUuid(appId)) throw new Error('Invalid application')
  const status = action === 'approve' ? 'approved' : 'rejected'
  const client = await pool.connect()
  let uid = ''
  let verifiedIdentity = false
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      // `actor` is staff:<uuid>; this used to be the literal 'admin', which threw
      // away who actually made the call.
      `UPDATE host_applications SET status=$2, reviewed_at=now(), reviewed_by=$4, review_note=$3
        WHERE id=$1 RETURNING user_id`,
      [appId, status, note, actor]
    )
    uid = rows[0]?.user_id ?? ''
    if (!uid) throw new Error('Application not found')
    if (action === 'approve') {
      await client.query(`UPDATE users SET is_host = true WHERE id = $1`, [uid])
      // Keep the legacy `role` flag in sync so the mobile backend (which reads role)
      // also recognizes this host. The column is absent on a frontend-only dev DB, so
      // it runs behind a SAVEPOINT: a missing column must not abort the approval.
      try {
        await client.query('SAVEPOINT role_sync')
        await client.query(`UPDATE users SET role = 'host' WHERE id = $1`, [uid])
      } catch {
        await client.query('ROLLBACK TO SAVEPOINT role_sync') /* role column not present */
      }
      // ONE decision approves both facts: the applicant becomes a host AND their
      // identity documents — submitted with the application and linked by
      // verification_id — are marked verified. Without this an approved host
      // would still be blocked by the listing gate with nothing left to do.
      const linked = await client.query(
        `SELECT verification_id FROM host_applications WHERE id = $1`,
        [appId],
      )
      const verifId = linked.rows[0]?.verification_id ?? null
      if (verifId) {
        await client.query(
          `UPDATE id_verifications
              SET status = 'verified', reviewed_at = now(), reviewed_by = $2, notes = $3
            WHERE id = $1`,
          [verifId, actor, note],
        )
        await client.query(
          `UPDATE users SET verification_status = 'verified', verified_at = now() WHERE id = $1`,
          [uid],
        )
        verifiedIdentity = true
      }
    } else {
      // Rejecting the application leaves the ID submission alone: it may be a
      // perfectly good document and the applicant may reapply. Rejecting the
      // identity is a separate decision in Verifications.
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
  if (action === 'approve') {
    await createNotification(
      uid, 'host', 'You are now a host!',
      verifiedIdentity
        ? 'Your host application and identity documents were approved — you can now list your space and accept guests.'
        : 'Your host application was approved. Verify your identity to start publishing listings.',
      verifiedIdentity ? '/host' : '/verify-id',
    )
  } else {
    await createNotification(uid, 'host', 'Host application update', note ? `Your application needs attention: ${note}` : 'Your host application was not approved this time.', '/account')
  }
}

// ---- Admin: ID verification review -----------------------------------------

/**
 * One document's stored value, looked up THROUGH its subject.
 *
 * Returns null for a missing row, a missing column value, and a non-uuid id alike —
 * the route collapses all three to an identical 404 so an operator can't tell "no
 * such user" from "that user has no selfie on file".
 *
 * `column` comes from `idColumnFor`, a closed map that is unit-tested to contain only
 * bare identifiers — nothing user-supplied is ever interpolated here.
 */
export async function adminReadDocument(
  kind: DocumentKind,
  id: string,
): Promise<{ value: string; subjectId: string } | null> {
  if (!isUuid(id)) return null
  if (kind === 'ownership') {
    const { rows } = await pool.query(
      `SELECT ownership_doc AS value, host_id AS subject_id FROM listings WHERE id = $1`,
      [id],
    )
    const row = rows[0] as { value: string | null; subject_id: string | null } | undefined
    if (!row?.value) return null
    // The listing is the subject for audit purposes, so its own id is the target.
    return { value: row.value, subjectId: id }
  }
  const column = idColumnFor(kind)
  if (!column) return null
  const { rows } = await pool.query(
    `SELECT ${column} AS value, user_id AS subject_id FROM id_verifications WHERE id = $1`,
    [id],
  )
  const row = rows[0] as { value: string | null; subject_id: string } | undefined
  if (!row?.value) return null
  return { value: row.value, subjectId: row.subject_id }
}

/**
 * Write a document-view audit row — and THROW if it fails.
 *
 * Deliberately not `logStaffAction` (staff.ts), which swallows every error by
 * contract so an audit hiccup can't break the action being audited. That trade is
 * right for a block/unblock: losing the log is worse than losing the action. Here it
 * inverts — "log who viewed what" IS the feature, so an unlogged view is the exact
 * outcome E4 exists to prevent. No log, no bytes.
 *
 * Do not "fix" the inconsistency by routing this through logStaffAction.
 */
export async function recordDocumentView(entry: {
  staffId: string | null
  staffEmail: string | null
  targetType: 'user' | 'listing'
  targetId: string
  detail: unknown
  ip: string | null
}): Promise<void> {
  await pool.query(
    `INSERT INTO staff_audit_log (staff_id, staff_email, action, target_type, target_id, detail, ip)
     VALUES ($1, $2, 'document_viewed', $3, $4, $5::jsonb, $6)`,
    [entry.staffId, entry.staffEmail, entry.targetType, entry.targetId, JSON.stringify(entry.detail), entry.ip],
  )
}

export interface AdminVerificationRow {
  id: string
  user_id: string
  email: string
  full_name: string | null
  id_number: string | null
  status: string
  /** Which documents are on file. The BYTES are deliberately absent — they come
   *  from the audited /api/local/admin/documents endpoint, one explicit request at
   *  a time. This queue used to ship every pending submission's three base64 photos
   *  to anyone who opened the tab, with no record of who saw them. */
  has_front: boolean
  has_back: boolean
  has_selfie: boolean
  submitted_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  notes: string | null
}

/** The /ops verification queue. `filter` defaults to 'pending' — the work list —
 *  but a decided case can be found again and reopened. */
export async function getPendingVerifications(
  filter: VerificationFilter = 'pending',
): Promise<AdminVerificationRow[]> {
  const { rows } = await pool.query(
    `SELECT v.id, v.user_id, u.email, v.full_name, v.id_number, v.status,
            (v.image_data        IS NOT NULL AND v.image_data        <> '') AS has_front,
            (v.back_image_data   IS NOT NULL AND v.back_image_data   <> '') AS has_back,
            (v.selfie_image_data IS NOT NULL AND v.selfie_image_data <> '') AS has_selfie,
            to_char(v.submitted_at,'YYYY-MM-DD HH24:MI') AS submitted_at,
            to_char(v.reviewed_at, 'YYYY-MM-DD HH24:MI') AS reviewed_at,
            v.reviewed_by, v.notes
       FROM id_verifications v JOIN users u ON u.id = v.user_id
      WHERE ($1 = 'all' OR v.status = $1)
      ORDER BY v.submitted_at ASC
      LIMIT 300`,
    [filter],
  )
  return rows as AdminVerificationRow[]
}

// ---- The host listing gate ---------------------------------------------------

/**
 * The two facts that decide whether someone may put a listing in front of
 * guests: are they an approved host, and did an admin approve their ID?
 *
 * Host status is read from `is_host` OR `role='host'` because the two projects
 * write different columns — this project's application approval sets `is_host`
 * (and syncs `role` behind a SAVEPOINT that may not fire), while the mobile
 * backend has always keyed off `role`. Trusting only one would lock out hosts
 * approved through the other.
 */
export async function getListingGateState(
  userId: string
): Promise<{ isHost: boolean; verificationStatus: string }> {
  if (!isUuid(userId)) return { isHost: false, verificationStatus: 'unverified' }
  const { rows } = await pool.query(
    `SELECT (COALESCE(is_host, false) = true OR role = 'host') AS is_host,
            COALESCE(verification_status, 'unverified') AS verification_status
       FROM users WHERE id = $1`,
    [userId]
  )
  const r = rows[0]
  if (!r) return { isHost: false, verificationStatus: 'unverified' }
  return { isHost: Boolean(r.is_host), verificationStatus: String(r.verification_status) }
}

/**
 * Admin decision on an ID submission — the one writer of a user's verified state.
 *
 * Writes BOTH tables in one transaction: `id_verifications` is the submission log,
 * `users.verification_status` is the source of truth every badge reads (mobile
 * `getUserBadges`, `host_verified` on every listing payload, and the web host
 * profile). They used to disagree — /ops wrote only the submission row, so the
 * apps' verified badges were permanently dark and `users.verified_at` was never
 * written at all.
 *
 * `action: 'pending'` reopens a decided case, clearing the review so it returns to
 * the queue. `actor` is `staff:<uuid>`, replacing the hardcoded 'admin' that
 * discarded who actually decided.
 */
export async function reviewVerification(
  verifId: string,
  action: VerificationAction,
  note: string | null,
  actor: string,
): Promise<void> {
  if (!isUuid(verifId)) throw new Error('Invalid verification')
  const status = statusForAction(action)
  const client = await pool.connect()
  let uid = ''
  let listingsHidden = 0
  let listingsRestored = 0
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      // Reopening clears the review; deciding stamps it.
      `UPDATE id_verifications
          SET status = $2,
              reviewed_at = CASE WHEN $2 = 'pending' THEN NULL ELSE now() END,
              reviewed_by = CASE WHEN $2 = 'pending' THEN NULL ELSE $4 END,
              notes = $3
        WHERE id = $1 RETURNING user_id`,
      [verifId, status, note, actor],
    )
    uid = rows[0]?.user_id ?? ''
    if (!uid) throw new Error('Verification not found')
    // Read the OLD status before overwriting it — losing verification has to take
    // the host's listings off the market, and that is only knowable by comparing.
    const prev = await client.query(
      `SELECT COALESCE(verification_status, 'unverified') AS status FROM users WHERE id = $1`,
      [uid],
    )
    const previousStatus = prev.rows[0]?.status ?? 'unverified'
    await client.query(
      `UPDATE users
          SET verification_status = $2,
              verified_at = CASE WHEN $2 = 'verified' THEN now() ELSE NULL END
        WHERE id = $1`,
      [uid, status],
    )

    // A host who is no longer verified must not keep listings in front of guests
    // — that is the whole point of the gate. Flagged with a dedicated column so
    // re-verifying restores exactly these and nothing else; sharing the account
    // block's unpublished_by_admin flag would let unblocking republish listings
    // that verification had hidden.
    if (revokesListingPrivileges(previousStatus, status)) {
      const hid = await client.query(
        `UPDATE listings SET is_published = false, unpublished_by_verification = true
          WHERE host_id = $1 AND is_published = true`,
        [uid],
      )
      listingsHidden = hid.rowCount ?? 0
    } else if (normalizeVerificationStatus(status) === 'verified') {
      // Restore only what verification hid, and only if the account is not ALSO
      // blocked — the two reasons compose, so a listing hidden for both stays
      // hidden until both clear.
      const shown = await client.query(
        `UPDATE listings SET is_published = true, unpublished_by_verification = false
          WHERE host_id = $1 AND unpublished_by_verification = true
            AND COALESCE(unpublished_by_admin, false) = false`,
        [uid],
      )
      listingsRestored = shown.rowCount ?? 0
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
  // Reopening is an internal correction — don't tell the user their ID "changed".
  // It can still have unpublished their listings, so that is reported separately.
  if (action === 'pending') {
    if (listingsHidden > 0) {
      await createNotification(
        uid, 'verification', 'Listings paused',
        `We're re-checking your identity documents. ${listingsHidden} listing${listingsHidden === 1 ? ' is' : 's are'} paused until that's done.`,
        '/host'
      )
    }
    return
  }
  const verified = action === 'verify'
  // Say what happened to their listings — a host whose listings vanished with no
  // explanation will open a support ticket.
  const listingNote = verified
    ? (listingsRestored > 0
        ? ` ${listingsRestored} listing${listingsRestored === 1 ? '' : 's'} ${listingsRestored === 1 ? 'is' : 'are'} live again.`
        : '')
    : (listingsHidden > 0
        ? ` ${listingsHidden} listing${listingsHidden === 1 ? '' : 's'} ${listingsHidden === 1 ? 'has' : 'have'} been paused until you're verified.`
        : '')
  await createNotification(
    uid, 'verification',
    verified ? 'Identity verified' : 'Identity check update',
    (verified
      ? 'Your ID was verified — your account is now verified and you can publish listings.'
      : (note ? `We could not verify your ID: ${note}` : 'We could not verify your ID. Please re-submit a clear photo.')
    ) + listingNote,
    verified ? '/host' : '/verify-id'
  )
}

// ---- Wishlists --------------------------------------------------------------

/** The user's saved listings (same row shape as getListings, incl. a primary image_url). */
export async function getWishlistListings(userId: string): Promise<Listing[]> {
  if (!isUuid(userId)) return []
  const { rows } = await pool.query(
    `SELECT ${LISTING_COLS},
            (SELECT url FROM listing_images li WHERE li.listing_id = l.id ORDER BY li."order" LIMIT 1) AS image_url
       FROM saved_listings w JOIN listings l ON l.id = w.listing_id
      WHERE w.user_id = $1
      ORDER BY w.created_at DESC`,
    [userId]
  )
  return rows as Listing[]
}

/** Listing ids the user has saved. */
export async function getWishlistIds(userId: string): Promise<string[]> {
  if (!isUuid(userId)) return []
  const { rows } = await pool.query(
    `SELECT listing_id FROM saved_listings WHERE user_id = $1`,
    [userId]
  )
  return rows.map((r) => r.listing_id as string)
}

/** Toggle a listing in the user's wishlist. Insert → {saved:true}; existing → delete → {saved:false}. */
export async function toggleWishlist(userId: string, listingId: string): Promise<{ saved: boolean }> {
  if (!isUuid(userId) || !isUuid(listingId)) throw new Error('Invalid id')
  const del = await pool.query(
    `DELETE FROM saved_listings WHERE user_id = $1 AND listing_id = $2`,
    [userId, listingId]
  )
  if (del.rowCount && del.rowCount > 0) return { saved: false }
  await pool.query(
    `INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2)
     ON CONFLICT (user_id, listing_id) DO NOTHING`,
    [userId, listingId]
  )
  return { saved: true }
}

// ---- User profile -----------------------------------------------------------

/** Update mutable profile fields (full_name / avatar_url). No-op if nothing provided. */
export async function updateUserProfile(
  userId: string,
  fields: { full_name?: string; avatar_url?: string }
): Promise<void> {
  if (!isUuid(userId)) throw new Error('Invalid id')
  // A display name is shown to the other party in every thread, so it's a way to
  // publish a number without ever typing it into chat.
  if (fields.full_name !== undefined) await guardContent(userId, fields.full_name ?? '', 'profile')
  const sets: string[] = []
  const params: unknown[] = [userId]
  if (fields.full_name !== undefined) { params.push(fields.full_name); sets.push(`full_name = $${params.length}`) }
  if (fields.avatar_url !== undefined) { params.push(fields.avatar_url); sets.push(`avatar_url = $${params.length}`) }
  if (!sets.length) return
  await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, params)
}

// ---- Host: listings & incoming reservations ---------------------------------

/** Listings owned by a host. */
/** A host's own listings — raw prices, plus guest_* for "guests pay X". */
export async function getHostListings(hostId: string): Promise<Listing[]> {
  if (!isUuid(hostId)) return []
  const { rows } = await pool.query(
    `SELECT ${LISTING_COLS_HOST},
            (SELECT url FROM listing_images li WHERE li.listing_id = l.id ORDER BY li."order" LIMIT 1) AS image_url
       FROM listings l
      WHERE l.host_id = $1
      ORDER BY l.created_at DESC`,
    [hostId]
  )
  return rows as Listing[]
}

/** Reservations on a host's listings, newest first, with the guest name + listing title. */
export async function getHostBookings(
  hostId: string
): Promise<Array<Booking & { guest_name: string | null; listing_title: string | null }>> {
  if (!isUuid(hostId)) return []
  const { rows } = await pool.query(
    // Host-only, so it also carries host_payout — the raw amount this host is
    // owed, which the shared projection deliberately withholds from guests.
    `SELECT ${BOOKING_COLS}, b.total_price::float8 AS host_payout,
            gu.full_name AS guest_name, l.title AS listing_title
       FROM bookings b
       JOIN listings l ON l.id = b.listing_id
       LEFT JOIN users gu ON gu.id = b.user_id
      WHERE l.host_id = $1
      ORDER BY b.created_at DESC`,
    [hostId]
  )
  return rows as Array<Booking & { guest_name: string | null; listing_title: string | null }>
}

// ---- Host: public profile page (/hosts/[id]) --------------------------------

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

export interface HostProfile {
  profile: PublicUser & { bio: string | null; verification_status: string }
  listings: HostListingCard[]
  reviews: HostReviewCard[]
  avgRating: number | null
  totalReviews: number
}

/** Everything the public /hosts/[id] page needs, read straight from the local
 *  stack (no Supabase). Returns null when the user doesn't exist so the page
 *  can render notFound(). */
export async function getHostProfile(hostId: string): Promise<HostProfile | null> {
  if (!isUuid(hostId)) return null
  const user = await getUserById(hostId)
  if (!user) return null
  // Read the source of truth, not the submission log — so this badge, the listing
  // pages and the mobile apps all agree.
  const { rows: vrows } = await pool.query(
    `SELECT COALESCE(verification_status, 'unverified') AS status FROM users WHERE id = $1`,
    [hostId],
  )
  const verificationStatus = String(vrows[0]?.status ?? 'unverified')

  const [{ rows: lrows }, { rows: rvrows }] = await Promise.all([
    pool.query(
      // A public host profile — guests browse it, so prices carry the commission.
      `SELECT l.id, l.title, l.location,
              ${sqlWithCommission('l.price_per_night')}::float8 AS price_per_night,
              COALESCE(l.currency, 'EGP') AS currency,
              (SELECT url FROM listing_images li WHERE li.listing_id = l.id
                ORDER BY li."order" LIMIT 1) AS image_url,
              agg.avg_rating::float8 AS rating,
              COALESCE(agg.cnt, 0)::int AS rating_count
         FROM listings l
         LEFT JOIN (
           SELECT listing_id, AVG(rating) AS avg_rating, COUNT(*) AS cnt
             FROM reviews GROUP BY listing_id
         ) agg ON agg.listing_id = l.id
        WHERE l.host_id = $1
        ORDER BY l.created_at DESC
        LIMIT 12`,
      [hostId]
    ),
    pool.query(
      `SELECT rv.id, rv.rating, rv.comment,
              to_char(rv.created_at, 'YYYY-MM-DD') AS created_at,
              l.title AS listing_title,
              u.full_name AS reviewer_name, u.avatar_url AS reviewer_avatar
         FROM reviews rv
         JOIN listings l ON l.id = rv.listing_id
         LEFT JOIN users u ON u.id = rv.reviewer_id
        WHERE l.host_id = $1
        ORDER BY rv.created_at DESC
        LIMIT 8`,
      [hostId]
    ),
  ])

  const listings = lrows as HostListingCard[]
  const rated = listings.filter((l) => l.rating != null && l.rating_count > 0)
  const avgRating = rated.length
    ? rated.reduce((s, l) => s + (l.rating ?? 0), 0) / rated.length
    : null
  const totalReviews = listings.reduce((s, l) => s + (l.rating_count ?? 0), 0)

  return {
    profile: { ...user, bio: null, verification_status: verificationStatus },
    listings,
    reviews: rvrows as HostReviewCard[],
    avgRating,
    totalReviews,
  }
}

// ---- Host: create a listing -------------------------------------------------

export interface CreateListingInput {
  title: string
  description?: string
  location?: string
  country?: string
  lat?: number
  lng?: number
  price_per_night: number
  weekend_price?: number
  weekend_days?: number[]
  currency?: string
  bedrooms?: number
  beds?: number
  bathrooms?: number
  max_guests?: number
  property_type?: string
  /** Curated browse area — one of REGION_VALUES (optional). */
  region?: string
  /** Resort picked from the catalog. Wins over resort_name. */
  resort_id?: string | null
  /** Free text the host typed via "Other". Queued for admin review. */
  resort_name?: string | null
  /** Amenity names (optional); validated exactly like the edit flow. */
  amenities?: string[]
  images?: string[]
  /** Proof-of-ownership image the admin reviews before publishing (optional). */
  ownership_doc?: string
}

/** Create a listing owned by [hostId], plus any provided images. */
export async function createListing(hostId: string, data: CreateListingInput): Promise<Listing> {
  if (!isUuid(hostId)) throw new Error('Invalid host')
  const title = String(data.title || '').trim()
  if (!title) throw new Error('Title is required')
  const price = Number(data.price_per_night)
  if (!Number.isFinite(price) || price <= 0) throw new Error('A valid price per night is required')
  // A number in the listing copy reaches every guest at once, so the same guard
  // the chat runs applies to the fields a host writes freely.
  await guardContent(hostId, title, 'listing')
  await guardContent(hostId, String(data.description ?? ''), 'listing')
  const nn = (v: unknown, d: number) => {
    const n = Math.floor(Number(v))
    return Number.isFinite(n) && n >= 0 ? n : d
  }
  const fin = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const weekendPrice = fin(data.weekend_price)
  const weekendDays = Array.isArray(data.weekend_days)
    ? data.weekend_days.map((d) => Math.floor(Number(d))).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : []
  // The ownership doc is optional at creation (hosts can also attach it later
  // from the editor or the dashboard) but is validated when it is supplied.
  const ownershipDoc = String(data.ownership_doc ?? '').trim()
    ? normalizeOwnershipDoc(data.ownership_doc)
    : null
  // Region + amenities share the edit flow's validators, so the create and edit
  // forms can never disagree about what a valid value is.
  const region = data.region === undefined || data.region === null || data.region === ''
    ? null
    : normalizeRegion(data.region)
  const amenities = data.amenities === undefined ? [] : normalizeAmenities(data.amenities)
  // The resort decides the region — that is the point of a resort belonging to one.
  // An unknown typed name is kept as free text AND queued for /ops.
  const resort = await resolveResortSelection({
    resortId: data.resort_id,
    resortName: data.resort_name,
    region,
    userId: hostId,
  })
  const { rows } = await pool.query(
    // New listings enter moderation: not published + approval_status 'pending'.
    // An admin approves them in /ops, which flips is_published=true and notifies
    // the host. Until then they never appear in public search (see getListings).
    `INSERT INTO listings
       (host_id, title, description, location, country, lat, lng, price_per_night,
        weekend_price, weekend_days, currency,
        bedrooms, beds, bathrooms, max_guests, property_type, region, amenities,
        is_published, approval_status, ownership_doc, resort_id, resort_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, false, 'pending', $19, $20, $21)
     RETURNING id`,
    [
      hostId, title, data.description ?? null, data.location ?? null, data.country ?? null,
      fin(data.lat), fin(data.lng), price,
      weekendPrice && weekendPrice > 0 ? weekendPrice : null,
      weekendPrice && weekendPrice > 0 && weekendDays.length ? weekendDays : null,
      data.currency || 'EGP',
      nn(data.bedrooms, 1), nn(data.beds, 1), nn(data.bathrooms, 1), nn(data.max_guests, 2),
      data.property_type ?? null, resort.region, amenities, ownershipDoc,
      resort.resort_id, resort.resort_name,
    ]
  )
  const newId = rows[0].id as string
  const images = Array.isArray(data.images) ? data.images.filter(isImageSrc) : []
  for (let i = 0; i < images.length; i++) {
    await pool.query(
      `INSERT INTO listing_images (listing_id, url, "order") VALUES ($1, $2, $3)`,
      [newId, images[i].trim(), i]
    )
  }
  // asHost: this is the host's own listing coming straight back to them, and the
  // editor saves these values again — the guest projection would inflate the price
  // by the commission on every round trip.
  const listing = await getListingById(newId, { asHost: true })
  if (!listing) throw new Error('Could not create listing')
  return listing
}

// ---- Full listing edit → automatic re-review (W3) ---------------------------
// A host can edit EVERY aspect of their own listing — details, photos, pricing —
// from /host/[id]/edit. Two invariants hold, matching quickin-backend's
// updateListingDetails so web and mobile behave identically:
//   1. Ownership is enforced inside the SQL (`WHERE id = $1 AND host_id = $2`).
//      A host id is never taken from the request body. No row matched → null →
//      the route answers 404.
//   2. The re-review flip lives in the SAME statement as the edit, so it can't be
//      skipped — exactly like setListingOwnershipDoc.

/** Every field a host may edit through PATCH /api/local/listings/:id. `images` is
 *  the photo set (listing_images rows), not a listings column; `ownership_doc` is
 *  applied by setListingOwnershipDoc, which already re-queues on its own. */
export const EDITABLE_LISTING_FIELDS = [
  // Moderation-relevant — what an admin actually looks at.
  'title', 'description', 'location', 'country', 'region', 'resort', 'lat', 'lng',
  'property_type', 'max_guests', 'bedrooms', 'beds', 'bathrooms', 'amenities',
  'ownership_doc', 'images',
  // Commercial — what the host tunes day to day.
  'price_per_night', 'weekend_price', 'weekend_days', 'currency',
] as const
export type ListingEditField = (typeof EDITABLE_LISTING_FIELDS)[number]

/**
 * THE re-review switch — the ONE place that decides which host edits send a
 * listing back to the admin queue (approval_status='pending' + is_published=false).
 *
 * Product decision, as specified: EVERY edit re-reviews, including price and
 * weekend pricing — so a host nudging their nightly rate takes their own listing
 * offline until an admin approves it. To move to the usual split (moderation
 * fields re-review, commercial fields save live) replace the value below with the
 * moderation subset, e.g.
 *   export const REVIEW_TRIGGERING_FIELDS: readonly ListingEditField[] =
 *     ['title','description','location','country','region','lat','lng',
 *      'property_type','max_guests','bedrooms','beds','bathrooms','amenities',
 *      'ownership_doc','images']
 * Nothing else in the codebase needs to change.
 */
export const REVIEW_TRIGGERING_FIELDS: readonly ListingEditField[] = EDITABLE_LISTING_FIELDS

/** Does this set of edited fields put the listing back in front of an admin? */
export function requeuesForReview(fields: readonly string[]): boolean {
  return fields.some((f) => (REVIEW_TRIGGERING_FIELDS as readonly string[]).includes(f))
}

/** The SET fragment every re-queueing edit appends — identical to the ownership-doc flow. */
const REQUEUE_SET = `approval_status = 'pending', is_published = false`

/** Max photos on a listing — the cap the web uploader (MAX_WEB_LISTING_PHOTOS)
 *  and quickin-backend's MAX_LISTING_PHOTOS both enforce. */
const MAX_LISTING_PHOTOS = 10

/** Something the host can fix in the form (→ HTTP 400), as opposed to a real
 *  failure (→ 500). A named class rather than message-sniffing, so adding a
 *  validation rule can't silently start answering 500. Mirrors
 *  quickin-backend's ListingInputError and the web's HostApplicationError. */
export class ListingInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ListingInputError'
  }
}

/** Was this thrown by one of the listing validators below? (`name` is checked too
 *  so it still works if the module is instantiated twice in a bundle.) */
export function isListingInputError(err: unknown): err is Error {
  // A blocked contact detail counts: it is the host's input to fix, not a
  // server fault, so the route answers 400 with the guard's wording.
  if (isContactBlockedError(err)) return true
  return err instanceof ListingInputError || (err instanceof Error && err.name === 'ListingInputError')
}

/** Non-blank text, else a per-field error (the form highlights the input). */
function assertListingText(v: unknown, label: string, max: number): string {
  const s = String(v ?? '').trim()
  if (!s) throw new ListingInputError(`${label} is required`)
  return s.slice(0, max)
}

/** A whole number >= min, else a per-field error. */
function assertListingInt(v: unknown, label: string, min: number): number {
  const n = Number(v)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min) {
    throw new ListingInputError(`${label} must be a whole number of at least ${min}`)
  }
  return n
}

/** A coordinate inside its valid range, or null to clear the pin. */
function assertCoord(v: unknown, label: string, limit: number): number | null {
  if (v === null || v === '' || v === undefined) return null
  const n = Number(v)
  if (!Number.isFinite(n) || Math.abs(n) > limit) {
    throw new ListingInputError(`${label} must be between -${limit} and ${limit}`)
  }
  return n
}

/** Canonical (English) property type for any casing the clients send. Empty
 *  clears it; an unknown value is rejected rather than silently stored. */
function normalizePropertyType(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const match = PROPERTY_TYPE_VALUES.find((p) => p.toLowerCase() === s.toLowerCase())
  if (!match) throw new ListingInputError(`Choose a property type: ${PROPERTY_TYPE_VALUES.join(', ')}`)
  return match
}

/** Canonical region — one of REGION_VALUES, the same curated areas the mobile
 *  apps and the search chips use. Empty clears it. */
function normalizeRegion(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const match = REGION_VALUES.find((r) => r.toLowerCase() === s.toLowerCase())
  if (!match) throw new ListingInputError(`Choose an area: ${REGION_VALUES.join(', ')}`)
  return match
}

/** An array of amenity names — trimmed, deduped, canonical casing where the
 *  catalog knows the value (legacy names from other surfaces are kept as-is). */
function normalizeAmenities(v: unknown): string[] {
  if (!Array.isArray(v)) throw new ListingInputError('Amenities must be a list')
  const out: string[] = []
  for (const a of v) {
    if (typeof a !== 'string') throw new ListingInputError('Amenities must be a list of names')
    const s = canonicalAmenity(a).slice(0, MAX_AMENITY_CHARS)
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s)
  }
  if (out.length > MAX_AMENITIES) throw new ListingInputError(`You can pick at most ${MAX_AMENITIES} amenities`)
  return out
}

/** The full replacement photo set (array order = display order, so the first
 *  entry is the cover). Every entry is validated like any other image we accept —
 *  a bad one is reported, never silently dropped. */
function normalizePhotoSet(v: unknown): string[] {
  if (!Array.isArray(v)) throw new ListingInputError('Photos must be a list')
  if (v.length > MAX_LISTING_PHOTOS) {
    throw new ListingInputError(`A listing can have at most ${MAX_LISTING_PHOTOS} photos`)
  }
  return v.map((u) => {
    if (!isImageSrc(u)) throw new ListingInputError('Each photo must be an image')
    const s = u.trim()
    if (s.length > OWNERSHIP_DOC_MAX_CHARS) throw new ListingInputError('That image is too large')
    return s
  })
}

/**
 * Host edit: update a listing the caller OWNS — every field the create form has,
 * plus the photo set (add / delete / reorder / set cover). Ownership is enforced
 * in SQL (`host_id = $2`), so a non-owner's update matches no row and returns
 * null (the route maps that to 404). Only the keys actually present are written;
 * omitted keys keep their current value.
 *
 * Any edit touching a REVIEW_TRIGGERING_FIELD (today: all of them) sends the
 * listing back to the admin queue — approval_status='pending', is_published=false
 * — in the SAME statement as the edit, so nothing can bypass it. Fields and
 * photos are written in one transaction: a rejected photo can't leave the listing
 * half-saved. An empty patch is a no-op (it still verifies ownership), which is
 * what an ownership-doc-only PATCH sends. Returns the fresh listing.
 */
export async function updateListing(
  id: string,
  hostId: string,
  data: {
    title?: unknown
    description?: unknown
    location?: unknown
    country?: unknown
    region?: unknown
  resort_id?: unknown
  resort_name?: unknown
    price_per_night?: unknown
    weekend_price?: unknown
    currency?: unknown
    bedrooms?: unknown
    beds?: unknown
    bathrooms?: unknown
    max_guests?: unknown
    property_type?: unknown
    amenities?: unknown
    lat?: unknown
    lng?: unknown
    weekend_days?: unknown
    /** Full replacement photo set (first = cover). Omit to leave photos alone. */
    images?: unknown
  }
): Promise<Listing | null> {
  if (!isUuid(id) || !isUuid(hostId)) return null

  const sets: string[] = []
  const vals: unknown[] = [id, hostId]
  const touched: ListingEditField[] = []
  // Column name === patch key for every scalar field, so one helper covers them all.
  const put = (field: Exclude<ListingEditField, 'images' | 'ownership_doc'>, val: unknown) => {
    vals.push(val)
    sets.push(`${field} = $${vals.length}`)
    touched.push(field)
  }

  // --- Moderation-relevant fields ---
  // Guarded on edit as well as on create — otherwise a clean listing could be
  // published and then quietly edited to carry a number.
  if (data.title !== undefined) {
    const t = assertListingText(data.title, 'Title', 200)
    await guardContent(hostId, t, 'listing', { type: 'listing', id })
    put('title', t)
  }
  if (data.description !== undefined) {
    const d = String(data.description ?? '').trim().slice(0, 5000) || null
    await guardContent(hostId, d ?? '', 'listing', { type: 'listing', id })
    put('description', d)
  }
  if (data.location !== undefined) put('location', String(data.location ?? '').trim().slice(0, 200) || null)
  if (data.country !== undefined) put('country', String(data.country ?? '').trim().slice(0, 100) || null)
  // Resort is THREE columns (resort_id, resort_name, region) driven by one logical
  // edit, so it cannot go through put(), which maps one field to one column. When a
  // resort is chosen its region wins, so the standalone region edit is skipped.
  const resortEdited = data.resort_id !== undefined || data.resort_name !== undefined
  if (data.region !== undefined && !resortEdited) put('region', normalizeRegion(data.region))
  if (resortEdited) {
    const sel = await resolveResortSelection({
      resortId: data.resort_id === undefined ? null : String(data.resort_id ?? '') || null,
      resortName: data.resort_name === undefined ? null : (data.resort_name as string | null),
      region: data.region === undefined ? null : normalizeRegion(data.region),
      userId: hostId,
    })
    vals.push(sel.resort_id); sets.push(`resort_id = $${vals.length}::uuid`)
    vals.push(sel.resort_name); sets.push(`resort_name = $${vals.length}`)
    vals.push(sel.region); sets.push(`region = $${vals.length}`)
    touched.push('resort')
  }
  // Map pin — the edit form has the same place-search + pin picker as create.
  if (data.lat !== undefined) put('lat', assertCoord(data.lat, 'Latitude', 90))
  if (data.lng !== undefined) put('lng', assertCoord(data.lng, 'Longitude', 180))
  if (data.property_type !== undefined) put('property_type', normalizePropertyType(data.property_type))
  // max_guests keeps createListing's floor of 1 — a 0-guest listing can't be booked.
  if (data.max_guests !== undefined) put('max_guests', assertListingInt(data.max_guests, 'Guests', 1))
  if (data.bedrooms !== undefined) put('bedrooms', assertListingInt(data.bedrooms, 'Bedrooms', 0))
  if (data.beds !== undefined) put('beds', assertListingInt(data.beds, 'Beds', 0))
  if (data.bathrooms !== undefined) put('bathrooms', assertListingInt(data.bathrooms, 'Bathrooms', 0))
  if (data.amenities !== undefined) put('amenities', normalizeAmenities(data.amenities))

  // --- Commercial fields (same re-review rule today — see REVIEW_TRIGGERING_FIELDS) ---
  if (data.price_per_night !== undefined) {
    const price = Number(data.price_per_night)
    if (!Number.isFinite(price) || price <= 0) throw new ListingInputError('Price must be greater than 0')
    put('price_per_night', price)
  }
  if (data.weekend_price !== undefined) {
    const wp = Number(data.weekend_price)
    put('weekend_price', Number.isFinite(wp) && wp > 0 ? wp : null)
  }
  if (data.currency !== undefined) put('currency', String(data.currency ?? '').trim() || 'USD')
  if (data.weekend_days !== undefined) {
    const days = Array.isArray(data.weekend_days)
      ? data.weekend_days
          .map((d) => Math.floor(Number(d)))
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : []
    put('weekend_days', days.length ? days : null)
  }

  // --- Photos (listing_images rows, replaced wholesale when supplied) ---
  // null = not sent (leave photos alone); [] = sent empty (clear them).
  const nextImages = data.images === undefined ? null : normalizePhotoSet(data.images)
  if (nextImages !== null) touched.push('images')

  // Nothing to change → just confirm ownership and echo the current row. This is
  // the ownership-doc-only PATCH (the route applies the document separately).
  if (!touched.length) {
    const owned = await pool.query(`SELECT id FROM listings WHERE id = $1 AND host_id = $2`, [id, hostId])
    return owned.rows[0] ? getListingById(id, { asHost: true }) : null
  }

  const requeue = requeuesForReview(touched)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Ownership + the re-review flip in ONE statement — nothing can bypass it.
    // `sets` is empty on a photos-only edit, which still re-queues today; if the
    // switch above ever stops covering photos there is nothing to SET, so fall
    // back to a plain ownership check (an empty SET list isn't valid SQL).
    const setList = [...sets, ...(requeue ? [REQUEUE_SET] : [])]
    const { rowCount } = setList.length
      ? await client.query(
          `UPDATE listings SET ${setList.join(', ')} WHERE id = $1 AND host_id = $2`,
          vals
        )
      : await client.query(`SELECT 1 FROM listings WHERE id = $1 AND host_id = $2 FOR UPDATE`, [id, hostId])
    if (!rowCount) {
      await client.query('ROLLBACK')
      return null // not found or not owned by this host
    }
    if (nextImages !== null) {
      // Array order becomes the stored "order", so images[0] is the cover.
      await client.query(`DELETE FROM listing_images WHERE listing_id = $1`, [id])
      for (let i = 0; i < nextImages.length; i++) {
        await client.query(
          `INSERT INTO listing_images (listing_id, url, "order") VALUES ($1, $2, $3)`,
          [id, nextImages[i], i]
        )
      }
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
  return getListingById(id, { asHost: true })
}

/**
 * Host uploads / replaces the proof-of-ownership document on a listing they OWN
 * and the listing goes back into the moderation queue: approval_status='pending'
 * and unpublished until an admin re-approves it in /ops. Ownership is enforced in
 * SQL (`host_id = $2`), so someone else's listing matches no row and returns null
 * (the route maps that to 404). Mirrors quickin-backend's setListingOwnershipDoc
 * so web and mobile behave identically.
 */
export async function setListingOwnershipDoc(
  id: string,
  hostId: string,
  doc: string
): Promise<Listing | null> {
  if (!isUuid(id) || !isUuid(hostId)) return null
  const value = normalizeOwnershipDoc(doc)
  const { rowCount } = await pool.query(
    `UPDATE listings SET ownership_doc = $3, approval_status = 'pending', is_published = false
      WHERE id = $1 AND host_id = $2`,
    [id, hostId, value]
  )
  if (!rowCount) return null
  return getListingById(id, { asHost: true })
}

/** Whether one of the host's OWN listings already has an ownership document on
 *  file. The document itself is admin-only (it never leaves /ops), so the host
 *  surfaces only get this flag to label the upload field. */
export async function hostListingHasOwnershipDoc(id: string, hostId: string): Promise<boolean> {
  if (!isUuid(id) || !isUuid(hostId)) return false
  const { rows } = await pool.query(
    `SELECT (ownership_doc IS NOT NULL AND ownership_doc <> '') AS has_doc
       FROM listings WHERE id = $1 AND host_id = $2`,
    [id, hostId]
  )
  return Boolean(rows[0]?.has_doc)
}

// ---- Admin: full ops dashboard (key-gated) ----------------------------------

export interface AdminStats {
  users: number
  hosts: number
  verified: number
  listings: number
  published: number
  bookings: number
  pending_bookings: number
  confirmed_bookings: number
  paid_bookings: number
  pending_applications: number
  pending_verifications: number
  gross_paid: number
  /** The platform's cut — guest price minus the host's raw price — summed over
   *  bookings that were actually collected. Refunded rows drop out with PAID_SQL. */
  commission_paid: number
  /** The same cut on bookings still expected to be collected: live reservations
   *  that have not been paid yet. Expected, not earned. */
  commission_pending: number
  /** F3/F4 — the "needs attention" counts behind the alert tiles and the alert centre. */
  bookings_today: number
  pending_listings: number
  disputed_payments: number
  /** Transfer screenshots waiting for an accept/reject. */
  pending_payments: number
  pending_resort_submissions: number
  open_reports: number
  /** Users with unreviewed content-guard blocks (F5) — the Moderation queue. */
  flagged_users: number
  /** Guest disputes still open or in review — the Disputes queue. */
  open_disputes: number
  /** When the oldest item in each queue arrived, so an alert can show how long it has waited. */
  oldest_verification: string | null
  oldest_application: string | null
  oldest_listing: string | null
  oldest_report: string | null
  oldest_payment: string | null
  oldest_flag: string | null
  oldest_dispute: string | null
}

/** Top-line counts for the admin dashboard, plus the alert queues (F3/F4).
 *  gross_paid = SUM(total_price) of paid bookings — the HOST side, before the
 *  markup; commission_paid is the platform's cut on the same population, so
 *  gross_paid + commission_paid is what guests actually handed over. */
export async function adminStats(): Promise<AdminStats> {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM users)::int AS users,
       (SELECT COUNT(*) FROM users WHERE is_host = true)::int AS hosts,
       -- users.verification_status is the source of truth (E2/E3), not the
       -- submission log — otherwise this tile disagrees with every badge the
       -- moment someone is verified without a matching id_verifications row.
       (SELECT COUNT(*) FROM users WHERE verification_status = 'verified')::int AS verified,
       (SELECT COUNT(*) FROM listings)::int AS listings,
       (SELECT COUNT(*) FROM listings WHERE is_published = true)::int AS published,
       (SELECT COUNT(*) FROM bookings)::int AS bookings,
       (SELECT COUNT(*) FROM bookings WHERE status = 'pending')::int AS pending_bookings,
       (SELECT COUNT(*) FROM bookings WHERE status = 'confirmed')::int AS confirmed_bookings,
       -- payment_status, NOT "paid_at IS NOT NULL": a refund CLEARS paid_at, so that
       -- predicate silently under-counted. Same rule as analytics-core's PAID_SQL.
       (SELECT COUNT(*) FROM bookings WHERE COALESCE(payment_status, 'unpaid') = 'paid')::int AS paid_bookings,
       (SELECT COUNT(*) FROM host_applications WHERE status = 'pending')::int AS pending_applications,
       (SELECT COUNT(*) FROM id_verifications WHERE status = 'pending')::int AS pending_verifications,
       COALESCE((SELECT SUM(total_price) FROM bookings WHERE COALESCE(payment_status, 'unpaid') = 'paid'), 0)::float8 AS gross_paid,
       -- The platform's margin. Because the commission is a MARKUP, it is the gap
       -- between what the guest was charged and the host's raw price — not a
       -- percentage of total_price, which would ignore the round-up to 10 EGP.
       -- Each booking prices at ITS OWN snapshot, so changing the rate never
       -- restates what has already been earned.
       COALESCE((SELECT SUM(${COMMISSION_AMOUNT_SQL}) FROM bookings b
                  WHERE COALESCE(b.payment_status, 'unpaid') = 'paid'), 0)::float8 AS commission_paid,
       -- Expected, not earned: live reservations with the money still outstanding.
       -- Cancelled/rejected bookings and refunded ones are excluded — that money is
       -- never arriving.
       COALESCE((SELECT SUM(${COMMISSION_AMOUNT_SQL}) FROM bookings b
                  WHERE b.status IN ('pending', 'confirmed')
                    AND COALESCE(b.payment_status, 'unpaid') NOT IN ('paid', 'refunded', 'voided')), 0)::float8 AS commission_pending,
       -- F3/F4: the queues that need someone's attention. These drive both the
       -- dashboard's alert tiles and the alert centre, so they live in the same single
       -- query rather than fanning out per poll.
       (SELECT COUNT(*) FROM bookings WHERE created_at >= date_trunc('day', now()))::int AS bookings_today,
       (SELECT COUNT(*) FROM listings WHERE COALESCE(approval_status, 'approved') = 'pending')::int AS pending_listings,
       -- Only the LATEST proof per booking counts — an old disputed proof superseded by
       -- a fresh one is not an open dispute. Mirrors adminListDisputes.
       (SELECT COUNT(*) FROM payment_proofs pp
         WHERE pp.status = 'disputed'
           AND pp.id = (SELECT id FROM payment_proofs p2 WHERE p2.booking_id = pp.booking_id
                         ORDER BY p2.submitted_at DESC LIMIT 1))::int AS disputed_payments,
       -- Transfers waiting for a first decision. Nothing counted these before, so a
       -- guest could pay and no one would ever be told.
       (SELECT COUNT(*) FROM payment_proofs pp
         WHERE pp.status = 'submitted'
           AND pp.id = (SELECT id FROM payment_proofs p2 WHERE p2.booking_id = pp.booking_id
                         ORDER BY p2.submitted_at DESC LIMIT 1))::int AS pending_payments,
       (SELECT COUNT(*) FROM resort_submissions WHERE status = 'pending')::int AS pending_resort_submissions,
       (SELECT COUNT(*) FROM reports WHERE status = 'open')::int AS open_reports,
       -- How long the oldest item in each queue has waited, so the alert centre can say
       -- "3 days" rather than just a number.
       (SELECT to_char(MIN(submitted_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM id_verifications WHERE status = 'pending') AS oldest_verification,
       (SELECT to_char(MIN(submitted_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM host_applications WHERE status = 'pending') AS oldest_application,
       (SELECT to_char(MIN(created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM listings WHERE COALESCE(approval_status, 'approved') = 'pending') AS oldest_listing,
       (SELECT to_char(MIN(created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM reports WHERE status = 'open') AS oldest_report,
       (SELECT to_char(MIN(submitted_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM payment_proofs WHERE status = 'submitted') AS oldest_payment`
  )
  // The two newest queues are read through their own helpers rather than as
  // subqueries above, ON PURPOSE: a subquery against a table that doesn't exist
  // yet fails the WHOLE statement, which would take the dashboard and the alert
  // centre down on any database where migrate-policy-violations / migrate-disputes
  // hasn't run. Each helper answers 0 in that case, so the console degrades to
  // "nothing in this queue" instead of breaking.
  const [flagged_users, open_disputes, oldest_flag, oldest_dispute] = await Promise.all([
    countFlaggedUsers(),
    countOpenDisputes(),
    oldestFlaggedAt(),
    oldestOpenDisputeAt(),
  ])
  return { ...(rows[0] as AdminStats), flagged_users, open_disputes, oldest_flag, oldest_dispute }
}

/**
 * The history behind the Overview's number cards — one dense series per chartable
 * metric, for the card → graph panel.
 *
 * TWO round trips for all eight metrics, not two per metric: the per-bucket counts
 * are one UNION ALL and the baselines are another. The Overview already polls
 * `adminStats` every 30 seconds from every operator's browser, so a fan-out of
 * sixteen queries behind a chart nobody has clicked yet is exactly the load this
 * screen cannot afford. The page fetches this once per range instead, and switching
 * cards is then free — every series is already on the client.
 *
 * `baseline` is what makes a running total honest: rows dated before the window
 * start. Without it the 7-day view would draw the platform's entire user base as
 * having arrived in the last week.
 *
 * Injection surface: `metric` is validated against METRIC_IDS by the route, and the
 * only interpolated identifiers are the constant from/where/at fragments that
 * METRICS keys off it. Dates are $n placeholders.
 */
export async function adminStatTrends(
  range: RangeId,
  now: Date = new Date(),
): Promise<TrendPayload> {
  const spec = RANGES[range]
  const buckets = bucketsFor(range, now)
  const { from, toExclusive } = windowFor(range, now)

  // date_trunc's unit is a constant from RANGES ('day' | 'month'), never user text.
  const bucketOf = (at: string) => `to_char(date_trunc('${spec.granularity}', ${at}), 'YYYY-MM-DD')`
  const scoped = (m: MetricSpec, extra: string) =>
    `FROM ${m.from} WHERE ${m.where ? `${m.where} AND ` : ''}${extra}`

  const ids = Object.keys(METRICS) as MetricId[]

  const countsSql = ids
    .map((id) => {
      const m = METRICS[id]
      return `SELECT '${id}' AS metric, ${bucketOf(m.at)} AS bucket, COUNT(*)::int AS count
                ${scoped(m, `${m.at} >= $1::date AND ${m.at} < $2::date`)}
               GROUP BY 2`
    })
    .join('\nUNION ALL\n')

  // A row with a NULL date axis has no bucket to sit in, so it can never appear in
  // the series — count it in the baseline instead of losing it, or the final
  // running total would fall short of the card.
  const baselineSql = ids
    .map((id) => {
      const m = METRICS[id]
      return `SELECT '${id}' AS metric, COUNT(*)::int AS count
                ${scoped(m, `(${m.at} IS NULL OR ${m.at} < $1::date)`)}`
    })
    .join('\nUNION ALL\n')

  const [counts, baselines] = await Promise.all([
    pool.query(countsSql, [from, toExclusive]),
    pool.query(baselineSql, [from]),
  ])

  const baselineOf = new Map<string, number>()
  for (const r of baselines.rows) baselineOf.set(r.metric, Number(r.count) || 0)

  const rowsOf = new Map<string, Array<{ bucket: string; count: number }>>()
  for (const r of counts.rows) {
    const list = rowsOf.get(r.metric) ?? []
    list.push({ bucket: r.bucket, count: Number(r.count) || 0 })
    rowsOf.set(r.metric, list)
  }

  const series = {} as Record<MetricId, SeriesPoint[]>
  for (const id of ids) {
    series[id] = buildSeries(buckets, rowsOf.get(id) ?? [], baselineOf.get(id) ?? 0, METRICS[id].cumulative)
  }

  // The whole response, not just the series: /ops/page.tsx seeds the client with
  // this on the server and the API route returns it verbatim, so assembling it here
  // is what stops the two paths shipping subtly different shapes.
  return { range, granularity: spec.granularity, series, metrics: publicMetrics() }
}

export interface AdminUserRow {
  id: string
  email: string
  full_name: string | null
  is_host: boolean
  email_verified: boolean
  verification_status: string
  provider: string
  push_platform: string | null
  has_push: boolean
  device_platforms: string | null
  device_count: number
  created_at: string
  listing_count: number
  booking_count: number
  /** D3/D4 lifecycle — 'active' | 'blocked' | 'removed'. */
  account_status: string
  status_reason: string | null
  status_changed_at: string | null
  /** Free-text actor, `staff:<uuid>`. */
  status_changed_by: string | null
}

/** The projection the /ops users list renders. Kept as a fragment so the list and
 *  the profile header agree on what a user row looks like. `u` is the users alias. */
const ADMIN_USER_COLS = `
  u.id, u.email, u.full_name, COALESCE(u.is_host, false) AS is_host,
  COALESCE(u.email_verified, false) AS email_verified,
  COALESCE(
    (SELECT v.status FROM id_verifications v
      WHERE v.user_id = u.id ORDER BY v.submitted_at DESC LIMIT 1),
    'none'
  ) AS verification_status,
  u.provider,
  u.push_platform,
  (u.fcm_token IS NOT NULL OR EXISTS (SELECT 1 FROM device_tokens dt WHERE dt.user_id = u.id)) AS has_push,
  (SELECT string_agg(DISTINCT dt.platform, ', ') FROM device_tokens dt WHERE dt.user_id = u.id) AS device_platforms,
  (SELECT COUNT(*) FROM device_tokens dt WHERE dt.user_id = u.id)::int AS device_count,
  to_char(u.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
  (SELECT COUNT(*) FROM listings l WHERE l.host_id = u.id)::int AS listing_count,
  (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id)::int AS booking_count,
  COALESCE(u.account_status, 'active') AS account_status,
  u.status_reason,
  to_char(u.status_changed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS status_changed_at,
  u.status_changed_by
`

/** D1 — the /ops users directory: search, filter, sort and page through every
 *  account with their verification status, listing and booking counts.
 *
 *  `total` is the post-filter count, taken from the same query via COUNT(*) OVER ()
 *  so pagination needs no second round trip. Replaces the old unfiltered
 *  `adminListUsers()`, whose hardcoded LIMIT 300 silently hid older accounts. */
export async function adminSearchUsers(
  filter: UserListFilter,
): Promise<{ users: AdminUserRow[]; total: number }> {
  const { where, params } = buildUserListWhere(filter)
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  // ORDER BY comes from a whitelist (orderBySql), never from raw input.
  const { rows } = await pool.query(
    `SELECT ${ADMIN_USER_COLS}, COUNT(*) OVER ()::int AS total_count
       FROM users u
       ${whereSql}
      ORDER BY ${orderBySql(filter.sort)}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filter.limit, filter.offset],
  )
  // total_count rides on every row; strip it so callers get a clean AdminUserRow.
  const users = rows.map(({ total_count: _total, ...rest }) => rest) as AdminUserRow[]
  let total = rows.length ? Number((rows[0] as { total_count: number }).total_count) : 0
  // An empty page past the end carries no row to read the window count from, so
  // "0 of 0" would be reported for a non-empty table. Only then pay for a COUNT.
  if (!rows.length && filter.offset > 0) {
    const { rows: c } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM users u ${whereSql}`,
      params,
    )
    total = Number((c[0] as { total: number })?.total ?? 0)
  }
  return { users, total }
}

/** Admin: delete a booking and notify BOTH the guest and the host (in-app + push via the
 *  notifications fan-out). Used by the /ops Bookings tab. */
export async function adminDeleteBooking(id: string): Promise<void> {
  if (!isUuid(id)) throw new Error('Invalid booking')
  const { rows } = await pool.query(
    `SELECT b.user_id, l.host_id, COALESCE(l.title, 'your stay') AS title,
            -- The REAL column. A pending booking has none, so fall back to a short
            -- id fragment purely to name the reservation in this message; never
            -- synthesize a "QK-" code, which would not match the guest's pass and
            -- could not resolve at /stay/<code>.
            COALESCE(NULLIF(b.reservation_code, ''), upper(substr(b.id::text, 1, 8))) AS code
       FROM bookings b LEFT JOIN listings l ON l.id = b.listing_id WHERE b.id = $1`,
    [id]
  )
  const bk = rows[0] as { user_id: string; host_id: string | null; title: string; code: string } | undefined
  if (!bk) throw new Error('Booking not found')
  await pool.query(`DELETE FROM bookings WHERE id = $1`, [id])
  if (bk.user_id) {
    await createNotification(bk.user_id, 'booking', 'Reservation cancelled', `Your reservation ${bk.code} for ${bk.title} was cancelled by QuickIn support.`, '/reservations')
  }
  if (bk.host_id && bk.host_id !== bk.user_id) {
    await createNotification(bk.host_id, 'booking', 'Reservation removed', `Reservation ${bk.code} on ${bk.title} was removed by QuickIn support.`, '/host')
  }
}

export interface AdminListingRow {
  id: string
  title: string
  location: string | null
  region: string | null
  /** Set when the host picked from the catalog. */
  resort_id: string | null
  /** Set when the host typed their own via "Other" — this is what needs review
   *  before the listing is approved. Never set at the same time as resort_id. */
  resort_name: string | null
  /** Display name, whichever column it came from. */
  resort: string | null
  currency: string
  /** Commission-inclusive — what a guest is quoted. */
  price_per_night: number
  /** The host's raw price, before the platform commission. */
  host_price_per_night: number
  is_published: boolean
  approval_status: string
  host_id: string | null
  host_name: string | null
  created_at: string
  booking_count: number
  image: string | null
  /** True when the host attached a proof-of-ownership document. The document ITSELF
   *  is no longer shipped here — it comes one at a time from the audited
   *  /api/local/admin/documents/ownership/:id, which needs the `documents` module
   *  and records who opened it. This payload used to carry the inline base64 for
   *  every pending listing, to anyone holding `listings`, with no record at all. */
  has_ownership_doc: boolean
}

/** Newest-first listings (LIMIT 300) with host name, booking count and a primary image. */
export async function adminListListings(): Promise<AdminListingRow[]> {
  const { rows } = await pool.query(
    `SELECT l.id, l.title, l.location, COALESCE(l.currency, 'USD') AS currency,
            -- Staff see both: the price guests are quoted, and the host's own.
            ${sqlWithCommission('l.price_per_night')}::float8 AS price_per_night,
            l.price_per_night::float8 AS host_price_per_night,
            l.is_published,
            COALESCE(l.approval_status, 'approved') AS approval_status,
            (l.ownership_doc IS NOT NULL AND l.ownership_doc <> '') AS has_ownership_doc,
            l.host_id, u.full_name AS host_name, l.region,
            -- The approval flow needs to know whether the resort is a catalog entry
            -- or free text the host typed via "Other" (which needs review).
            l.resort_id, l.resort_name,
            COALESCE(r.name, l.resort_name) AS resort,
            to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            (SELECT COUNT(*) FROM bookings b WHERE b.listing_id = l.id)::int AS booking_count,
            (SELECT li.url FROM listing_images li WHERE li.listing_id = l.id
              ORDER BY li."order" LIMIT 1) AS image
       FROM listings l
       LEFT JOIN users u ON u.id = l.host_id
       LEFT JOIN resorts r ON r.id = l.resort_id
      ORDER BY l.created_at DESC
      LIMIT 300`
  )
  return rows as AdminListingRow[]
}

/** Publish / unpublish a listing.
 *  Publishing clears `unpublished_by_admin` — once an operator puts a listing back
 *  up by hand it is no longer "hidden by a block", so a later account restore must
 *  not claim it. Unpublishing deliberately does NOT set the flag: that would make a
 *  manual takedown get auto-republished when the host is unblocked. */
export async function adminSetListingPublished(id: string, published: boolean): Promise<void> {
  if (!isUuid(id)) throw new Error('Invalid listing')
  await pool.query(
    published
      ? `UPDATE listings SET is_published = true, unpublished_by_admin = false WHERE id = $1`
      : `UPDATE listings SET is_published = false WHERE id = $1`,
    [id],
  )
}

/**
 * Admin moderation decision on a pending listing. Approving flips approval_status
 * to 'approved' AND publishes it (so it appears in search); rejecting sets
 * 'rejected' and keeps it unpublished. Either way the host gets a notification —
 * which surfaces on both web and mobile (shared notifications table). Mirrors
 * reviewHostApplication.
 */
export async function adminSetListingApproval(
  id: string,
  action: 'approve' | 'reject',
  note?: string | null,
): Promise<void> {
  if (!isUuid(id)) throw new Error('Invalid listing')
  // Going live is the moment that matters: a listing can outlive the verification
  // that allowed it to be created, so publishing re-checks the host rather than
  // trusting the create-time gate. The backend project's setListingApproval has
  // always done this; /ops — where approvals actually happen — did not, which
  // meant the one path an operator uses could publish an unverified host.
  if (action === 'approve') {
    const { rows: hostRows } = await pool.query(
      `SELECT COALESCE(u.verification_status, 'unverified') AS status
         FROM listings l JOIN users u ON u.id = l.host_id
        WHERE l.id = $1`,
      [id],
    )
    const hostStatus = hostRows[0]?.status as string | undefined
    if (hostStatus && hostStatus !== 'verified') {
      throw new ListingInputError(
        `This host is not identity-verified (${hostStatus}). Approve their ID in Verifications first — ` +
        `a listing must not go live before its host is verified.`,
      )
    }
  }
  const status = action === 'approve' ? 'approved' : 'rejected'
  const { rows } = await pool.query(
    `UPDATE listings SET approval_status = $2, is_published = $3 WHERE id = $1
     RETURNING host_id, title`,
    [id, status, action === 'approve'],
  )
  const row = rows[0] as { host_id: string | null; title: string | null } | undefined
  if (!row) throw new Error('Listing not found')
  if (!row.host_id) return
  const title = row.title || 'Your listing'
  if (action === 'approve') {
    await createNotification(
      row.host_id, 'listing', 'Listing approved 🎉',
      `"${title}" was approved and is now live — guests can find and book it.`, '/host',
    )
  } else {
    await createNotification(
      row.host_id, 'listing', 'Listing needs changes',
      note ? `"${title}" wasn't approved: ${note}` : `"${title}" wasn't approved this time. Please review it and resubmit.`,
      '/host',
    )
  }
}

/** Delete a listing (FK cascades remove its images / bookings / reviews). */
export async function adminDeleteListing(id: string): Promise<void> {
  if (!isUuid(id)) throw new Error('Invalid listing')
  await pool.query(`DELETE FROM listings WHERE id = $1`, [id])
}

/** Admin: manually mark a user's email as verified (when OTP email can't reach them). */
export async function adminActivateUser(id: string): Promise<void> {
  if (!isUuid(id)) throw new Error('Invalid user')
  await pool.query(`UPDATE users SET email_verified = true WHERE id = $1`, [id])
  await createNotification(id, 'account', 'Account activated', 'Your email was verified by our team — you can use your account normally now.', '/account')
}

/** Admin: directly set (or clear) a user's host role. Unified account — a host is
 *  also a guest, so this only flips `is_host` (and keeps the legacy `role` in sync
 *  for the mobile backend). Notifies the user when they gain hosting. Note: the
 *  mobile apps cache is_host at login and only re-read it on a fresh sign-in, so a
 *  user promoted here sees host surfaces after signing out and back in. */
export async function adminSetHost(id: string, makeHost: boolean): Promise<void> {
  if (!isUuid(id)) throw new Error('Invalid user')
  await pool.query(`UPDATE users SET is_host = $2 WHERE id = $1`, [id, makeHost])
  // Legacy role column: absent on some dev DBs, so best-effort.
  try { await pool.query(`UPDATE users SET role = $2 WHERE id = $1`, [id, makeHost ? 'host' : 'guest']) } catch { /* role column not present */ }
  if (makeHost) {
    await createNotification(id, 'host', 'You are now a host!', 'Your account was upgraded to host — sign out and back in to start listing your space.', '/host')
  }
}

// ---- F4: abuse reports ------------------------------------------------------

export interface AdminReport {
  id: string
  reporter_id: string | null
  reporter_name: string | null
  reporter_email: string | null
  target_type: string
  target_id: string
  /** Who or what was reported, resolved to something readable. */
  target_label: string | null
  reason: string | null
  details: string | null
  status: string
  created_at: string
  resolved_at: string | null
}

/**
 * The abuse-report queue (F4).
 *
 * Ported from the backend's trust.ts, which has had this logic — and a full triage API
 * — since the trust work landed. /ops lives in this project and had neither, so the
 * `reports` staff module gated a route the console could never reach and no filed
 * report had ever been seen by anyone.
 *
 * The target is resolved to a label here rather than in the UI so a moderator can tell
 * what they're looking at without opening three tabs.
 */
export async function adminListReports(status = 'open'): Promise<AdminReport[]> {
  const filterable = status === 'open' || status === 'resolved' || status === 'dismissed'
  const { rows } = await pool.query(
    `SELECT r.id, r.reporter_id, u.full_name AS reporter_name, u.email AS reporter_email,
            r.target_type, r.target_id, r.reason, r.details, r.status,
            to_char(r.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(r.resolved_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS resolved_at,
            CASE r.target_type
              WHEN 'user'    THEN (SELECT COALESCE(NULLIF(tu.full_name, ''), tu.email) FROM users tu WHERE tu.id = r.target_id)
              WHEN 'listing' THEN (SELECT tl.title FROM listings tl WHERE tl.id = r.target_id)
              WHEN 'review'  THEN (SELECT left(COALESCE(tr.comment, ''), 80) FROM reviews tr WHERE tr.id = r.target_id)
            END AS target_label
       FROM reports r LEFT JOIN users u ON u.id = r.reporter_id
      ${filterable ? 'WHERE r.status = $1' : ''}
      ORDER BY r.created_at DESC
      LIMIT 300`,
    filterable ? [status] : [],
  )
  return rows as AdminReport[]
}

/** Resolve or dismiss a report. Returns false when the id doesn't exist. */
export async function adminResolveReport(
  reportId: string,
  status: 'resolved' | 'dismissed',
): Promise<boolean> {
  if (!isUuid(reportId)) return false
  const { rowCount } = await pool.query(
    `UPDATE reports SET status = $2, resolved_at = now() WHERE id = $1`,
    [reportId, status],
  )
  return (rowCount ?? 0) > 0
}

// ---- F2: reading the staff audit trail --------------------------------------

export interface AuditEntry {
  id: string
  at: string
  staff_id: string | null
  staff_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  detail: unknown
  ip: string | null
}

/**
 * The staff audit trail (F2).
 *
 * staff_audit_log has been written since the RBAC work landed but NEVER read — until
 * this, the only way to answer "who deleted that?" was psql against Neon. The table
 * itself needed no change; it needed a reader.
 *
 * `action` and `target_type` arrive pre-validated as plain slugs (parseAuditFilter)
 * and are still bound, never interpolated.
 */
export async function getAuditLog(
  filter: AuditFilter,
): Promise<{ entries: AuditEntry[]; hasMore: boolean }> {
  const where: string[] = []
  const params: unknown[] = []
  const bind = (v: unknown) => `$${params.push(v)}`

  if (filter.q) where.push(`COALESCE(staff_email, '') ILIKE ${bind(`%${filter.q}%`)}`)
  if (filter.action) where.push(`action = ${bind(filter.action)}`)
  if (filter.targetType) where.push(`target_type = ${bind(filter.targetType)}`)
  if (filter.from) where.push(`created_at >= ${bind(filter.from)}::date`)
  if (filter.to) where.push(`created_at < (${bind(filter.to)}::date + interval '1 day')`)

  const limit = bind(filter.limit + 1)
  const offset = bind(filter.offset)
  const { rows } = await pool.query(
    `SELECT id, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at,
            staff_id, staff_email, action, target_type, target_id, detail, ip
       FROM staff_audit_log
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  )
  const hasMore = rows.length > filter.limit
  return { entries: rows.slice(0, filter.limit) as AuditEntry[], hasMore }
}

/** The distinct actions actually present, for the filter dropdown — so it offers what
 *  this deployment has really recorded rather than a hardcoded list that drifts. */
export async function getAuditActions(): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT action FROM staff_audit_log ORDER BY action`,
  )
  return rows.map((r) => String(r.action))
}

/**
 * A guest submits their transfer screenshot.
 *
 * Ported from the backend, which has had this since Instapay landed — the WEB never
 * could upload, because its payment-proof route was GET-only. That is why a payment
 * started on the website had no way to complete.
 *
 * Writes payment_status = 'submitted', which IS the "pending confirmation" state; an
 * admin then accepts or rejects it in /ops. Re-submitting after a rejection inserts a
 * fresh proof row rather than editing the old one, so the history of what was sent
 * survives the decision.
 */
export async function submitPaymentProof(
  bookingId: string,
  userId: string,
  imageData: string,
  method = 'instapay',
): Promise<Booking | null> {
  if (!isUuid(bookingId) || !isUuid(userId)) return null
  const img = assertProofImage(imageData)
  const m = method === 'instapay' ? 'instapay' : String(method).slice(0, 32)
  // BOOKING_COLS doesn't carry host_id (it lives on the listing), so pick it up here
  // rather than running a second query just to address the notification.
  const cur = await pool.query(
    `SELECT b.status, b.payment_status, b.paid_at, l.host_id, l.title
       FROM bookings b JOIN listings l ON l.id = b.listing_id
      WHERE b.id = $1 AND b.user_id = $2`,
    [bookingId, userId],
  )
  const row = cur.rows[0] as
    | { status: string; payment_status: string | null; paid_at: string | null; host_id: string | null; title: string | null }
    | undefined
  if (!row) return null
  // One predicate, shared with the payment page and the Pay-now button, so the three
  // can never disagree about whether this booking is payable.
  if (!canPay({ status: row.status, payment_state: row.payment_status, paid_at: row.paid_at })) {
    throw new PaymentProofError(
      row.paid_at || row.payment_status === 'paid'
        ? 'This booking is already paid'
        : row.payment_status === 'submitted'
          ? 'Your transfer is already being reviewed'
          : 'This booking cannot be paid right now',
    )
  }

  await pool.query(
    `INSERT INTO payment_proofs (booking_id, method, image_data, amount)
     VALUES ($1, $2, $3, (SELECT total_price FROM bookings WHERE id = $1))`,
    [bookingId, m, img],
  )
  const { rows } = await pool.query(
    `WITH upd AS (
       UPDATE bookings b SET payment_status = 'submitted', payment_method = $3
       WHERE b.id = $1 AND b.user_id = $2
       RETURNING b.*
     )
     SELECT ${BOOKING_COLS} FROM upd b JOIN listings l ON l.id = b.listing_id`,
    [bookingId, userId, m],
  )
  const booking = (rows[0] as Booking) ?? null
  if (booking) {
    // The guest is told their part is done. The host is told money arrived, but NOT
    // asked to approve it — that is an admin decision now.
    await createNotification(
      userId, 'payment',
      'Transfer received',
      `We got your screenshot for ${row.title ?? 'your stay'}. We'll confirm it shortly.`,
      '/reservations',
    )
    if (row.host_id) {
      await createNotification(
        row.host_id, 'payment',
        'Guest sent a payment',
        `${row.title ?? 'A stay'} — the guest uploaded a transfer receipt. QuickIn will confirm it.`,
        '/host',
      )
    }
  }
  return booking
}

// ---- F1: the site activity feed ---------------------------------------------

export interface ActivityEvent {
  kind: string
  at: string
  actor_id: string | null
  actor_email: string | null
  actor_name: string | null
  /** What the event was about — a listing title, a reservation code, an amount. */
  subject: string | null
  subject_type: string | null
  subject_id: string | null
  /** Money, where the event has any. */
  amount: number | null
  detail: string | null
}

/**
 * Everything that happened on the site, newest first.
 *
 * There is NO activity_log table. Six of the seven kinds are derived from timestamps
 * already sitting on real rows, so this feed has full history from the day it shipped
 * rather than starting empty — and it cannot drift from the data it describes, because
 * it IS the data. `login` is the exception and has its own table.
 *
 * Each branch is date-windowed and LIMITed BEFORE the union, so every one uses its own
 * created_at index instead of sorting a whole table; the outer query only merges an
 * already-small set. Branches the filter excludes are not emitted at all.
 */
export async function getActivityFeed(
  filter: ActivityFilter,
): Promise<{ events: ActivityEvent[]; hasMore: boolean }> {
  const params: unknown[] = []
  const bind = (v: unknown) => `$${params.push(v)}`

  // One shared window; `to` widens to the whole final day.
  const from = filter.from ? bind(filter.from) : null
  const to = filter.to ? bind(filter.to) : null
  const windowFor = (col: string) => {
    const parts: string[] = [`${col} IS NOT NULL`]
    if (from) parts.push(`${col} >= ${from}::date`)
    if (to) parts.push(`${col} < (${to}::date + interval '1 day')`)
    return parts.join(' AND ')
  }
  const cap = bind(branchLimit(filter))
  const search = filter.q ? bind(`%${filter.q}%`) : null
  // Applied to the actor, whoever that is for the branch in question.
  const match = (email: string, name: string) =>
    search ? ` AND (${email} ILIKE ${search} OR COALESCE(${name}, '') ILIKE ${search})` : ''

  const branches: string[] = []

  if (wantsKind(filter, 'signup')) branches.push(`
    (SELECT 'signup' AS kind, u.created_at AS at, u.id AS actor_id, u.email AS actor_email,
            u.full_name AS actor_name, NULL::text AS subject, 'user' AS subject_type,
            u.id::text AS subject_id, NULL::float8 AS amount,
            CASE WHEN COALESCE(u.is_host, false) THEN 'host' ELSE 'guest' END AS detail
       FROM users u
      WHERE ${windowFor('u.created_at')}${match('u.email', 'u.full_name')}
      ORDER BY u.created_at DESC LIMIT ${cap})`)

  if (wantsKind(filter, 'login')) branches.push(`
    (SELECT 'login' AS kind, lg.created_at AS at, u.id AS actor_id, u.email AS actor_email,
            u.full_name AS actor_name, NULL::text AS subject, 'user' AS subject_type,
            u.id::text AS subject_id, NULL::float8 AS amount, lg.method AS detail
       FROM user_logins lg JOIN users u ON u.id = lg.user_id
      WHERE ${windowFor('lg.created_at')}${match('u.email', 'u.full_name')}
      ORDER BY lg.created_at DESC LIMIT ${cap})`)

  if (wantsKind(filter, 'listing_created')) branches.push(`
    (SELECT 'listing_created' AS kind, l.created_at AS at, u.id AS actor_id, u.email AS actor_email,
            u.full_name AS actor_name, l.title AS subject, 'listing' AS subject_type,
            l.id::text AS subject_id, l.price_per_night::float8 AS amount,
            COALESCE(l.approval_status, 'approved') AS detail
       FROM listings l LEFT JOIN users u ON u.id = l.host_id
      WHERE ${windowFor('l.created_at')}${match("COALESCE(u.email, '')", 'u.full_name')}
      ORDER BY l.created_at DESC LIMIT ${cap})`)

  if (wantsKind(filter, 'booking_created')) branches.push(`
    (SELECT 'booking_created' AS kind, b.created_at AS at, u.id AS actor_id, u.email AS actor_email,
            u.full_name AS actor_name, l.title AS subject, 'booking' AS subject_type,
            b.id::text AS subject_id, ${sqlWithCommission('b.total_price', BOOKING_RATE_SQL)}::float8 AS amount, b.status AS detail
       FROM bookings b LEFT JOIN users u ON u.id = b.user_id
                       LEFT JOIN listings l ON l.id = b.listing_id
      WHERE ${windowFor('b.created_at')}${match("COALESCE(u.email, '')", 'u.full_name')}
      ORDER BY b.created_at DESC LIMIT ${cap})`)

  if (wantsKind(filter, 'payment_submitted')) branches.push(`
    (SELECT 'payment_submitted' AS kind, pp.submitted_at AS at, u.id AS actor_id, u.email AS actor_email,
            u.full_name AS actor_name, l.title AS subject, 'booking' AS subject_type,
            b.id::text AS subject_id, COALESCE(pp.amount, ${sqlWithCommission('b.total_price', BOOKING_RATE_SQL)})::float8 AS amount,
            pp.status AS detail
       FROM payment_proofs pp JOIN bookings b ON b.id = pp.booking_id
                              LEFT JOIN users u ON u.id = b.user_id
                              LEFT JOIN listings l ON l.id = b.listing_id
      WHERE ${windowFor('pp.submitted_at')}${match("COALESCE(u.email, '')", 'u.full_name')}
      ORDER BY pp.submitted_at DESC LIMIT ${cap})`)

  // NB the paid_at trap: it is NULLed on refund. Gating on PAID_SQL means this branch
  // shows payments that are still paid, and a refund shows up as its own money event
  // rather than a payment that silently vanished.
  if (wantsKind(filter, 'payment_approved')) branches.push(`
    (SELECT 'payment_approved' AS kind, b.paid_at AS at, u.id AS actor_id, u.email AS actor_email,
            u.full_name AS actor_name, l.title AS subject, 'booking' AS subject_type,
            b.id::text AS subject_id, ${sqlWithCommission('b.total_price', BOOKING_RATE_SQL)}::float8 AS amount, b.payment_status AS detail
       FROM bookings b LEFT JOIN users u ON u.id = b.user_id
                       LEFT JOIN listings l ON l.id = b.listing_id
      WHERE ${windowFor('b.paid_at')} AND ${PAID_SQL}${match("COALESCE(u.email, '')", 'u.full_name')}
      ORDER BY b.paid_at DESC LIMIT ${cap})`)

  if (wantsKind(filter, 'booking_cancelled')) branches.push(`
    (SELECT 'booking_cancelled' AS kind, b.cancelled_at AS at, u.id AS actor_id, u.email AS actor_email,
            u.full_name AS actor_name, l.title AS subject, 'booking' AS subject_type,
            b.id::text AS subject_id, b.refund_amount::float8 AS amount,
            COALESCE(b.cancelled_by_role, 'guest') AS detail
       FROM bookings b LEFT JOIN users u ON u.id = b.user_id
                       LEFT JOIN listings l ON l.id = b.listing_id
      WHERE ${windowFor('b.cancelled_at')}${match("COALESCE(u.email, '')", 'u.full_name')}
      ORDER BY b.cancelled_at DESC LIMIT ${cap})`)

  if (branches.length === 0) return { events: [], hasMore: false }

  const dir = filter.sort === 'oldest' ? 'ASC' : 'DESC'
  // Fetch one extra row so the client knows whether a next page exists without a
  // COUNT over a seven-branch union.
  const limit = bind(filter.limit + 1)
  const offset = bind(filter.offset)
  const { rows } = await pool.query(
    `SELECT kind, to_char(at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at, actor_id, actor_email,
            actor_name, subject, subject_type, subject_id, amount, detail
       FROM (${branches.join('\n    UNION ALL')}) e
      ORDER BY at ${dir}
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  )
  const hasMore = rows.length > filter.limit
  return { events: rows.slice(0, filter.limit) as ActivityEvent[], hasMore }
}

// ---- D2: user profile -------------------------------------------------------

export interface AdminUserListing {
  id: string
  title: string
  is_published: boolean
  approval_status: string
  /** True when a block/removal took this listing down — so /ops can say WHY it's
   *  hidden rather than leaving the operator guessing. */
  unpublished_by_admin: boolean
  price_per_night: number
  currency: string
  created_at: string
  booking_count: number
}

export interface AdminUserBooking {
  id: string
  reservation_code: string | null
  listing_id: string | null
  listing_title: string | null
  status: string
  payment_status: string
  total_price: number
  currency: string
  check_in: string
  check_out: string
  created_at: string
}

export interface AdminUserPayment {
  id: string
  booking_id: string
  reservation_code: string | null
  listing_title: string | null
  amount: number
  status: string
  submitted_at: string | null
  reviewed_at: string | null
  reject_reason: string | null
}

export interface AdminUserConversation {
  id: string
  listing_id: string | null
  listing_title: string | null
  counterparty_id: string | null
  counterparty_name: string | null
  counterparty_email: string | null
  message_count: number
  last_message_at: string | null
  /** Which side of the thread this user is on. */
  viewer_role: 'guest' | 'host'
}

export interface AdminUserDocument {
  kind: 'id_verification' | 'host_application'
  id: string
  status: string
  submitted_at: string | null
  reviewed_at: string | null
  notes: string | null
  /** Whether a document image is on file. The image itself is NOT returned — it's
   *  reviewed on the Verifications screen, and a profile shouldn't ship megabytes
   *  of inline base64 (or that much PII) on every open. */
  has_document: boolean
}

export interface AdminUserDetail {
  user: AdminUserRow & {
    phone: string | null
    country: string | null
    bio: string | null
    avatar_url: string | null
    role: string | null
    host_type: string | null
    company: string | null
    referral_code: string | null
  }
  listings: AdminUserListing[]
  bookings: AdminUserBooking[]
  payments: AdminUserPayment[]
  conversations: AdminUserConversation[]
  documents: AdminUserDocument[]
  stats: {
    gross_paid: number
    nights_booked: number
    /** Booking-scoped mobile messages. Those threads have a different shape from
     *  the web `conversations` above, so they're counted rather than merged. */
    mobile_message_count: number
    report_count: number
  }
}

/** D2 — everything the /ops user profile renders, in one round of queries.
 *  Returns null for an unknown or non-uuid id so the route can 404. */
export async function adminGetUserDetail(id: string): Promise<AdminUserDetail | null> {
  if (!isUuid(id)) return null
  const { rows: urows } = await pool.query(
    `SELECT ${ADMIN_USER_COLS},
            u.phone, u.country, u.bio, u.avatar_url, u.role, u.host_type, u.company, u.referral_code
       FROM users u WHERE u.id = $1`,
    [id],
  )
  const user = urows[0] as AdminUserDetail['user'] | undefined
  if (!user) return null

  const [listings, bookings, payments, conversations, verifications, applications, stats] = await Promise.all([
    pool.query(
      `SELECT l.id, l.title, COALESCE(l.is_published, false) AS is_published,
              COALESCE(l.approval_status, 'approved') AS approval_status,
              COALESCE(l.unpublished_by_admin, false) AS unpublished_by_admin,
              COALESCE(l.price_per_night, 0)::float8 AS price_per_night,
              COALESCE(l.currency, 'USD') AS currency,
              to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              (SELECT COUNT(*) FROM bookings b WHERE b.listing_id = l.id)::int AS booking_count
         FROM listings l WHERE l.host_id = $1 ORDER BY l.created_at DESC LIMIT 200`,
      [id],
    ),
    pool.query(
      `SELECT b.id, b.reservation_code, b.listing_id, l.title AS listing_title,
              b.status, COALESCE(b.payment_status, 'unpaid') AS payment_status,
              COALESCE(b.total_price, 0)::float8 AS total_price,
              COALESCE(l.currency, 'USD') AS currency,
              to_char(b.check_in, 'YYYY-MM-DD') AS check_in,
              to_char(b.check_out, 'YYYY-MM-DD') AS check_out,
              to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
         FROM bookings b LEFT JOIN listings l ON l.id = b.listing_id
        WHERE b.user_id = $1 ORDER BY b.created_at DESC LIMIT 200`,
      [id],
    ),
    // Payment proofs have no direct user FK — they hang off the booking.
    pool.query(
      `SELECT pp.id, pp.booking_id, b.reservation_code, l.title AS listing_title,
              COALESCE(pp.amount, b.total_price, 0)::float8 AS amount,
              pp.status, pp.reject_reason,
              to_char(pp.submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS submitted_at,
              to_char(pp.reviewed_at,  'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS reviewed_at
         FROM payment_proofs pp
         JOIN bookings b ON b.id = pp.booking_id
         LEFT JOIN listings l ON l.id = b.listing_id
        WHERE b.user_id = $1 ORDER BY pp.submitted_at DESC LIMIT 200`,
      [id],
    ),
    adminListUserConversations(id),
    pool.query(
      `SELECT id, status, notes,
              to_char(submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS submitted_at,
              to_char(reviewed_at,  'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS reviewed_at,
              (image_data IS NOT NULL) AS has_document
         FROM id_verifications WHERE user_id = $1 ORDER BY id_verifications.submitted_at DESC LIMIT 20`,
      [id],
    ),
    pool.query(
      `SELECT id, status, COALESCE(review_note, notes) AS notes,
              to_char(submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS submitted_at,
              to_char(reviewed_at,  'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS reviewed_at,
              (national_id IS NOT NULL) AS has_document
         FROM host_applications WHERE user_id = $1 ORDER BY host_applications.submitted_at DESC LIMIT 20`,
      [id],
    ),
    pool.query(
      `SELECT COALESCE((SELECT SUM(b.total_price) FROM bookings b
                         WHERE b.user_id = $1 AND COALESCE(b.payment_status,'unpaid') = 'paid'), 0)::float8 AS gross_paid,
              COALESCE((SELECT SUM(b.check_out - b.check_in) FROM bookings b
                         WHERE b.user_id = $1 AND b.status <> 'cancelled'), 0)::int AS nights_booked,
              (SELECT COUNT(*) FROM messages m WHERE m.sender_id = $1)::int AS mobile_message_count,
              (SELECT COUNT(*) FROM reports r WHERE r.target_type = 'user' AND r.target_id = $1)::int AS report_count`,
      [id],
    ),
  ])

  const documents: AdminUserDocument[] = [
    ...verifications.rows.map((r) => ({ ...(r as Omit<AdminUserDocument, 'kind'>), kind: 'id_verification' as const })),
    ...applications.rows.map((r) => ({ ...(r as Omit<AdminUserDocument, 'kind'>), kind: 'host_application' as const })),
  ]

  return {
    user,
    listings: listings.rows as AdminUserListing[],
    bookings: bookings.rows as AdminUserBooking[],
    payments: payments.rows as AdminUserPayment[],
    conversations,
    documents,
    stats: stats.rows[0] as AdminUserDetail['stats'],
  }
}

/** Thread metadata for the /ops profile — who with, which listing, how many
 *  messages, last activity. Message BODIES are deliberately absent: reading them
 *  goes through adminReadConversation, which the route audits. */
export async function adminListUserConversations(userId: string): Promise<AdminUserConversation[]> {
  if (!isUuid(userId)) return []
  const { rows } = await pool.query(
    `SELECT c.id, c.listing_id, l.title AS listing_title,
            CASE WHEN c.guest_id = $1 THEN c.host_id ELSE c.guest_id END AS counterparty_id,
            CASE WHEN c.guest_id = $1 THEN hu.full_name ELSE gu.full_name END AS counterparty_name,
            CASE WHEN c.guest_id = $1 THEN hu.email ELSE gu.email END AS counterparty_email,
            (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id)::int AS message_count,
            to_char(c.last_message_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_message_at,
            CASE WHEN c.host_id = $1 THEN 'host' ELSE 'guest' END AS viewer_role
       FROM conversations c
       LEFT JOIN listings l ON l.id = c.listing_id
       LEFT JOIN users gu ON gu.id = c.guest_id
       LEFT JOIN users hu ON hu.id = c.host_id
      WHERE c.guest_id = $1 OR c.host_id = $1
      ORDER BY c.last_message_at DESC NULLS LAST
      LIMIT 200`,
    [userId],
  )
  return rows as AdminUserConversation[]
}

export interface AdminThreadMessage {
  id: string
  sender_id: string
  sender_name: string | null
  body: string
  created_at: string
}

/** Read a thread's message bodies for /ops. Returns null unless the conversation is
 *  one THIS user belongs to — so an operator can't page through arbitrary threads by
 *  guessing ids; they have to come in via a profile. The route logs every call. */
export async function adminReadConversation(
  userId: string,
  conversationId: string,
): Promise<{ conversation: AdminUserConversation; messages: AdminThreadMessage[] } | null> {
  if (!isUuid(userId) || !isUuid(conversationId)) return null
  const conversation = (await adminListUserConversations(userId)).find((c) => c.id === conversationId)
  if (!conversation) return null
  const { rows } = await pool.query(
    `SELECT m.id, m.sender_id, u.full_name AS sender_name, m.body,
            to_char(m.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
       FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = $1 ORDER BY m.created_at ASC LIMIT 500`,
    [conversationId],
  )
  return { conversation, messages: rows as AdminThreadMessage[] }
}

// ---- D3 / D4: block, remove, restore ----------------------------------------

/**
 * The one writer of `users.account_status`, for all four transitions.
 *
 * Blocking or removing hides the account's published listings and flags them
 * `unpublished_by_admin`; returning to active republishes EXACTLY those, so a
 * listing the host had taken down themselves stays down. Transactional, with the
 * user row locked, so status and listing visibility can never disagree.
 *
 * Refuses to touch a `role='admin'` row: staff.ts's legacy-admin fallback resolves
 * such a user through getUserFromRequest, so blocking one would lock the legacy
 * operator out of /ops entirely.
 *
 * History lives in staff_audit_log (written by the route); the status_changed_*
 * columns hold just the latest transition for cheap display.
 */
export async function adminSetAccountStatus(
  id: string,
  next: AccountStatus,
  opts: { reason?: string | null; actor: string },
): Promise<{ previous: AccountStatus; email: string; listingsChanged: number }> {
  if (!isUuid(id)) throw new Error('Invalid user')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT email, role, COALESCE(account_status, 'active') AS account_status
         FROM users WHERE id = $1 FOR UPDATE`,
      [id],
    )
    const row = rows[0] as { email: string; role: string | null; account_status: string } | undefined
    if (!row) throw new Error('User not found')
    if (String(row.role ?? '').toLowerCase() === 'admin') {
      throw new Error('Cannot change the status of an admin account')
    }
    const previous = normalizeStatus(row.account_status)

    await client.query(
      `UPDATE users
          SET account_status = $2, status_reason = $3,
              status_changed_at = now(), status_changed_by = $4
        WHERE id = $1`,
      [id, next, opts.reason ?? null, opts.actor],
    )

    let listingsChanged = 0
    if (hidesListings(next) && !hidesListings(previous)) {
      // Only currently-published listings are touched, so pending/rejected ones are
      // never flagged and can't be published by a later restore.
      const hid = await client.query(
        `UPDATE listings SET is_published = false, unpublished_by_admin = true
          WHERE host_id = $1 AND is_published = true`,
        [id],
      )
      listingsChanged = hid.rowCount ?? 0
    } else if (!hidesListings(next) && hidesListings(previous)) {
      const shown = await client.query(
        // Not the ones verification took down — those come back only when the
        // host is verified again.
        `UPDATE listings SET is_published = true, unpublished_by_admin = false
          WHERE host_id = $1 AND unpublished_by_admin = true
            AND COALESCE(unpublished_by_verification, false) = false
            AND COALESCE(approval_status, 'approved') = 'approved'`,
        [id],
      )
      listingsChanged = shown.rowCount ?? 0
      // A listing rejected while the account was down stays hidden, but must not
      // stay flagged — otherwise a future restore would resurrect it.
      await client.query(
        `UPDATE listings SET unpublished_by_admin = false
          WHERE host_id = $1 AND unpublished_by_admin = true`,
        [id],
      )
    }

    await client.query('COMMIT')
    return { previous, email: row.email, listingsChanged }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/** Self-service account deletion ONLY — the App Store 5.1.1(v) / Google Play route
 *  at /api/local/account. **Not** an admin action: /ops blocks and removes instead
 *  (adminSetAccountStatus), which is reversible and keeps booking and payment
 *  history for disputes. Most child rows cascade, but listings.host_id has no
 *  ON DELETE CASCADE, so their listings are removed first (which cascades to those
 *  listings' images / bookings / reviews). Transactional. */
export async function adminDeleteUser(id: string): Promise<void> {
  if (!isUuid(id)) throw new Error('Invalid user')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM listings WHERE host_id = $1`, [id])
    await client.query(`DELETE FROM users WHERE id = $1`, [id])
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export interface AdminBookingRow {
  id: string
  /** NULL until the booking is confirmed (see genReservationCode). */
  reservation_code: string | null
  status: string
  payment_status: string
  /** Commission-inclusive — what the guest owes. */
  total_price: number
  /** The host's raw share of it. */
  host_payout: number
  /** The platform's cut: total_price − host_payout, at this booking's own rate. */
  commission: number
  /** The rate this booking was taken at, as a fraction. Snapshot, not the live rate. */
  commission_rate: number
  currency: string
  check_in: string
  check_out: string
  guest_name: string | null
  guest_email: string | null
  listing_title: string | null
  created_at: string
}

/** Newest-first bookings (LIMIT 300) with guest + listing details. */
export async function adminListBookings(): Promise<AdminBookingRow[]> {
  const { rows } = await pool.query(
    `SELECT b.id,
            NULLIF(b.reservation_code, '') AS reservation_code,
            b.status,
            CASE WHEN b.paid_at IS NULL THEN 'unpaid' ELSE 'paid' END AS payment_status,
            -- What the guest owes; host_payout is the host's raw share of it, and
            -- commission is the gap between them — the platform's margin on this
            -- one booking, priced at the rate it was taken at.
            ${sqlWithCommission('b.total_price', BOOKING_RATE_SQL)}::float8 AS total_price,
            b.total_price::float8 AS host_payout,
            ${COMMISSION_AMOUNT_SQL}::float8 AS commission,
            ${BOOKING_RATE_SQL}::float8 AS commission_rate,
            COALESCE(l.currency, 'USD') AS currency,
            to_char(b.check_in, 'YYYY-MM-DD') AS check_in,
            to_char(b.check_out, 'YYYY-MM-DD') AS check_out,
            gu.full_name AS guest_name, gu.email AS guest_email,
            l.title AS listing_title,
            to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
       FROM bookings b
       LEFT JOIN listings l ON l.id = b.listing_id
       LEFT JOIN users gu ON gu.id = b.user_id
      ORDER BY b.created_at DESC
      LIMIT 300`
  )
  return rows as AdminBookingRow[]
}

export interface AdminPendingBookingRow {
  id: string
  reservation_code: string | null
  status: string
  payment_status: string
  total_price: number
  currency: string
  check_in: string
  check_out: string
  guests: number
  guest_name: string | null
  guest_email: string | null
  listing_title: string | null
  listing_location: string | null
  host_name: string | null
  host_email: string | null
  host_id: string | null
  image: string | null
  created_at: string
}

/** Pending bookings awaiting host (or admin) approval. Newest-first. */
export async function adminListPendingBookings(): Promise<AdminPendingBookingRow[]> {
  const { rows } = await pool.query(
    `SELECT b.id,
            NULLIF(b.reservation_code, '') AS reservation_code,
            b.status,
            CASE WHEN b.paid_at IS NULL THEN 'unpaid' ELSE 'paid' END AS payment_status,
            b.total_price::float8 AS total_price,
            COALESCE(l.currency, 'USD') AS currency,
            to_char(b.check_in, 'YYYY-MM-DD') AS check_in,
            to_char(b.check_out, 'YYYY-MM-DD') AS check_out,
            b.guests,
            gu.full_name AS guest_name, gu.email AS guest_email,
            l.title AS listing_title, l.location AS listing_location,
            hu.full_name AS host_name, hu.email AS host_email, l.host_id,
            (SELECT url FROM listing_images li WHERE li.listing_id = l.id ORDER BY li."order" LIMIT 1) AS image,
            to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
       FROM bookings b
       LEFT JOIN listings l ON l.id = b.listing_id
       LEFT JOIN users gu ON gu.id = b.user_id
       LEFT JOIN users hu ON hu.id = l.host_id
      WHERE b.status = 'pending'
      ORDER BY b.created_at DESC
      LIMIT 200`
  )
  return rows as AdminPendingBookingRow[]
}

// ---- Chat (pre-booking inquiry: guest ⇄ host) -------------------------------

export interface ConversationSummary {
  id: string
  listing_id: string | null
  listing_title: string | null
  listing_image: string | null
  other_name: string | null
  last_message: string | null
  last_message_at: string
  is_host: boolean
}

export interface ChatMessage {
  id: string
  sender_id: string
  body: string
  created_at: string
  mine?: boolean
}

/** Guest opens (or reuses) a thread with the listing's host. Returns the thread id. */
export async function getOrCreateConversation(
  guestId: string,
  listingId: string
): Promise<{ id: string; host_id: string; listing_title: string | null }> {
  if (!isUuid(guestId) || !isUuid(listingId)) throw new Error('Invalid id')
  const { rows: lr } = await pool.query(
    `SELECT host_id, title FROM listings WHERE id = $1`,
    [listingId]
  )
  const listing = lr[0] as { host_id: string | null; title: string | null } | undefined
  if (!listing) throw new Error('Listing not found')
  if (!listing.host_id || !isUuid(listing.host_id)) throw new Error('This listing has no host to message yet')
  if (listing.host_id === guestId) throw new Error("You can't message your own listing")
  const { rows } = await pool.query(
    `INSERT INTO conversations (listing_id, guest_id, host_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (listing_id, guest_id) DO UPDATE SET listing_id = EXCLUDED.listing_id
     RETURNING id`,
    [listingId, guestId, listing.host_id]
  )
  return { id: rows[0].id as string, host_id: listing.host_id, listing_title: listing.title }
}

/** All threads a user is part of (as guest or host), newest activity first. */
export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  if (!isUuid(userId)) return []
  const { rows } = await pool.query(
    `SELECT c.id, c.listing_id,
            l.title AS listing_title,
            (SELECT url FROM listing_images li WHERE li.listing_id = l.id ORDER BY li."order" LIMIT 1) AS listing_image,
            CASE WHEN c.guest_id = $1 THEN hu.full_name ELSE gu.full_name END AS other_name,
            (SELECT m.body FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
            to_char(c.last_message_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_message_at,
            (c.host_id = $1) AS is_host
       FROM conversations c
       LEFT JOIN listings l ON l.id = c.listing_id
       LEFT JOIN users gu ON gu.id = c.guest_id
       LEFT JOIN users hu ON hu.id = c.host_id
      WHERE c.guest_id = $1 OR c.host_id = $1
      ORDER BY c.last_message_at DESC
      LIMIT 200`,
    [userId]
  )
  return rows as ConversationSummary[]
}

/** Assert the user belongs to the conversation; returns the row or null. */
async function conversationForUser(userId: string, conversationId: string) {
  const { rows } = await pool.query(
    `SELECT id, listing_id, guest_id, host_id FROM conversations
      WHERE id = $1 AND (guest_id = $2 OR host_id = $2)`,
    [conversationId, userId]
  )
  return rows[0] as { id: string; listing_id: string | null; guest_id: string; host_id: string } | undefined
}

/** Messages in a thread, oldest first. Only members can read. */
export async function listMessages(userId: string, conversationId: string): Promise<ChatMessage[]> {
  if (!isUuid(userId) || !isUuid(conversationId)) throw new Error('Invalid id')
  const convo = await conversationForUser(userId, conversationId)
  if (!convo) throw new Error('Conversation not found')
  const { rows } = await pool.query(
    `SELECT id, sender_id, body,
            to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
       FROM chat_messages WHERE conversation_id = $1 ORDER BY chat_messages.created_at ASC LIMIT 500`,
    [conversationId]
  )
  return (rows as ChatMessage[]).map((m) => ({ ...m, mine: m.sender_id === userId }))
}

/**
 * Post a message. Phone numbers, email addresses, social handles and
 * off-platform links are blocked outright (see contentguard) — including ones
 * split across the sender's recent messages. This is the same module and the
 * same policy the backend runs, so the web and the mobile apps behave
 * identically on the same thread.
 */
export async function postMessage(userId: string, conversationId: string, rawBody: string): Promise<ChatMessage> {
  if (!isUuid(userId) || !isUuid(conversationId)) throw new Error('Invalid id')
  const body = String(rawBody || '').trim().slice(0, 2000)
  if (!body) throw new Error('Message is empty')
  await guardContent(userId, body, 'chat', { type: 'conversation', id: conversationId })
  const convo = await conversationForUser(userId, conversationId)
  if (!convo) throw new Error('Conversation not found')
  const recent = await pool.query(
    `SELECT body FROM chat_messages WHERE conversation_id = $1 AND sender_id = $2 ORDER BY created_at DESC LIMIT 16`,
    [conversationId, userId]
  )
  await guardSplitContent(userId, recent.rows.map((r) => String(r.body || '')).reverse(), body, 'chat', { type: 'conversation', id: conversationId })
  const { rows } = await pool.query(
    `WITH ins AS (
       INSERT INTO chat_messages (conversation_id, sender_id, body) VALUES ($1, $2, $3) RETURNING *
     ), upd AS (
       UPDATE conversations SET last_message_at = now() WHERE id = $1
     )
     SELECT id, sender_id, body, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at FROM ins`,
    [conversationId, userId, body]
  )
  const other = convo.guest_id === userId ? convo.host_id : convo.guest_id
  if (isUuid(other)) {
    await createNotification(other, 'message', 'New message', body.slice(0, 80), '/messages')
  }
  const msg = rows[0] as ChatMessage
  return { ...msg, mine: true }
}

// ── Place autocomplete ─────────────────────────────────────────────────────
// Curated, well-known Egyptian destinations shown as "popular" suggestions and
// merged (deduped, case-insensitive) with the real distinct listing locations.
const CURATED_PLACES = [
  'Giza', 'North Coast', 'Sahel', 'El Gouna', 'Cairo', 'Zamalek', 'New Cairo',
  'Sheikh Zayed', '6th of October', 'Maadi', 'Hurghada', 'Sharm El Sheikh',
  'Alexandria', 'Marina', 'Ain Sokhna', 'Dahab', 'Luxor', 'Aswan',
]

/**
 * Up to 8 place suggestions for the Explore search bar: distinct listing
 * locations matching `q`, merged (case-insensitive dedupe) with the curated
 * Egyptian destinations. Empty `q` returns the first slice of the curated list.
 */
export async function getPlaceSuggestions(q: string): Promise<string[]> {
  const query = String(q || '').trim()
  const seen = new Set<string>()
  const out: string[] = []
  const add = (place: string) => {
    const value = String(place || '').trim()
    if (!value) return
    const key = value.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(value)
  }

  // Filter curated entries by the query (case-insensitive substring).
  const curated = query
    ? CURATED_PLACES.filter((p) => p.toLowerCase().includes(query.toLowerCase()))
    : CURATED_PLACES
  for (const p of curated) {
    add(p)
    if (out.length >= 8) return out.slice(0, 8)
  }

  // Empty query: just the curated "popular" list — no DB round-trip needed.
  if (!query) return out.slice(0, 8)

  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT location FROM listings
        WHERE location ILIKE '%' || $1 || '%' AND location IS NOT NULL
        ORDER BY location LIMIT 8`,
      [query]
    )
    for (const r of rows as { location: string }[]) {
      add(r.location)
      if (out.length >= 8) break
    }
  } catch (err) {
    console.error('getPlaceSuggestions query failed:', err)
  }

  return out.slice(0, 8)
}

// ---- App settings: mobile download links (admin-editable via /ops) ----------

export interface AppLinks {
  ios: string | null
  android: string | null
}

/** The mobile app store links surfaced by the web "download the app" bar.
 *  Returns nulls when nothing is configured yet (or the table doesn't exist),
 *  so the public banner endpoint never errors. */
export async function getAppLinks(): Promise<AppLinks> {
  try {
    const { rows } = await pool.query(
      `SELECT key, value FROM app_settings WHERE key IN ('app_ios_url', 'app_android_url')`
    )
    const norm = (v: unknown): string | null => {
      const s = String(v ?? '').trim()
      return s || null
    }
    const map = new Map(rows.map((r) => [r.key as string, r.value as string | null]))
    return { ios: norm(map.get('app_ios_url')), android: norm(map.get('app_android_url')) }
  } catch {
    // Table not created yet → treat as "no links configured".
    return { ios: null, android: null }
  }
}

/** Persist the app store links (admin only). Creates the settings table on
 *  first use so no separate migration is needed. Pass null to clear a link. */
export async function setAppLinks(ios: string | null, android: string | null): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS app_settings (
       key text PRIMARY KEY, value text, updated_at timestamptz DEFAULT now()
     )`
  )
  const upsert = async (key: string, value: string | null) => {
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, value]
    )
  }
  await upsert('app_ios_url', ios)
  await upsert('app_android_url', android)
}

// ---- Instapay manual payment (app_settings + payment_proofs) -----------------
// Mirrors the backend Instapay flow (both projects share one Neon DB). Guest
// transfers via Instapay and uploads a screenshot at booking time (handled by the
// backend / mobile app → payment 'submitted'); the WEB host reviews it here
// (accept ⇒ confirmed + paid, reject ⇒ declined with a reason), the guest may
// dispute a rejection, and a web /ops admin resolves it. The app_settings +
// payment_proofs tables are created by a backend migration (already applied).

/** Read one admin setting (null if unset). */
export async function getSetting(key: string): Promise<string | null> {
  const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = $1`, [key])
  return rows[0] ? ((rows[0].value as string | null) ?? null) : null
}

/** Upsert an admin setting. `updatedBy` is a user id or 'admin' (free text). */
export async function setSetting(key: string, value: string, updatedBy: string | null = null): Promise<void> {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at, updated_by)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [key, value, updatedBy]
  )
}

export type { PaymentConfig }

// ---- Platform commission -----------------------------------------------------

export interface CommissionConfig {
  /** Fraction, e.g. 0.1 = 10%. */
  rate: number
  /** The same value as the percentage the admin form edits, e.g. 10. */
  percent: number
  updated_at: string | null
  updated_by: string | null
}

/** The live commission rate and who last changed it (the /ops/pricing screen). */
export async function getCommissionConfig(): Promise<CommissionConfig> {
  const { rows } = await pool.query(
    `SELECT value, to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at, updated_by
       FROM app_settings WHERE key = $1`,
    [COMMISSION_RATE_KEY]
  )
  const rate = parseRate(rows[0]?.value)
  return {
    rate,
    percent: Math.round(rate * 10_000) / 100,
    updated_at: rows[0]?.updated_at ?? null,
    updated_by: rows[0]?.updated_by ?? null,
  }
}

/** Write a validated rate (a fraction — validate with rateFromPercent first). */
export async function setCommissionRate(rate: number, updatedBy: string | null = null): Promise<CommissionConfig> {
  await setSetting(COMMISSION_RATE_KEY, rateToStored(rate), updatedBy)
  return getCommissionConfig()
}

/** How many listings and services the current rate is repricing. Shown on the
 *  admin screen so an operator sees the blast radius before they change it. */
export async function getCommissionImpact(): Promise<{ listings: number; services: number }> {
  const { rows } = await pool.query(
    `SELECT (SELECT count(*) FROM listings WHERE is_published = true)::int AS listings,
            (SELECT count(*) FROM services WHERE is_published = true)::int AS services`
  )
  return { listings: Number(rows[0]?.listings ?? 0), services: Number(rows[0]?.services ?? 0) }
}

/**
 * The public-facing Instapay destination shown to guests at checkout: the
 * handle/number, the optional deep link, and the optional admin-uploaded QR.
 * Rows that were never saved read as '' — no migration is needed to add a key.
 */
export async function getPaymentConfig(): Promise<PaymentConfig> {
  const { rows } = await pool.query(
    `SELECT key, value FROM app_settings WHERE key = ANY($1::text[])`,
    [Object.values(INSTAPAY_KEYS)]
  )
  return rowsToPaymentConfig(rows as Array<{ key: string; value: string | null }>)
}

export interface PaymentProof {
  image_data: string
  method: string
  status: string
  submitted_at: string
  reject_reason: string | null
  dispute_note: string | null
  amount: number | null
}

/** The latest transfer screenshot for a booking. Authorized to the booking's
 *  guest, the listing's host, or an admin — else null. */
export async function getBookingProof(
  bookingId: string,
  requester: { id: string; role: string },
): Promise<PaymentProof | null> {
  if (!isUuid(bookingId)) return null
  const auth = await pool.query(
    `SELECT b.user_id, l.host_id FROM bookings b JOIN listings l ON l.id = b.listing_id WHERE b.id = $1`,
    [bookingId]
  )
  const a = auth.rows[0]
  if (!a) return null
  const allowed = requester.role === 'admin' || requester.id === a.user_id || requester.id === a.host_id
  if (!allowed) return null
  const { rows } = await pool.query(
    `SELECT image_data, method, status,
            to_char(submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS submitted_at,
            reject_reason, dispute_note, amount::float8 AS amount
       FROM payment_proofs WHERE booking_id = $1 ORDER BY payment_proofs.submitted_at DESC LIMIT 1`,
    [bookingId]
  )
  return (rows[0] as PaymentProof) ?? null
}

/**
 * Host accepts or rejects a booking's Instapay transfer (doubles as accepting the
 * stay). Accept → booking 'confirmed' + payment 'paid' + paid_at. Reject →
 * 'rejected' + reason. Only the listing's host, only while the booking is
 * 'pending'. Updates the latest proof row and notifies the guest. Returns null if
 * not the host / not pending.
 */
// hostReviewPayment was removed with the payment-flow change: hosts no longer approve
// transfers, an admin does (adminReviewProof). It was also unreachable in practice —
// it required b.status = 'pending' while a guest can only pay once a booking is
// 'confirmed', so a normal screenshot could never be approved through it.
export interface DisputeRow {
  booking_id: string
  reservation_code: string | null
  title: string
  guest_id: string
  guest_name: string | null
  guest_email: string | null
  host_id: string | null
  total_price: number
  reject_reason: string | null
  dispute_note: string | null
  submitted_at: string | null
  disputed_at: string | null
}

/** All open payment disputes (latest proof still 'disputed'), for the admin queue. */
export interface PendingProofRow {
  booking_id: string
  reservation_code: string | null
  title: string | null
  guest_id: string
  guest_name: string | null
  guest_email: string | null
  host_id: string | null
  total_price: number
  amount: number
  method: string | null
  submitted_at: string
  check_in: string
  check_out: string
}

/**
 * Transfer screenshots waiting for a decision.
 *
 * This queue did not exist. `adminListDisputes` is hard-filtered to
 * `pp.status = 'disputed'`, and the only path that could approve a FRESH proof —
 * hostReviewPayment — was guarded by `b.status = 'pending'`, while a guest can only
 * pay once the booking is 'confirmed'. So a screenshot submitted through the normal
 * flow had no reviewer at all and sat in 'submitted' indefinitely.
 *
 * Latest proof per booking only, so a superseded submission doesn't queue twice.
 */
export async function adminListPendingProofs(): Promise<PendingProofRow[]> {
  const { rows } = await pool.query(
    `SELECT b.id AS booking_id, b.reservation_code, l.title,
            b.user_id AS guest_id,
            (SELECT full_name FROM users u WHERE u.id = b.user_id) AS guest_name,
            (SELECT email     FROM users u WHERE u.id = b.user_id) AS guest_email,
            l.host_id,
            -- Commission-inclusive on BOTH: the reviewer compares these against
            -- the sum on a guest's Instapay screenshot, and the guest transferred
            -- the marked-up total. Showing the raw price here would make every
            -- correct payment look like an overpayment.
            ${sqlWithCommission('b.total_price', BOOKING_RATE_SQL)}::float8 AS total_price,
            COALESCE(pp.amount, ${sqlWithCommission('b.total_price', BOOKING_RATE_SQL)})::float8 AS amount,
            pp.method,
            to_char(pp.submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS submitted_at,
            to_char(b.check_in, 'YYYY-MM-DD') AS check_in,
            to_char(b.check_out, 'YYYY-MM-DD') AS check_out
       FROM payment_proofs pp
       JOIN bookings b ON b.id = pp.booking_id
       JOIN listings l ON l.id = b.listing_id
      WHERE pp.status = 'submitted'
        AND pp.id = (SELECT id FROM payment_proofs p2 WHERE p2.booking_id = pp.booking_id ORDER BY p2.submitted_at DESC LIMIT 1)
      ORDER BY pp.submitted_at ASC`
  )
  return rows as PendingProofRow[]
}

/**
 * An admin accepts or rejects a transfer screenshot.
 *
 * Note what rejecting does NOT do: it leaves `bookings.status` alone. The old host
 * review flipped the whole booking to 'rejected' on a bad screenshot, cancelling a
 * real reservation over an unreadable photo. Here the booking stays confirmed and the
 * guest can upload a clearer one — `canPay` treats a rejected payment as payable.
 *
 * Transactional so the proof row and the booking can never disagree about the outcome.
 */
export async function adminReviewProof(
  bookingId: string,
  action: PaymentReviewAction,
  reason: string | null,
  actor: string,
): Promise<{ guestId: string; title: string | null } | null> {
  if (!isUuid(bookingId)) throw new Error('Invalid booking')
  const out = outcomeFor(action)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT b.user_id, l.title FROM bookings b JOIN listings l ON l.id = b.listing_id WHERE b.id = $1`,
      [bookingId],
    )
    const row = rows[0] as { user_id: string; title: string | null } | undefined
    if (!row) { await client.query('ROLLBACK'); return null }

    await client.query(
      `UPDATE bookings SET payment_status = $2,
              paid_at = CASE WHEN $3 THEN COALESCE(paid_at, now()) ELSE paid_at END
        WHERE id = $1`,
      [bookingId, out.paymentState, out.markPaid],
    )
    // Only the latest proof — an older superseded one keeps its own history.
    await client.query(
      `UPDATE payment_proofs SET status = $2, reviewed_by = $3, reviewed_at = now(),
              reject_reason = $4
        WHERE id = (SELECT id FROM payment_proofs WHERE booking_id = $1 ORDER BY submitted_at DESC LIMIT 1)`,
      [bookingId, out.proofStatus, actor, reason],
    )
    await client.query('COMMIT')

    await createNotification(
      row.user_id, 'payment',
      action === 'accept' ? 'Payment confirmed' : 'We could not confirm your transfer',
      action === 'accept'
        ? `Your booking for ${row.title ?? 'your stay'} is fully confirmed.`
        : (reason
            ? `${row.title ?? 'Your stay'} — ${reason}. You can upload another screenshot.`
            : `${row.title ?? 'Your stay'} — please upload a clearer screenshot of the transfer.`),
      '/reservations',
    )
    return { guestId: row.user_id, title: row.title }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function adminListDisputes(): Promise<DisputeRow[]> {
  const { rows } = await pool.query(
    `SELECT b.id AS booking_id,
            'QK-' || upper(substr(b.id::text, 1, 8)) AS reservation_code,
            l.title,
            b.user_id AS guest_id,
            (SELECT full_name FROM users u WHERE u.id = b.user_id) AS guest_name,
            (SELECT email     FROM users u WHERE u.id = b.user_id) AS guest_email,
            -- What the guest was asked to transfer (see adminListPendingProofs).
            l.host_id, ${sqlWithCommission('b.total_price', BOOKING_RATE_SQL)}::float8 AS total_price,
            pp.reject_reason, pp.dispute_note,
            to_char(pp.submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS submitted_at,
            to_char(pp.disputed_at,  'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS disputed_at
       FROM payment_proofs pp
       JOIN bookings b ON b.id = pp.booking_id
       JOIN listings l ON l.id = b.listing_id
      WHERE pp.status = 'disputed'
        AND pp.id = (SELECT id FROM payment_proofs p2 WHERE p2.booking_id = pp.booking_id ORDER BY p2.submitted_at DESC LIMIT 1)
      ORDER BY pp.disputed_at DESC NULLS LAST`
  )
  return rows as DisputeRow[]
}

/** Admin resolves a dispute. Approve → confirm + mark paid; Uphold → keep rejected.
 *  Not constrained to 'pending' (a rejected booking can be revived). Notifies the
 *  guest (+ the host on approve). `adminId` is stored as free text on the proof. */
export async function adminResolveDispute(
  bookingId: string,
  adminId: string,
  action: 'approve' | 'uphold',
  note: string | null = null,
): Promise<Booking | null> {
  if (!isUuid(bookingId)) return null
  const approve = action === 'approve'
  const { rows } = await pool.query(
    `WITH upd AS (
       UPDATE bookings b SET
         status = CASE WHEN $2 THEN 'confirmed' ELSE 'rejected' END,
         payment_status = CASE WHEN $2 THEN 'paid' ELSE 'rejected' END,
         paid_at = CASE WHEN $2 THEN COALESCE(b.paid_at, now()) ELSE b.paid_at END
       WHERE b.id = $1
       RETURNING b.*, b.user_id AS _uid, b.listing_id AS _lid
     )
     SELECT ${BOOKING_COLS}, b.user_id AS _uid, l.title AS _title, l.host_id AS _hid
       FROM upd b JOIN listings l ON l.id = b.listing_id`,
    [bookingId, approve]
  )
  const row = rows[0] as (Booking & { _uid?: string; _title?: string; _hid?: string | null }) | undefined
  if (!row) return null
  await pool.query(
    `UPDATE payment_proofs SET
        status = CASE WHEN $2 THEN 'approved' ELSE 'rejected' END,
        reviewed_by = $3, reviewed_at = now(),
        reject_reason = CASE WHEN $2 THEN NULL ELSE COALESCE($4, reject_reason) END
      WHERE id = (SELECT id FROM payment_proofs WHERE booking_id = $1 ORDER BY submitted_at DESC LIMIT 1)`,
    [bookingId, approve, String(adminId).slice(0, 64), note ? String(note).slice(0, 500) : null]
  )
  const title = row._title ?? 'your stay'
  if (row._uid && isUuid(row._uid)) {
    await createNotification(
      row._uid,
      'payment',
      approve ? 'Payment confirmed' : 'Payment dispute closed',
      approve
        ? `Your stay at ${title} is confirmed & paid.`
        : `${title}: the transfer could not be verified.`,
      '/reservations'
    )
  }
  if (approve && row._hid && isUuid(row._hid)) {
    await createNotification(
      row._hid,
      'booking',
      'Booking paid',
      `${title} — payment confirmed by QuickIn support.`,
      '/host'
    )
  }
  delete row._uid
  delete row._title
  delete row._hid
  return row as Booking
}

// ---- Staff RBAC (admin panel accounts) --------------------------------------
// Management CRUD for the super admin's /ops/staff screen. Auth, sessions and the
// permission checks themselves live in src/lib/local/staff.ts (which owns its own
// SQL, the same way auth.ts does). These helpers exist only in this repo — the
// backend needs the gate, not the management screens.

export type StaffAccount = {
  id: string
  email: string
  full_name: string
  role: 'super_admin' | 'moderator'
  is_active: boolean
  last_login_at: string | null
  locked_until: string | null
  failed_login_attempts: number
  created_at: string
  created_by_email: string | null
  modules: string[]
  active_sessions: number
}

const STAFF_SELECT = `
  SELECT a.id, a.email, a.full_name, a.role, a.is_active, a.last_login_at,
         a.locked_until, a.failed_login_attempts, a.created_at,
         c.email AS created_by_email,
         COALESCE(array_agg(DISTINCT p.module) FILTER (WHERE p.module IS NOT NULL), '{}') AS modules,
         (SELECT count(*)::int FROM staff_sessions s
           WHERE s.staff_id = a.id AND s.revoked_at IS NULL AND s.expires_at > now()) AS active_sessions
    FROM staff_accounts a
    LEFT JOIN staff_accounts c ON c.id = a.created_by
    LEFT JOIN staff_permissions p ON p.staff_id = a.id`

/** Newest-last list for the staff screen: super admins first, then by creation. */
export async function listStaffAccounts(): Promise<StaffAccount[]> {
  const { rows } = await pool.query<StaffAccount>(
    `${STAFF_SELECT}
      GROUP BY a.id, c.email
      ORDER BY (a.role = 'super_admin') DESC, a.created_at`
  )
  return rows
}

export async function getStaffAccount(id: string): Promise<StaffAccount | null> {
  if (!isUuid(id)) return null
  const { rows } = await pool.query<StaffAccount>(
    `${STAFF_SELECT} WHERE a.id = $1 GROUP BY a.id, c.email`,
    [id]
  )
  return rows[0] ?? null
}

/** Login lookup. Returns the hash and lockout state; case-insensitive on email. */
export async function getStaffByEmail(email: string): Promise<{
  id: string
  email: string
  password_hash: string
  full_name: string
  role: 'super_admin' | 'moderator'
  is_active: boolean
  failed_login_attempts: number
  locked_until: string | null
} | null> {
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, full_name, role, is_active,
            failed_login_attempts, locked_until
       FROM staff_accounts WHERE lower(email) = lower($1)`,
    [email]
  )
  return rows[0] ?? null
}

/** How many super admins could still sign in — the last-one-standing guard. */
export async function countActiveSuperAdmins(excludeId?: string): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM staff_accounts
      WHERE role = 'super_admin' AND is_active AND ($1::uuid IS NULL OR id <> $1::uuid)`,
    [excludeId ?? null]
  )
  return rows[0]?.n ?? 0
}

export async function createStaffAccount(input: {
  email: string
  passwordHash: string
  fullName: string
  role: 'super_admin' | 'moderator'
  createdBy: string | null
  modules: string[]
}): Promise<StaffAccount> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO staff_accounts (email, password_hash, full_name, role, created_by)
       VALUES (lower($1), $2, $3, $4, $5) RETURNING id`,
      [input.email.trim(), input.passwordHash, input.fullName.trim().slice(0, 120), input.role,
       input.createdBy && isUuid(input.createdBy) ? input.createdBy : null]
    )
    const id = rows[0].id
    if (input.role === 'moderator' && input.modules.length) {
      await client.query(
        `INSERT INTO staff_permissions (staff_id, module, granted_by)
         SELECT $1, m, $2 FROM unnest($3::text[]) AS m
         ON CONFLICT (staff_id, module) DO NOTHING`,
        [id, input.createdBy && isUuid(input.createdBy) ? input.createdBy : null, input.modules]
      )
    }
    await client.query('COMMIT')
    return (await getStaffAccount(id))!
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/** Partial update of the editable profile fields. Role is intentionally included so
 *  a super admin can promote/demote, but callers must run the last-super-admin guard. */
export async function updateStaffAccount(
  id: string,
  fields: { fullName?: string; role?: 'super_admin' | 'moderator'; isActive?: boolean }
): Promise<StaffAccount | null> {
  if (!isUuid(id)) return null
  const { rowCount } = await pool.query(
    `UPDATE staff_accounts
        SET full_name = COALESCE($2, full_name),
            role      = COALESCE($3, role),
            is_active = COALESCE($4, is_active),
            updated_at = now()
      WHERE id = $1`,
    [id, fields.fullName?.trim().slice(0, 120) ?? null, fields.role ?? null,
     fields.isActive === undefined ? null : fields.isActive]
  )
  if (!rowCount) return null
  return getStaffAccount(id)
}

/** Replace a moderator's module set wholesale (the checkbox grid posts the full list).
 *  Takes effect on the moderator's next request — no re-login needed, since
 *  getStaffFromRequest re-reads permissions every time. */
export async function setStaffModules(id: string, modules: string[], grantedBy: string | null): Promise<void> {
  if (!isUuid(id)) throw new Error('Invalid id')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM staff_permissions WHERE staff_id = $1 AND NOT (module = ANY($2::text[]))`, [id, modules])
    if (modules.length) {
      await client.query(
        `INSERT INTO staff_permissions (staff_id, module, granted_by)
         SELECT $1, m, $2 FROM unnest($3::text[]) AS m
         ON CONFLICT (staff_id, module) DO NOTHING`,
        [id, grantedBy && isUuid(grantedBy) ? grantedBy : null, modules]
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/** Set a new password and clear any lockout. Callers must also revoke sessions. */
export async function setStaffPassword(id: string, passwordHash: string): Promise<boolean> {
  if (!isUuid(id)) return false
  const { rowCount } = await pool.query(
    `UPDATE staff_accounts
        SET password_hash = $2, password_changed_at = now(), updated_at = now(),
            failed_login_attempts = 0, locked_until = NULL
      WHERE id = $1`,
    [id, passwordHash]
  )
  return (rowCount ?? 0) > 0
}

export async function deleteStaffAccount(id: string): Promise<boolean> {
  if (!isUuid(id)) return false
  const { rowCount } = await pool.query(`DELETE FROM staff_accounts WHERE id = $1`, [id])
  return (rowCount ?? 0) > 0
}

/** Count a failed sign-in and lock the account once the threshold is hit.
 *  Per-account columns rather than the in-memory limiter, which dies on cold start
 *  and isn't shared across serverless instances. Returns the post-update state. */
export async function noteStaffLoginFailure(
  id: string,
  maxAttempts: number,
  lockoutMs: number
): Promise<{ attempts: number; lockedUntil: string | null }> {
  const { rows } = await pool.query<{ failed_login_attempts: number; locked_until: string | null }>(
    `UPDATE staff_accounts
        SET failed_login_attempts = failed_login_attempts + 1,
            locked_until = CASE WHEN failed_login_attempts + 1 >= $2
                                THEN now() + ($3 || ' milliseconds')::interval
                                ELSE locked_until END,
            updated_at = now()
      WHERE id = $1
      RETURNING failed_login_attempts, locked_until`,
    [id, maxAttempts, String(lockoutMs)]
  )
  return { attempts: rows[0]?.failed_login_attempts ?? 0, lockedUntil: rows[0]?.locked_until ?? null }
}

/** Clear the failure counter and stamp the successful sign-in. */
export async function noteStaffLoginSuccess(id: string): Promise<void> {
  await pool.query(
    `UPDATE staff_accounts
        SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now(), updated_at = now()
      WHERE id = $1`,
    [id]
  )
}

// ---- Staff password resets ---------------------------------------------------
// The HubDrives PasswordResetRequest contract: 6-digit code, single-use, short TTL,
// and locked after too many wrong guesses.

/** Invalidates any outstanding codes for the account, then issues a fresh one. */
export async function createStaffReset(input: {
  staffId: string
  email: string
  code: string
  ttlMs: number
  ip: string | null
}): Promise<void> {
  if (!isUuid(input.staffId)) throw new Error('Invalid id')
  await pool.query(
    `UPDATE staff_password_resets SET used_at = now()
      WHERE staff_id = $1 AND used_at IS NULL`,
    [input.staffId]
  )
  await pool.query(
    `INSERT INTO staff_password_resets (staff_id, email, code, expires_at, request_ip)
     VALUES ($1, lower($2), $3, now() + ($4 || ' milliseconds')::interval, $5)`,
    [input.staffId, input.email, input.code, String(input.ttlMs), input.ip]
  )
}

/**
 * Verify a reset code without consuming it. A wrong code increments the attempt
 * counter (so guessing is bounded); the row is only marked used once the password
 * has actually been changed — same ordering as HubDrives' Verify()/MarkUsed().
 */
export async function checkStaffReset(
  email: string,
  code: string,
  maxAttempts: number
): Promise<{ ok: true; id: string; staffId: string } | { ok: false; reason: 'not_found' | 'expired' | 'used' | 'locked' | 'mismatch' }> {
  const { rows } = await pool.query<{
    id: string
    staff_id: string
    code: string
    used_at: string | null
    failed_attempts: number
    expired: boolean
  }>(
    `SELECT id, staff_id, code, used_at, failed_attempts, (expires_at <= now()) AS expired
       FROM staff_password_resets
      WHERE lower(email) = lower($1)
      ORDER BY created_at DESC LIMIT 1`,
    [email]
  )
  const row = rows[0]
  if (!row) return { ok: false, reason: 'not_found' }
  if (row.used_at) return { ok: false, reason: 'used' }
  if (row.failed_attempts >= maxAttempts) return { ok: false, reason: 'locked' }
  if (row.expired) return { ok: false, reason: 'expired' }
  if (row.code !== String(code).trim()) {
    await pool.query(
      `UPDATE staff_password_resets SET failed_attempts = failed_attempts + 1 WHERE id = $1`,
      [row.id]
    )
    return { ok: false, reason: 'mismatch' }
  }
  return { ok: true, id: row.id, staffId: row.staff_id }
}

/** Consume the code. Call only after the new password is committed. */
export async function markStaffResetUsed(id: string): Promise<void> {
  await pool.query(`UPDATE staff_password_resets SET used_at = now() WHERE id = $1`, [id])
}

/** Housekeeping for the daily cron — sessions and reset codes accumulate forever. */
export async function purgeStaffExpired(): Promise<{ sessions: number; resets: number; logins: number }> {
  const s = await pool.query(
    `DELETE FROM staff_sessions WHERE expires_at < now() - interval '30 days'`
  )
  const r = await pool.query(
    `DELETE FROM staff_password_resets
      WHERE created_at < now() - interval '30 days' AND (used_at IS NOT NULL OR expires_at < now())`
  )
  // user_logins carries an IP and a user agent per sign-in — real PII, and unbounded.
  // 90 days is long enough to investigate an incident and short enough that the table
  // isn't a standing liability.
  const l = await pool.query(`DELETE FROM user_logins WHERE created_at < now() - interval '90 days'`)
  return { sessions: s.rowCount ?? 0, resets: r.rowCount ?? 0, logins: l.rowCount ?? 0 }
}

/**
 * Record a user sign-in (F1) — the ONE event the activity feed can't derive, because
 * nothing else in the schema records that a user logged in: no last_login_at, and no
 * user session table (auth is a stateless 30-day JWT).
 *
 * Best-effort by design, and the opposite call from recordDocumentView: a logging
 * failure must never stop someone signing in. Swallow and move on.
 */
export async function recordLogin(
  userId: string,
  method: 'password' | 'otp' | 'google' | 'apple' | 'social',
  req?: Request,
): Promise<void> {
  try {
    if (!isUuid(userId)) return
    const ip = req
      ? (req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || null)
      : null
    const ua = req ? (req.headers.get('user-agent') || '').slice(0, 300) || null : null
    await pool.query(
      `INSERT INTO user_logins (user_id, method, ip, user_agent) VALUES ($1, $2, $3, $4)`,
      [userId, method, ip, ua],
    )
  } catch {
    /* never block a sign-in over telemetry */
  }
}
