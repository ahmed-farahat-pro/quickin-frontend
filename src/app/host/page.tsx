'use client'

// Host dashboard (UI-only) — gated client-side to role 'host' | 'admin' read
// from the qk_user persisted in localStorage. Talks to the backend with the
// bearer token in qk_token. Three sections:
//   a) Add a listing  -> POST /api/local/listings
//   b) Your listings  -> GET  /api/local/host/listings
//   c) Reservation requests -> GET /api/local/host/bookings  (+ confirm/reject)
import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  API_URL,
  aiWriteDescription,
  getHostAnalytics,
  getReviewableGuests,
  getStoredUser,
  getToken,
  getHostEarnings,
  submitOwnershipDoc,
  updateListingDiscounts,
  updateListingPolicy,
  updateListingPricing,
  type ApprovalStatus,
  type CancellationPolicy,
  type HostAnalytics,
  type Listing,
  type MonthlyPrices,
  type HostBooking,
  type HostEarnings,
  type Service,
  type ServiceRequest,
  type ReviewableGuest,
} from '@/lib/api'
import { downscaleToDataUrl } from '@/lib/image'
import BookingChat from '@/app/_components/booking-chat'
import GuestReviewForm from '@/app/_components/guest-review-form'
import ImagePlaceholder from '@/app/_components/image-placeholder'
import AvailabilityManager from './availability-manager'
import { useLanguage } from '@/lib/i18n/language-provider'
import { useCurrency } from '@/lib/currency/currency-provider'

// Leaflet + OpenStreetMap pin-picker for the location step. Client-only (Leaflet
// touches window) -> dynamic import with ssr:false, mirroring how the explore
// page loads its map. Needs no API key.
const LocationPicker = dynamic(() => import('./location-picker'), {
  ssr: false,
})

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  page: '#E4DECF',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  gold: '#B07A2A',
}

const GRAD_BURGUNDY = 'linear-gradient(135deg,#5B0F16,#8a2530)'

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: COLORS.muted,
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 14px',
  fontSize: 14,
  fontFamily: FONT,
  color: COLORS.ink,
  background: '#fff',
  border: '1px solid rgba(42,34,32,0.14)',
  borderRadius: 14,
  outline: 'none',
}

function fmtDate(d: string): string {
  const date = new Date(d + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return d
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Parse a percent string and clamp it to the 0..90 range the backend accepts.
// A blank / NaN value becomes 0 (no discount).
function clampPercent(value: string | number): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(90, n))
}

// Parse a nightly-price input into a positive integer EGP, or null when the
// field is blank / zero / invalid. Used by the seasonal-pricing inputs so an
// empty box is omitted (weekend) / dropped from the monthly map (no override).
function parsePriceOrNull(value: string | number): number | null {
  const raw = String(value).trim()
  if (!raw) return null
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

// Build the { "1": 8500, … } monthly-prices object the backend expects from the
// wizard/editor's 12 string inputs, keeping ONLY the months with a valid price
// (blank/zero months are omitted so they fall back to the base nightly rate).
function buildMonthlyPrices(values: string[]): MonthlyPrices {
  const out: MonthlyPrices = {}
  values.forEach((v, i) => {
    const price = parsePriceOrNull(v)
    if (price !== null) out[String(i + 1)] = price
  })
  return out
}

// Seed 12 string inputs (Jan..Dec) from a listing's monthly_prices map. A month
// with no override becomes an empty string; a set month its integer as a string.
function monthlyPricesToInputs(prices?: MonthlyPrices): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const v = prices?.[String(i + 1)]
    return typeof v === 'number' && v > 0 ? String(v) : ''
  })
}

// Compare two monthly-price maps for equality (same keys, same values) so the
// inline editor's Save button can stay disabled until something actually
// changed. Both maps only contain set months.
function monthlyPricesEqual(a: MonthlyPrices, b: MonthlyPrices): boolean {
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  return ak.every((k) => a[k] === b[k])
}

// Reservation status → badge colors (shared look with /reservations + /reservation/[id]).
function statusStyle(status: string): {
  bg: string
  fg: string
  label: string
} {
  const s = (status || '').toLowerCase()
  if (s === 'confirmed')
    return { bg: 'rgba(15,81,50,0.12)', fg: '#0f5132', label: 'Confirmed' }
  if (s === 'rejected')
    return { bg: 'rgba(91,15,22,0.10)', fg: COLORS.burgundy, label: 'Rejected' }
  return { bg: 'rgba(176,122,0,0.14)', fg: '#8a5a00', label: 'Pending' }
}

function StatusBadge({ status }: { status: string }) {
  const s = statusStyle(status)
  return (
    <span
      style={{
        display: 'inline-block',
        background: s.bg,
        color: s.fg,
        fontSize: 12,
        fontWeight: 700,
        padding: '4px 12px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  )
}

// Approval-status → badge colors. Pending reads gold ("under review"), approved
// green ("live"), rejected burgundy. Labels are localized at the call site.
function approvalStyle(status: ApprovalStatus): { bg: string; fg: string } {
  if (status === 'approved') return { bg: 'rgba(15,81,50,0.12)', fg: '#0f5132' }
  if (status === 'rejected')
    return { bg: 'rgba(91,15,22,0.10)', fg: COLORS.burgundy }
  return { bg: 'rgba(176,122,42,0.16)', fg: '#8a5a00' }
}

function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const { t } = useLanguage()
  const s = approvalStyle(status)
  const label =
    status === 'approved'
      ? t('approval.approved')
      : status === 'rejected'
        ? t('approval.rejected')
        : t('approval.pending')
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: s.bg,
        color: s.fg,
        fontSize: 12,
        fontWeight: 700,
        padding: '4px 12px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: 999, background: s.fg }}
      />
      {label}
    </span>
  )
}

const PROPERTY_TYPES = [
  'Apartment',
  'Villa',
  'House',
  'Chalet',
  'Cabin',
  'Guest House',
]

// Canonical coarse areas the host picks before dropping the precise pin. These
// match the backend's GET /api/local/regions list and are sent as `region` in
// the POST /api/local/listings body.
const REGIONS = ['North Coast', 'Ain Sokhna', 'El Gouna', 'Cairo']

// Selectable amenities for the add-listing wizard (chip grid). Stored on the
// listing and rendered on the detail page's "What this place offers".
const AMENITIES = [
  'WiFi',
  'Pool',
  'Kitchen',
  'Air conditioning',
  'Free parking',
  'Washer',
  'TV',
  'Heating',
  'Workspace',
  'Gym',
  'Beach access',
  'Pets allowed',
  'Hot tub',
  'BBQ grill',
  'Breakfast',
]

// The three cancellation policies a host can pick, with the i18n keys for their
// name + one-line guest-facing description. Shared by the wizard step and the
// inline "Your listings" editor.
const CANCELLATION_POLICIES: {
  value: CancellationPolicy
  nameKey: string
  descKey: string
}[] = [
  { value: 'flexible', nameKey: 'cancel.flexible', descKey: 'cancel.flexibleDesc' },
  { value: 'moderate', nameKey: 'cancel.moderate', descKey: 'cancel.moderateDesc' },
  { value: 'strict', nameKey: 'cancel.strict', descKey: 'cancel.strictDesc' },
]

// The 12 months for the seasonal-pricing grid, with the i18n key for each
// month's short name (rendered as the input label). Index 0 = January → backend
// month number "1"; the seasonal-pricing helpers key off this 1-based order.
const MONTHS: { key: string }[] = [
  { key: 'month.jan' },
  { key: 'month.feb' },
  { key: 'month.mar' },
  { key: 'month.apr' },
  { key: 'month.may' },
  { key: 'month.jun' },
  { key: 'month.jul' },
  { key: 'month.aug' },
  { key: 'month.sep' },
  { key: 'month.oct' },
  { key: 'month.nov' },
  { key: 'month.dec' },
]

// Add-listing wizard step labels (index 0..6). The "Ownership" step collects the
// proof-of-right-to-rent document required before a listing can be approved.
const WIZARD_STEPS = [
  'Basics',
  'Location',
  'Details',
  'Amenities',
  'Cancellation',
  'Ownership',
  'Photos & review',
]

interface FormState {
  title: string
  description: string
  region: string
  location: string
  country: string
  price_per_night: string
  max_guests: string
  bedrooms: string
  beds: string
  bathrooms: string
  property_type: string
  // Length-of-stay discounts (percent off) kept as strings so they serialize
  // straight from the form inputs; parsed to ints on submit.
  weekly_discount: string
  monthly_discount: string
  // Seasonal pricing (optional). `weekend_price` is the nightly EGP for Fri+Sat
  // (blank → base price). `monthly_prices` is 12 strings (Jan..Dec); only the
  // filled months are sent. Kept as strings so they bind straight to inputs.
  weekend_price: string
  monthly_prices: string[]
  amenities: string[]
  cancellation_policy: CancellationPolicy
  // Ownership / proof-of-right-to-rent document, downscaled to a data:image/*
  // URL. Empty until the host picks one in the "Ownership" step.
  ownership_doc: string
  lat: string
  lng: string
  image1: string
  image2: string
  image3: string
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  region: '',
  location: '',
  country: '',
  price_per_night: '',
  max_guests: '1',
  bedrooms: '1',
  beds: '1',
  bathrooms: '1',
  property_type: 'Apartment',
  weekly_discount: '0',
  monthly_discount: '0',
  weekend_price: '',
  monthly_prices: Array(12).fill(''),
  amenities: [],
  cancellation_policy: 'moderate',
  ownership_doc: '',
  lat: '',
  lng: '',
  image1: '',
  image2: '',
  image3: '',
}

const SERVICE_CATEGORIES = [
  'Water sports',
  'Diving',
  'Boat & yacht',
  'Tours',
  'Wellness',
  'Food & drink',
  'Adventure',
  'Other',
]

interface ServiceFormState {
  title: string
  category: string
  description: string
  location: string
  price: string
  image_url: string
}

const EMPTY_SERVICE_FORM: ServiceFormState = {
  title: '',
  category: 'Water sports',
  description: '',
  location: '',
  price: '',
  image_url: '',
}

type Gate =
  | { kind: 'checking' }
  | { kind: 'anon' }
  | { kind: 'forbidden' }
  | { kind: 'ok'; firstName: string }

export default function HostPage() {
  const { t } = useLanguage()
  const [gate, setGate] = useState<Gate>({ kind: 'checking' })

  // Earnings & payouts (mock) — totals + per-booking breakdown.
  const [earnings, setEarnings] = useState<HostEarnings | null>(null)
  const [earningsLoading, setEarningsLoading] = useState(true)
  const [earningsError, setEarningsError] = useState(false)

  // Host analytics — bookings, revenue, rating, conversion, monthly trend, top
  // listings (GET /api/local/host/analytics).
  const [analytics, setAnalytics] = useState<HostAnalytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [analyticsError, setAnalyticsError] = useState(false)

  // Add-listing wizard
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [step, setStep] = useState(0) // 0..6
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formOk, setFormOk] = useState<string | null>(null)
  // Hidden file input for the wizard's "Ownership" step + a localized read error.
  const ownershipInputRef = useRef<HTMLInputElement>(null)
  const [ownershipError, setOwnershipError] = useState<string | null>(null)

  // AI listing-description writer (wizard "Basics" step). Tracks the in-flight
  // request, a localized error, and whether the last fill came from a real model
  // (vs the backend's template fallback) so we can badge it.
  const [aiWriting, setAiWriting] = useState(false)
  const [aiWriteError, setAiWriteError] = useState<string | null>(null)
  const [aiWritten, setAiWritten] = useState<boolean | null>(null)

  // Parsed coordinate for the map pin-picker, derived from the lat/lng text
  // inputs so the marker, the "Selected:" caption and the POST body stay in
  // sync whether the host clicks the map or types coordinates by hand. `null`
  // until both are valid finite numbers.
  const latNum = Number(form.lat)
  const lngNum = Number(form.lng)
  const pickedCoords =
    form.lat.trim() !== '' &&
    form.lng.trim() !== '' &&
    Number.isFinite(latNum) &&
    Number.isFinite(lngNum)
      ? { lat: latNum, lng: lngNum }
      : null

  // Assembled image list (slots 1..3, trimmed, non-empty) — used by the review
  // card on step 4 and as the POST body's `images`.
  const imageList = [form.image1, form.image2, form.image3]
    .map((u) => u.trim())
    .filter(Boolean)

  // Return an error string for the current wizard step's required fields, or
  // null when the step is complete enough to advance.
  function validateStep(s: number): string | null {
    if (s === 0) {
      if (!form.title.trim()) return 'Please give your place a title.'
      return null
    }
    if (s === 1) {
      if (!form.region) return 'Pick a region for your place.'
      if (!pickedCoords) return 'Drop a pin on the map to set the location.'
      return null
    }
    if (s === 2) {
      if (!(Number(form.price_per_night) > 0))
        return 'Enter a price per night greater than 0.'
      return null
    }
    return null
  }

  function goNext() {
    const err = validateStep(step)
    if (err) {
      setFormError(err)
      return
    }
    setFormError(null)
    setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1))
  }

  function goBack() {
    setFormError(null)
    setFormOk(null)
    setStep((s) => Math.max(s - 1, 0))
  }

  // Listings
  const [listings, setListings] = useState<Listing[]>([])
  const [listingsLoading, setListingsLoading] = useState(true)
  const [listingsError, setListingsError] = useState(false)
  // listing id whose inline "Manage availability" panel is expanded
  const [openAvailId, setOpenAvailId] = useState<string | null>(null)

  // Reservation requests
  const [bookings, setBookings] = useState<HostBooking[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(true)
  const [bookingsError, setBookingsError] = useState(false)
  // ids currently being confirmed/rejected (disable their buttons)
  const [actingId, setActingId] = useState<string | null>(null)
  // booking id whose "Message guest" chat panel is currently expanded
  const [openChatId, setOpenChatId] = useState<string | null>(null)

  // Services — add-service form
  const [svcForm, setSvcForm] = useState<ServiceFormState>(EMPTY_SERVICE_FORM)
  const [svcSubmitting, setSvcSubmitting] = useState(false)
  const [svcFormError, setSvcFormError] = useState<string | null>(null)
  const [svcFormOk, setSvcFormOk] = useState<string | null>(null)

  // Services — the host's own services list
  const [services, setServices] = useState<Service[]>([])
  const [servicesLoading, setServicesLoading] = useState(true)
  const [servicesError, setServicesError] = useState(false)

  // Services — request inbox
  const [svcRequests, setSvcRequests] = useState<ServiceRequest[]>([])
  const [svcRequestsLoading, setSvcRequestsLoading] = useState(true)
  const [svcRequestsError, setSvcRequestsError] = useState(false)
  // service-request ids currently being confirmed/rejected (disable buttons)
  const [svcActingId, setSvcActingId] = useState<string | null>(null)

  // Guests the host can review (host → guest), for past stays.
  const [reviewableGuests, setReviewableGuests] = useState<ReviewableGuest[]>([])
  const [guestReviewsLoading, setGuestReviewsLoading] = useState(true)

  const loadListings = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setListingsLoading(true)
    setListingsError(false)
    try {
      const res = await fetch(`${API_URL}/api/local/host/listings`, {
        headers: { Authorization: 'Bearer ' + token },
      })
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = await res.json()
      setListings(Array.isArray(data) ? data : [])
    } catch {
      setListingsError(true)
    } finally {
      setListingsLoading(false)
    }
  }, [])

  const loadBookings = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setBookingsLoading(true)
    setBookingsError(false)
    try {
      const res = await fetch(`${API_URL}/api/local/host/bookings`, {
        headers: { Authorization: 'Bearer ' + token },
      })
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = await res.json()
      setBookings(Array.isArray(data) ? data : [])
    } catch {
      setBookingsError(true)
    } finally {
      setBookingsLoading(false)
    }
  }, [])

  const loadServices = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setServicesLoading(true)
    setServicesError(false)
    try {
      const res = await fetch(`${API_URL}/api/local/host/services`, {
        headers: { Authorization: 'Bearer ' + token },
      })
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = await res.json()
      setServices(Array.isArray(data) ? data : [])
    } catch {
      setServicesError(true)
    } finally {
      setServicesLoading(false)
    }
  }, [])

  const loadServiceRequests = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setSvcRequestsLoading(true)
    setSvcRequestsError(false)
    try {
      const res = await fetch(`${API_URL}/api/local/host/service-requests`, {
        headers: { Authorization: 'Bearer ' + token },
      })
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = await res.json()
      setSvcRequests(Array.isArray(data) ? data : [])
    } catch {
      setSvcRequestsError(true)
    } finally {
      setSvcRequestsLoading(false)
    }
  }, [])

  const loadReviewableGuests = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setGuestReviewsLoading(true)
    try {
      const data = await getReviewableGuests(token)
      setReviewableGuests(data)
    } finally {
      setGuestReviewsLoading(false)
    }
  }, [])

  const loadEarnings = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setEarningsLoading(true)
    setEarningsError(false)
    try {
      const data = await getHostEarnings(token)
      if (!data) {
        setEarningsError(true)
        return
      }
      setEarnings(data)
    } finally {
      setEarningsLoading(false)
    }
  }, [])

  const loadAnalytics = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setAnalyticsLoading(true)
    setAnalyticsError(false)
    try {
      const data = await getHostAnalytics(token)
      if (!data) {
        setAnalyticsError(true)
        return
      }
      setAnalytics(data)
    } finally {
      setAnalyticsLoading(false)
    }
  }, [])

  // Drop a stay from the "guests to review" list once its review lands.
  const onGuestReviewed = useCallback((bookingId: string) => {
    setReviewableGuests((prev) => prev.filter((g) => g.booking_id !== bookingId))
  }, [])

  // Gate on mount, then load data if allowed.
  useEffect(() => {
    const token = getToken()
    const user = getStoredUser()
    if (!token || !user) {
      setGate({ kind: 'anon' })
      return
    }

    // Open the dashboard for a host/admin user and load its data.
    const enter = (u: {
      full_name?: string | null
      name?: string | null
      email?: string | null
    }) => {
      const raw =
        (u.full_name && u.full_name.trim()) ||
        (u.name && u.name.trim()) ||
        (u.email ? u.email.split('@')[0] : '')
      setGate({ kind: 'ok', firstName: raw ? raw.split(' ')[0] : 'Host' })
      loadListings()
      loadBookings()
      loadServices()
      loadServiceRequests()
      loadReviewableGuests()
      loadEarnings()
      loadAnalytics()
    }

    const role = (user.role || '').toLowerCase()
    if (role === 'host' || role === 'admin') {
      enter(user)
      return
    }

    // The stored role is 'guest' — but localStorage can be STALE (the account may
    // have gained the host role in another session/device, or right after a role
    // upgrade). Re-check the live role from the server before forbidding; if it's
    // now a host, persist it and let them straight in. This is the usual cause of
    // "the host dashboard won't open for me".
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/me`, {
          headers: { Authorization: 'Bearer ' + token },
        })
        const data = await res.json().catch(() => ({}))
        const liveRole = (data?.user?.role || '').toLowerCase()
        if (cancelled) return
        if ((liveRole === 'host' || liveRole === 'admin') && data?.user) {
          try {
            localStorage.setItem('qk_user', JSON.stringify(data.user))
          } catch {
            /* ignore storage failures */
          }
          enter(data.user)
        } else {
          setGate({ kind: 'forbidden' })
        }
      } catch {
        if (!cancelled) setGate({ kind: 'forbidden' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadListings, loadBookings, loadServices, loadServiceRequests, loadReviewableGuests, loadEarnings, loadAnalytics])

  function patch(p: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...p }))
    setFormError(null)
    setFormOk(null)
  }

  function toggleAmenity(a: string) {
    setForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(a)
        ? prev.amenities.filter((x) => x !== a)
        : [...prev.amenities, a],
    }))
    setFormError(null)
    setFormOk(null)
  }

  // Pick + downscale the ownership document for the wizard's "Ownership" step.
  async function handlePickOwnership(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setOwnershipError(null)
    try {
      const dataUrl = await downscaleToDataUrl(file, 1200)
      patch({ ownership_doc: dataUrl })
    } catch {
      setOwnershipError(t('approval.readError'))
    }
  }

  // Generate a listing description from the facts the host has entered so far
  // (POST /api/local/ai/listing-description). Fills the description textarea with
  // the result and badges whether a real model or the template fallback wrote it.
  // The host can freely edit the text afterwards.
  async function handleWriteWithAI() {
    const token = getToken()
    if (!token) {
      setGate({ kind: 'anon' })
      return
    }
    if (!form.title.trim()) {
      setAiWriteError(t('ai.writeNeedTitle'))
      return
    }
    setAiWriting(true)
    setAiWriteError(null)
    try {
      const { description, ai } = await aiWriteDescription(token, {
        title: form.title.trim(),
        location: form.location.trim() || undefined,
        region: form.region || undefined,
        propertyType: form.property_type || undefined,
        bedrooms: Number(form.bedrooms) || undefined,
        maxGuests: Number(form.max_guests) || undefined,
        amenities: form.amenities,
        notes: form.description.trim() || undefined,
      })
      if (description.trim()) {
        // Use the raw setter (not patch) so we don't clear the AI badge we set
        // immediately below — patch() resets form-level messages.
        setForm((prev) => ({ ...prev, description }))
        setAiWritten(ai)
      } else {
        setAiWriteError(t('ai.writeError'))
      }
    } catch {
      setAiWriteError(t('ai.writeError'))
    } finally {
      setAiWriting(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setFormOk(null)

    const token = getToken()
    if (!token) {
      setGate({ kind: 'anon' })
      return
    }

    const images = [form.image1, form.image2, form.image3]
      .map((u) => u.trim())
      .filter(Boolean)

    const price = Number(form.price_per_night)
    if (!form.title.trim() || !(price > 0)) {
      setFormError('A title and a price greater than 0 are required.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/api/local/listings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          region: form.region || null,
          location: form.location.trim(),
          country: form.country.trim(),
          price_per_night: price,
          bedrooms: Number(form.bedrooms) || 0,
          beds: Number(form.beds) || 0,
          bathrooms: Number(form.bathrooms) || 0,
          max_guests: Number(form.max_guests) || 1,
          property_type: form.property_type,
          amenities: form.amenities,
          weekly_discount: clampPercent(form.weekly_discount),
          monthly_discount: clampPercent(form.monthly_discount),
          // Seasonal pricing — null/empty when the host left them blank.
          weekend_price: parsePriceOrNull(form.weekend_price),
          monthly_prices: buildMonthlyPrices(form.monthly_prices),
          cancellation_policy: form.cancellation_policy,
          ownership_doc: form.ownership_doc || undefined,
          lat: form.lat.trim() ? Number(form.lat) : null,
          lng: form.lng.trim() ? Number(form.lng) : null,
          images,
        }),
      })

      if (res.status === 401) {
        setGate({ kind: 'anon' })
        return
      }
      if (res.status === 403) {
        setFormError('Your account is not allowed to create listings.')
        return
      }

      const data = await res.json().catch(() => ({}))
      if (res.status !== 201) {
        setFormError(
          (data && data.error) || 'Could not create the listing. Please try again.'
        )
        return
      }

      setForm(EMPTY_FORM)
      setStep(0)
      setOwnershipError(null)
      setFormOk(t('approval.submittedForReview'))
      loadListings()
    } catch {
      setFormError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function act(id: string, action: 'confirm' | 'reject') {
    const token = getToken()
    if (!token) {
      setGate({ kind: 'anon' })
      return
    }
    setActingId(id)
    setBookingsError(false)
    try {
      const res = await fetch(`${API_URL}/api/local/bookings/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ status: action }),
      })
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const updated = await res.json().catch(() => null)
      const nextStatus = action === 'confirm' ? 'confirmed' : 'rejected'
      setBookings((prev) =>
        prev.map((b) =>
          b.id === id
            ? { ...b, status: (updated && updated.status) || nextStatus }
            : b
        )
      )
    } catch {
      setBookingsError(true)
    } finally {
      setActingId(null)
    }
  }

  function patchSvc(p: Partial<ServiceFormState>) {
    setSvcForm((prev) => ({ ...prev, ...p }))
    setSvcFormError(null)
    setSvcFormOk(null)
  }

  async function handleCreateService(e: React.FormEvent) {
    e.preventDefault()
    setSvcFormError(null)
    setSvcFormOk(null)

    const token = getToken()
    if (!token) {
      setGate({ kind: 'anon' })
      return
    }

    const price = Number(svcForm.price)
    if (!svcForm.title.trim() || !(price > 0)) {
      setSvcFormError('Title and a price greater than 0 are required.')
      return
    }

    setSvcSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/api/local/services`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          title: svcForm.title.trim(),
          description: svcForm.description.trim() || undefined,
          category: svcForm.category || undefined,
          location: svcForm.location.trim() || undefined,
          price,
          image_url: svcForm.image_url.trim() || undefined,
        }),
      })

      if (res.status === 401) {
        setGate({ kind: 'anon' })
        return
      }
      if (res.status === 403) {
        setSvcFormError('Your account is not allowed to create services.')
        return
      }

      const data = await res.json().catch(() => ({}))
      if (res.status !== 201) {
        setSvcFormError(
          (data && data.error) || 'Could not create the service. Please try again.'
        )
        return
      }

      setSvcForm(EMPTY_SERVICE_FORM)
      setSvcFormOk('Service published. It now appears in “Your services” below.')
      loadServices()
    } catch {
      setSvcFormError('Network error. Please try again.')
    } finally {
      setSvcSubmitting(false)
    }
  }

  async function actService(id: string, action: 'confirm' | 'reject') {
    const token = getToken()
    if (!token) {
      setGate({ kind: 'anon' })
      return
    }
    setSvcActingId(id)
    setSvcRequestsError(false)
    try {
      const res = await fetch(`${API_URL}/api/local/service-requests/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ status: action }),
      })
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const updated = await res.json().catch(() => null)
      const nextStatus = action === 'confirm' ? 'confirmed' : 'rejected'
      setSvcRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status: (updated && updated.status) || nextStatus }
            : r
        )
      )
    } catch {
      setSvcRequestsError(true)
    } finally {
      setSvcActingId(null)
    }
  }

  // ---- Gate screens --------------------------------------------------------

  if (gate.kind === 'checking') {
    return (
      <Shell>
        <p
          style={{
            textAlign: 'center',
            padding: '64px 24px',
            color: COLORS.muted,
            fontSize: 15,
          }}
        >
          Loading…
        </p>
      </Shell>
    )
  }

  if (gate.kind === 'anon') {
    return (
      <Shell>
        <Notice
          title="Sign in to host"
          body="Log in to your host account to publish stays and manage reservation requests."
          ctaHref="/login"
          ctaLabel="Log in"
        />
      </Shell>
    )
  }

  if (gate.kind === 'forbidden') {
    return (
      <Shell>
        <Notice
          title="Become a host"
          body="Your account is a guest account. Register as a host to list your place and accept bookings."
          ctaHref="/signup"
          ctaLabel="Register as a host"
        />
      </Shell>
    )
  }

  // ---- Host dashboard ------------------------------------------------------

  const pending = bookings.filter(
    (b) => (b.status || '').toLowerCase() === 'pending'
  )
  const decided = bookings.filter(
    (b) => (b.status || '').toLowerCase() !== 'pending'
  )

  const svcPending = svcRequests.filter(
    (r) => (r.status || '').toLowerCase() === 'pending'
  )
  const svcDecided = svcRequests.filter(
    (r) => (r.status || '').toLowerCase() !== 'pending'
  )

  return (
    <Shell>
      <style>{`
        @media (max-width: 720px) {
          .qk-host-form-grid { grid-template-columns: 1fr 1fr !important; }
          .qk-host-form-full { grid-column: 1 / -1 !important; }
          .qk-month-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 560px) {
          .qk-host-step-label { display: none !important; }
        }
        @media (max-width: 460px) {
          .qk-host-form-grid { grid-template-columns: 1fr !important; }
          .qk-host-req-card { grid-template-columns: 1fr !important; }
          .qk-host-req-actions { justify-content: flex-start !important; }
          .qk-month-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      <h1
        style={{
          margin: '0 0 4px',
          fontFamily: '"Playfair Display", Georgia, serif',
          fontSize: 'clamp(26px, 4vw, 34px)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: COLORS.burgundy,
        }}
      >
        {gate.firstName}&apos;s host space
      </h1>
      <p style={{ margin: '0 0 30px', fontSize: 15, color: COLORS.muted }}>
        Publish a stay, see your listings, and respond to reservation requests.
      </p>

      {/* Analytics — bookings, revenue, rating, conversion, trend, top listings */}
      <AnalyticsPanel
        analytics={analytics}
        loading={analyticsLoading}
        error={analyticsError}
        onRetry={loadAnalytics}
      />

      {/* Earnings & payouts (mock) -------------------------------------------- */}
      <EarningsPanel
        earnings={earnings}
        loading={earningsLoading}
        error={earningsError}
        onRetry={loadEarnings}
      />

      {/* a) Add a listing ----------------------------------------------------- */}
      <Section title="Add a listing">
        {/* Step indicator -------------------------------------------------- */}
        <ol
          className="qk-host-steps"
          style={{
            listStyle: 'none',
            margin: '0 0 24px',
            padding: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${WIZARD_STEPS.length}, 1fr)`,
            gap: 10,
          }}
        >
          {WIZARD_STEPS.map((label, i) => {
            const active = i === step
            const done = i < step
            return (
              <li
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: active
                    ? GRAD_BURGUNDY
                    : done
                      ? 'rgba(91,15,22,0.08)'
                      : COLORS.tan,
                  border:
                    active || done
                      ? `1px solid ${COLORS.burgundy}`
                      : '1px solid rgba(42,34,32,0.08)',
                  transition: 'background 120ms ease',
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    flex: '0 0 auto',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 800,
                    color: active ? COLORS.burgundy : '#fff',
                    background: active
                      ? '#fff'
                      : done
                        ? 'linear-gradient(135deg,#B07A2A,#d8a55a)'
                        : COLORS.burgundy,
                  }}
                >
                  {done ? '✓' : i + 1}
                </span>
                <span
                  className="qk-host-step-label"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: active ? '#fff' : COLORS.ink,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {label}
                </span>
              </li>
            )
          })}
        </ol>

        <form onSubmit={handleCreate}>
          {/* STEP 1 — Basics ---------------------------------------------- */}
          {step === 0 && (
            <div style={{ display: 'grid', gap: 16 }}>
              <Field label="Title">
                <input
                  style={inputStyle}
                  value={form.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  placeholder="Lakeside cabin with a view"
                  required
                />
              </Field>
              <Field label="Property type">
                <select
                  style={{ ...inputStyle, appearance: 'auto' }}
                  value={form.property_type}
                  onChange={(e) => patch({ property_type: e.target.value })}
                >
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    marginBottom: 6,
                  }}
                >
                  <span style={{ ...labelStyle, marginBottom: 0 }}>
                    Description
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    {aiWritten !== null && !aiWriting && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          padding: '3px 9px',
                          borderRadius: 999,
                          color: aiWritten ? COLORS.gold : COLORS.muted,
                          background: aiWritten
                            ? 'rgba(176,122,42,0.14)'
                            : 'rgba(42,34,32,0.06)',
                        }}
                      >
                        {aiWritten ? t('ai.aiBadge') : t('ai.templateBadge')}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleWriteWithAI}
                      disabled={aiWriting}
                      className={aiWriting ? undefined : 'qk-press'}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 7,
                        padding: '8px 16px',
                        fontSize: 13.5,
                        fontWeight: 700,
                        fontFamily: FONT,
                        color: '#fff',
                        background: GRAD_BURGUNDY,
                        border: 'none',
                        borderRadius: 999,
                        cursor: aiWriting ? 'wait' : 'pointer',
                        opacity: aiWriting ? 0.7 : 1,
                        boxShadow: aiWriting
                          ? 'none'
                          : '0 8px 20px rgba(91,15,22,0.22)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {aiWriting
                        ? t('ai.writing')
                        : form.description.trim()
                          ? t('ai.rewriteWithAI')
                          : t('ai.writeWithAI')}
                    </button>
                  </div>
                </div>
                <textarea
                  style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
                  value={form.description}
                  onChange={(e) => {
                    patch({ description: e.target.value })
                    // The host is editing — clear the AI/draft badge.
                    setAiWritten(null)
                  }}
                  placeholder="What makes this place special?"
                />
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: 12.5,
                    color: aiWriteError ? COLORS.burgundy : COLORS.muted,
                    lineHeight: 1.5,
                  }}
                >
                  {aiWriteError || t('ai.writeHint')}
                </p>
              </div>
            </div>
          )}

          {/* STEP 2 — Location -------------------------------------------- */}
          {step === 1 && (
            <div style={{ display: 'grid', gap: 14 }}>
              <p style={{ margin: 0, fontSize: 14, color: COLORS.muted }}>
                Pick the region your place is in, then tap the map to drop the
                pin — drag it to fine-tune the exact spot.
              </p>

              {/* Region selector — the host picks the coarse area first, then
                  drops the precise pin below. Required to advance the step. */}
              <div>
                <span style={labelStyle}>Region</span>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}
                >
                  {REGIONS.map((r) => {
                    const on = form.region === r
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => patch({ region: r })}
                        aria-pressed={on}
                        className="qk-chip"
                        style={{
                          padding: '9px 18px',
                          fontSize: 14,
                          fontWeight: 600,
                          fontFamily: FONT,
                          cursor: 'pointer',
                          borderRadius: 999,
                          color: on ? '#fff' : COLORS.ink,
                          background: on ? GRAD_BURGUNDY : '#fff',
                          border: on
                            ? '1px solid transparent'
                            : '1px solid rgba(42,34,32,0.16)',
                          boxShadow: on
                            ? '0 8px 20px rgba(91,15,22,0.22)'
                            : 'none',
                        }}
                      >
                        {r}
                      </button>
                    )
                  })}
                </div>
              </div>

              <LocationPicker
                value={pickedCoords}
                onPick={(lat, lng) =>
                  patch({ lat: lat.toFixed(6), lng: lng.toFixed(6) })
                }
                onPlace={(p) =>
                  patch({
                    location: p.location || form.location,
                    country: p.country || form.country,
                    lat: p.lat.toFixed(6),
                    lng: p.lng.toFixed(6),
                  })
                }
              />

              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: pickedCoords ? COLORS.ink : COLORS.muted,
                }}
              >
                {pickedCoords ? (
                  <>
                    Pinned at{' '}
                    <span
                      style={{
                        fontFamily:
                          '"Geist Mono", ui-monospace, SFMono-Regular, monospace',
                        fontWeight: 600,
                        color: COLORS.burgundy,
                      }}
                    >
                      {pickedCoords.lat.toFixed(6)}, {pickedCoords.lng.toFixed(6)}
                    </span>
                  </>
                ) : (
                  'No location pinned yet — required to continue.'
                )}
              </p>

              <div
                className="qk-host-form-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 16,
                }}
              >
                <Field label="Location label">
                  <input
                    style={inputStyle}
                    value={form.location}
                    onChange={(e) => patch({ location: e.target.value })}
                    placeholder="Aspen, Colorado"
                  />
                </Field>
                <Field label="Country">
                  <input
                    style={inputStyle}
                    value={form.country}
                    onChange={(e) => patch({ country: e.target.value })}
                    placeholder="United States"
                  />
                </Field>
              </div>
            </div>
          )}

          {/* STEP 3 — Details --------------------------------------------- */}
          {step === 2 && (
            <div
              className="qk-host-form-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 16,
              }}
            >
              <Stepper
                label="Guests"
                value={form.max_guests}
                min={1}
                onChange={(v) => patch({ max_guests: v })}
              />
              <Stepper
                label="Bedrooms"
                value={form.bedrooms}
                min={0}
                onChange={(v) => patch({ bedrooms: v })}
              />
              <Stepper
                label="Beds"
                value={form.beds}
                min={0}
                onChange={(v) => patch({ beds: v })}
              />
              <Stepper
                label="Bathrooms"
                value={form.bathrooms}
                min={0}
                onChange={(v) => patch({ bathrooms: v })}
              />
              <Field className="qk-host-form-full" label="Price / night (EGP)">
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  value={form.price_per_night}
                  onChange={(e) => patch({ price_per_night: e.target.value })}
                  placeholder="180"
                  required
                />
              </Field>

              {/* Length-of-stay discounts — optional % off for longer stays.
                  Applied by the backend automatically at checkout. */}
              <div className="qk-host-form-full">
                <span style={labelStyle}>{t('growth.discounts')}</span>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: COLORS.muted, lineHeight: 1.5 }}>
                  {t('growth.discountsHint')}
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 16,
                  }}
                >
                  <PercentField
                    label={`${t('growth.weeklyDiscount')} (${t('growth.weeklyHint')})`}
                    value={form.weekly_discount}
                    onChange={(v) => patch({ weekly_discount: v })}
                  />
                  <PercentField
                    label={`${t('growth.monthlyDiscount')} (${t('growth.monthlyHint')})`}
                    value={form.monthly_discount}
                    onChange={(v) => patch({ monthly_discount: v })}
                  />
                </div>
              </div>

              {/* Seasonal / variable pricing — optional. Weekend (Fri/Sat)
                  nightly + a 12-month grid of per-month nightly overrides. Blank
                  months fall back to the base price; the backend's quote applies
                  these per night. */}
              <div className="qk-host-form-full">
                <span style={labelStyle}>{t('pricing.seasonal')}</span>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: COLORS.muted, lineHeight: 1.5 }}>
                  {t('pricing.seasonalHint')}
                </p>
                <div style={{ maxWidth: 220 }}>
                  <PriceField
                    label={t('pricing.weekendPrice')}
                    value={form.weekend_price}
                    onChange={(v) => patch({ weekend_price: v })}
                  />
                </div>
                <span style={{ ...labelStyle, marginTop: 16 }}>
                  {t('pricing.monthlyPrices')}
                </span>
                <div
                  className="qk-month-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 10,
                  }}
                >
                  {MONTHS.map((m, i) => (
                    <PriceField
                      key={m.key}
                      label={t(m.key)}
                      value={form.monthly_prices[i]}
                      onChange={(v) =>
                        patch({
                          monthly_prices: form.monthly_prices.map((mv, j) =>
                            j === i ? v : mv
                          ),
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4 — Amenities ------------------------------------------- */}
          {step === 3 && (
            <div style={{ display: 'grid', gap: 14 }}>
              <p style={{ margin: 0, fontSize: 14, color: COLORS.muted }}>
                Pick the amenities your place offers. Guests see these on your
                listing under “What this place offers.”
              </p>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                {AMENITIES.map((a) => {
                  const on = form.amenities.includes(a)
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleAmenity(a)}
                      aria-pressed={on}
                      className="qk-chip"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '9px 16px',
                        fontSize: 14,
                        fontWeight: 600,
                        fontFamily: FONT,
                        cursor: 'pointer',
                        borderRadius: 999,
                        color: on ? '#fff' : COLORS.ink,
                        background: on ? GRAD_BURGUNDY : '#fff',
                        border: on
                          ? '1px solid transparent'
                          : '1px solid rgba(42,34,32,0.16)',
                        boxShadow: on ? '0 8px 20px rgba(91,15,22,0.22)' : 'none',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          display: 'inline-flex',
                          width: 16,
                          height: 16,
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 13,
                          fontWeight: 800,
                          color: on ? '#fff' : COLORS.burgundy,
                        }}
                      >
                        {on ? '✓' : '+'}
                      </span>
                      {a}
                    </button>
                  )
                })}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: COLORS.muted }}>
                {form.amenities.length} selected
              </p>
            </div>
          )}

          {/* STEP 5 — Cancellation policy --------------------------------- */}
          {step === 4 && (
            <div style={{ display: 'grid', gap: 14 }}>
              <p style={{ margin: 0, fontSize: 14, color: COLORS.muted }}>
                {t('cancel.policyIntro')}
              </p>
              <div style={{ display: 'grid', gap: 12 }}>
                {CANCELLATION_POLICIES.map((p) => {
                  const on = form.cancellation_policy === p.value
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => patch({ cancellation_policy: p.value })}
                      aria-pressed={on}
                      className="qk-press"
                      style={{
                        display: 'block',
                        textAlign: 'start',
                        padding: '14px 16px',
                        borderRadius: 16,
                        cursor: 'pointer',
                        fontFamily: FONT,
                        background: on ? 'rgba(91,15,22,0.06)' : '#fff',
                        border: on
                          ? `2px solid ${COLORS.burgundy}`
                          : '1px solid rgba(42,34,32,0.16)',
                      }}
                    >
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          fontSize: 15,
                          fontWeight: 700,
                          color: on ? COLORS.burgundy : COLORS.ink,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            flex: '0 0 auto',
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            border: on
                              ? `5px solid ${COLORS.burgundy}`
                              : '2px solid rgba(42,34,32,0.3)',
                            background: '#fff',
                            boxSizing: 'border-box',
                          }}
                        />
                        {t(p.nameKey)}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          margin: '6px 0 0',
                          paddingInlineStart: 28,
                          fontSize: 13,
                          fontWeight: 400,
                          color: COLORS.muted,
                          lineHeight: 1.5,
                        }}
                      >
                        {t(p.descKey)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* STEP 6 — Ownership document ---------------------------------- */}
          {step === 5 && (
            <div style={{ display: 'grid', gap: 14 }}>
              <p style={{ margin: 0, fontSize: 14, color: COLORS.muted, lineHeight: 1.55 }}>
                {t('approval.ownershipIntro')}
              </p>

              <input
                ref={ownershipInputRef}
                type="file"
                accept="image/*"
                onChange={handlePickOwnership}
                style={{ display: 'none' }}
              />

              {form.ownership_doc ? (
                <div>
                  <span style={labelStyle}>{t('approval.ownershipDoc')}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.ownership_doc}
                    alt={t('approval.ownershipDoc')}
                    style={{
                      display: 'block',
                      maxWidth: '100%',
                      width: 280,
                      borderRadius: 14,
                      border: `1px solid ${COLORS.tan}`,
                      boxShadow: '0 6px 18px rgba(42,34,32,0.12)',
                    }}
                  />
                </div>
              ) : null}

              {ownershipError && (
                <div
                  style={{
                    padding: '11px 14px',
                    borderRadius: 12,
                    background: 'rgba(91,15,22,0.08)',
                    border: '1px solid rgba(91,15,22,0.2)',
                    fontSize: 14,
                    color: COLORS.burgundy,
                    fontWeight: 600,
                  }}
                >
                  {ownershipError}
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => ownershipInputRef.current?.click()}
                  className="qk-press"
                  style={{
                    padding: '11px 20px',
                    fontSize: 14.5,
                    fontWeight: 700,
                    fontFamily: FONT,
                    color: COLORS.burgundy,
                    background: '#fff',
                    border: '1px solid rgba(91,15,22,0.3)',
                    borderRadius: 14,
                    cursor: 'pointer',
                  }}
                >
                  {form.ownership_doc
                    ? t('approval.chooseAnother')
                    : t('approval.uploadDoc')}
                </button>
              </div>
            </div>
          )}

          {/* STEP 7 — Photos & review ------------------------------------- */}
          {step === 6 && (
            <div style={{ display: 'grid', gap: 16 }}>
              <Field label="Photo URL 1">
                <input
                  style={inputStyle}
                  value={form.image1}
                  onChange={(e) => patch({ image1: e.target.value })}
                  placeholder="https://…/photo.jpg"
                  inputMode="url"
                />
              </Field>
              <Field label="Photo URL 2 (optional)">
                <input
                  style={inputStyle}
                  value={form.image2}
                  onChange={(e) => patch({ image2: e.target.value })}
                  placeholder="https://…/photo.jpg"
                  inputMode="url"
                />
              </Field>
              <Field label="Photo URL 3 (optional)">
                <input
                  style={inputStyle}
                  value={form.image3}
                  onChange={(e) => patch({ image3: e.target.value })}
                  placeholder="https://…/photo.jpg"
                  inputMode="url"
                />
              </Field>

              {/* Review summary card */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr',
                  gap: 16,
                  alignItems: 'start',
                  background: COLORS.tan,
                  border: '1px solid rgba(91,15,22,0.12)',
                  borderRadius: 18,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: 120,
                    aspectRatio: '4 / 3',
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: '#fff',
                    border: '1px solid rgba(42,34,32,0.08)',
                  }}
                >
                  {imageList[0] ? (
                    <img
                      src={imageList[0]}
                      alt="Listing preview"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  ) : (
                    <ImagePlaceholder iconSize={24} fontSize={11} />
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3
                    style={{
                      margin: '0 0 2px',
                      fontSize: 17,
                      fontWeight: 700,
                      color: COLORS.ink,
                    }}
                  >
                    {form.title.trim() || 'Untitled listing'}
                  </h3>
                  <p style={{ margin: 0, fontSize: 13, color: COLORS.muted }}>
                    {form.property_type}
                    {form.region ? ` · ${form.region}` : ''}
                    {form.location.trim() ? ` · ${form.location.trim()}` : ''}
                  </p>
                  <p style={{ margin: '10px 0 0', fontSize: 14 }}>
                    <span style={{ fontWeight: 700, color: COLORS.burgundy }}>
                      EGP {form.price_per_night || '0'}
                    </span>{' '}
                    <span style={{ color: COLORS.muted }}>/ night</span>
                    <span style={{ color: COLORS.muted }}>
                      {' '}
                      · {form.max_guests || '1'}{' '}
                      {Number(form.max_guests) === 1 ? 'guest' : 'guests'}
                    </span>
                  </p>
                  <p
                    style={{
                      margin: '6px 0 0',
                      fontSize: 12,
                      color: COLORS.muted,
                    }}
                  >
                    {pickedCoords ? (
                      <span
                        style={{
                          fontFamily:
                            '"Geist Mono", ui-monospace, SFMono-Regular, monospace',
                          fontWeight: 600,
                        }}
                      >
                        {pickedCoords.lat.toFixed(6)},{' '}
                        {pickedCoords.lng.toFixed(6)}
                      </span>
                    ) : (
                      'No pin set'
                    )}
                  </p>
                  <p
                    style={{
                      margin: '6px 0 0',
                      fontSize: 12,
                      color: COLORS.muted,
                    }}
                  >
                    {t('cancel.policy')}:{' '}
                    <span style={{ fontWeight: 700, color: COLORS.ink }}>
                      {t(
                        CANCELLATION_POLICIES.find(
                          (p) => p.value === form.cancellation_policy
                        )?.nameKey ?? 'cancel.moderate'
                      )}
                    </span>
                  </p>
                  <p
                    style={{
                      margin: '6px 0 0',
                      fontSize: 12,
                      color: COLORS.muted,
                    }}
                  >
                    {t('approval.ownershipDoc')}:{' '}
                    <span style={{ fontWeight: 700, color: COLORS.ink }}>
                      {form.ownership_doc ? '✓' : '—'}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {formError && (
            <div
              style={{
                marginTop: 16,
                padding: '11px 14px',
                borderRadius: 12,
                background: 'rgba(91,15,22,0.08)',
                border: '1px solid rgba(91,15,22,0.2)',
                fontSize: 14,
                color: COLORS.burgundy,
                fontWeight: 600,
              }}
            >
              {formError}
            </div>
          )}
          {formOk && (
            <div
              style={{
                marginTop: 16,
                padding: '11px 14px',
                borderRadius: 12,
                background: 'rgba(15,81,50,0.10)',
                border: '1px solid rgba(15,81,50,0.25)',
                fontSize: 14,
                color: '#0f5132',
                fontWeight: 600,
              }}
            >
              {formOk}
            </div>
          )}

          {/* Wizard controls ---------------------------------------------- */}
          <div
            style={{
              marginTop: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0 || submitting}
              className={step === 0 || submitting ? undefined : 'qk-press'}
              style={{
                padding: '12px 24px',
                fontSize: 15,
                fontWeight: 700,
                fontFamily: FONT,
                color: COLORS.burgundy,
                background: '#fff',
                border: `1px solid ${COLORS.burgundy}`,
                borderRadius: 14,
                cursor: step === 0 || submitting ? 'not-allowed' : 'pointer',
                opacity: step === 0 ? 0.4 : 1,
              }}
            >
              Back
            </button>

            <span style={{ fontSize: 13, color: COLORS.muted }}>
              Step {step + 1} of {WIZARD_STEPS.length}
            </span>

            {step < WIZARD_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                className="qk-press"
                style={{
                  padding: '12px 28px',
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: FONT,
                  color: '#fff',
                  background: GRAD_BURGUNDY,
                  border: 'none',
                  borderRadius: 14,
                  cursor: 'pointer',
                  boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
                }}
              >
                Next
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className={submitting ? undefined : 'qk-press qk-pulse'}
                style={{
                  padding: '12px 28px',
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: FONT,
                  color: '#fff',
                  background: GRAD_BURGUNDY,
                  border: 'none',
                  borderRadius: 14,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.6 : 1,
                  boxShadow: submitting ? 'none' : '0 10px 24px rgba(91,15,22,0.28)',
                }}
              >
                {submitting ? t('approval.submitting') : t('approval.submit')}
              </button>
            )}
          </div>
        </form>
      </Section>

      {/* b) Your listings ----------------------------------------------------- */}
      <Section title="Your listings" id="listings">
        {listingsLoading ? (
          <Muted>Loading your listings…</Muted>
        ) : listingsError ? (
          <RetryRow label="Couldn’t load your listings." onRetry={loadListings} />
        ) : listings.length === 0 ? (
          <Muted>You haven’t published any listings yet. Add one above.</Muted>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 18,
            }}
          >
            {listings.map((l) => {
              const cover = l.listing_images?.[0]?.url || null
              const availOpen = openAvailId === l.id
              return (
                <div
                  key={l.id}
                  style={{
                    background: '#fff',
                    borderRadius: 18,
                    overflow: 'hidden',
                    border: '1px solid rgba(42,34,32,0.06)',
                    boxShadow: '0 8px 22px rgba(42,34,32,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    // When the availability panel is open, let this card span the
                    // whole grid row so the manager has room to breathe.
                    gridColumn: availOpen ? '1 / -1' : 'auto',
                  }}
                >
                  <a
                    href={`/explore/${l.id}`}
                    className="qk-card"
                    style={{
                      display: 'block',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        aspectRatio: '4 / 3',
                        overflow: 'hidden',
                        background: COLORS.tan,
                      }}
                    >
                      {cover ? (
                        <img
                          src={cover}
                          alt={l.title}
                          loading="lazy"
                          className="qk-img-zoom"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                      ) : (
                        <ImagePlaceholder iconSize={28} fontSize={12} />
                      )}
                      {/* Moderation status — overlaid so the whole card stays a
                          single link. Defaults to approved for older rows that
                          predate the approval queue. */}
                      <span
                        style={{
                          position: 'absolute',
                          top: 10,
                          insetInlineStart: 10,
                        }}
                      >
                        <ApprovalBadge status={l.approval_status ?? 'approved'} />
                      </span>
                    </div>
                    <div style={{ padding: '12px 14px 8px' }}>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 15,
                          fontWeight: 700,
                          color: COLORS.ink,
                          lineHeight: 1.3,
                        }}
                      >
                        {l.title}
                      </h3>
                      {l.location && (
                        <p
                          style={{
                            margin: '4px 0 0',
                            fontSize: 13,
                            color: COLORS.muted,
                          }}
                        >
                          {l.location}
                        </p>
                      )}
                      <p style={{ margin: '10px 0 0', fontSize: 14 }}>
                        <span style={{ fontWeight: 700, color: COLORS.burgundy }}>
                          EGP {l.price_per_night}
                        </span>{' '}
                        <span style={{ color: COLORS.muted }}>/ night</span>
                      </p>
                    </div>
                  </a>

                  {/* Cancellation policy (inline editor) + Manage availability */}
                  <div
                    style={{
                      padding: '0 14px 14px',
                      marginTop: 'auto',
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    {/* Re-upload ownership doc — only when pending or rejected,
                        which re-queues the listing to pending. */}
                    {(l.approval_status === 'pending' ||
                      l.approval_status === 'rejected') && (
                      <OwnershipDocEditor
                        listingId={l.id}
                        status={l.approval_status}
                        onResubmitted={loadListings}
                      />
                    )}

                    <ListingPolicyEditor
                      listingId={l.id}
                      current={l.cancellation_policy ?? 'moderate'}
                    />

                    <ListingDiscountsEditor
                      listingId={l.id}
                      weekly={l.weekly_discount ?? 0}
                      monthly={l.monthly_discount ?? 0}
                    />

                    <ListingPricingEditor
                      listingId={l.id}
                      weekendPrice={l.weekend_price ?? null}
                      monthlyPrices={l.monthly_prices ?? {}}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setOpenAvailId((cur) => (cur === l.id ? null : l.id))
                      }
                      aria-expanded={availOpen}
                      className="qk-press"
                      style={{
                        width: '100%',
                        padding: '9px 14px',
                        fontSize: 13.5,
                        fontWeight: 700,
                        fontFamily: FONT,
                        color: availOpen ? '#fff' : COLORS.burgundy,
                        background: availOpen ? GRAD_BURGUNDY : COLORS.tan,
                        border: availOpen
                          ? '1px solid transparent'
                          : `1px solid ${COLORS.burgundy}`,
                        borderRadius: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {availOpen
                        ? t('availability.hide')
                        : t('availability.manage')}
                    </button>

                    {availOpen && <AvailabilityManager listingId={l.id} />}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* c) Reservation requests --------------------------------------------- */}
      <Section title="Reservation requests" id="reservations">
        {bookingsLoading ? (
          <Muted>Loading reservation requests…</Muted>
        ) : bookingsError ? (
          <RetryRow
            label="Couldn’t load reservation requests."
            onRetry={loadBookings}
          />
        ) : bookings.length === 0 ? (
          <Muted>No reservation requests yet.</Muted>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Pending first (actionable), then decided ones. */}
            {[...pending, ...decided].map((b) => {
              const isPending = (b.status || '').toLowerCase() === 'pending'
              const busy = actingId === b.id
              return (
                <article
                  key={b.id}
                  style={{
                    background: '#fff',
                    borderRadius: 18,
                    border: '1px solid rgba(42,34,32,0.06)',
                    boxShadow: '0 8px 22px rgba(42,34,32,0.08)',
                    padding: '16px 18px',
                  }}
                >
                  <div
                    className="qk-host-req-card"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 16,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 16,
                          fontWeight: 700,
                          color: COLORS.ink,
                        }}
                      >
                        {b.title}
                      </h3>
                      <StatusBadge status={b.status} />
                    </div>
                    {b.location && (
                      <p
                        style={{
                          margin: '3px 0 0',
                          fontSize: 13,
                          color: COLORS.muted,
                        }}
                      >
                        {b.location}
                      </p>
                    )}
                    <p
                      style={{
                        margin: '8px 0 0',
                        fontSize: 14,
                        color: COLORS.ink,
                      }}
                    >
                      {fmtDate(b.check_in)} → {fmtDate(b.check_out)} ·{' '}
                      {b.guests} {b.guests === 1 ? 'guest' : 'guests'} ·{' '}
                      <span style={{ fontWeight: 700, color: COLORS.burgundy }}>
                        EGP {b.total_price}
                      </span>
                    </p>
                    {b.reservation_code && (
                      <p
                        style={{
                          margin: '4px 0 0',
                          fontSize: 12,
                          color: COLORS.muted,
                        }}
                      >
                        Code{' '}
                        <span
                          style={{
                            fontFamily:
                              '"Geist Mono", ui-monospace, SFMono-Regular, monospace',
                            fontWeight: 600,
                            color: COLORS.ink,
                          }}
                        >
                          {b.reservation_code}
                        </span>
                      </p>
                    )}
                  </div>

                    <div
                      className="qk-host-req-actions"
                      style={{
                        display: 'flex',
                        gap: 10,
                        justifyContent: 'flex-end',
                        flexWrap: 'wrap',
                      }}
                    >
                      {isPending && (
                        <>
                          <button
                            type="button"
                            onClick={() => act(b.id, 'confirm')}
                            disabled={busy}
                            className={busy ? undefined : 'qk-press'}
                            style={{
                              padding: '9px 18px',
                              fontSize: 14,
                              fontWeight: 700,
                              fontFamily: FONT,
                              color: '#fff',
                              background: '#0f5132',
                              border: 'none',
                              borderRadius: 12,
                              cursor: busy ? 'not-allowed' : 'pointer',
                              opacity: busy ? 0.6 : 1,
                            }}
                          >
                            {busy ? '…' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => act(b.id, 'reject')}
                            disabled={busy}
                            className={busy ? undefined : 'qk-press'}
                            style={{
                              padding: '9px 18px',
                              fontSize: 14,
                              fontWeight: 700,
                              fontFamily: FONT,
                              color: COLORS.burgundy,
                              background: '#fff',
                              border: `1px solid ${COLORS.burgundy}`,
                              borderRadius: 12,
                              cursor: busy ? 'not-allowed' : 'pointer',
                              opacity: busy ? 0.6 : 1,
                            }}
                          >
                            {busy ? '…' : 'Reject'}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setOpenChatId((cur) => (cur === b.id ? null : b.id))
                        }
                        aria-expanded={openChatId === b.id}
                        className="qk-press"
                        style={{
                          padding: '9px 18px',
                          fontSize: 14,
                          fontWeight: 700,
                          fontFamily: FONT,
                          color: openChatId === b.id ? '#fff' : COLORS.burgundy,
                          background:
                            openChatId === b.id ? GRAD_BURGUNDY : COLORS.tan,
                          border:
                            openChatId === b.id
                              ? '1px solid transparent'
                              : `1px solid ${COLORS.burgundy}`,
                          borderRadius: 12,
                          cursor: 'pointer',
                        }}
                      >
                        {openChatId === b.id ? 'Hide chat' : 'Message guest'}
                      </button>
                    </div>
                  </div>

                  {openChatId === b.id && (
                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 16,
                        borderTop: '1px solid rgba(42,34,32,0.08)',
                      }}
                    >
                      <BookingChat bookingId={b.id} />
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </Section>

      {/* c2) Review your guests ---------------------------------------------- */}
      <Section title={t('reviews.reviewGuests')} id="guest-reviews">
        <p style={{ margin: '0 0 18px', fontSize: 14, color: COLORS.muted }}>
          {t('reviews.reviewGuestsSub')}
        </p>
        {guestReviewsLoading ? (
          <Muted>{t('reviews.loadingGuests')}</Muted>
        ) : reviewableGuests.length === 0 ? (
          <Muted>{t('reviews.noGuestsToReview')}</Muted>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {reviewableGuests.map((g) => (
              <article
                key={g.booking_id}
                style={{
                  background: '#fff',
                  borderRadius: 18,
                  border: '1px solid rgba(42,34,32,0.06)',
                  boxShadow: '0 8px 22px rgba(42,34,32,0.08)',
                  padding: '16px 18px',
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 700,
                    color: COLORS.ink,
                  }}
                >
                  {g.guest_name || t('reviews.anonymous')}
                </h3>
                <p style={{ margin: '3px 0 12px', fontSize: 13, color: COLORS.muted }}>
                  {g.title} · {fmtDate(g.check_out)}
                </p>
                <GuestReviewForm
                  bookingId={g.booking_id}
                  onSubmitted={() => onGuestReviewed(g.booking_id)}
                />
              </article>
            ))}
          </div>
        )}
      </Section>

      {/* d) Add a service ----------------------------------------------------- */}
      <Section title="Add a service">
        <p style={{ margin: '0 0 18px', fontSize: 14, color: COLORS.muted }}>
          Offer a standalone experience — a jet ski rental, a diving trip, a
          yacht charter. Guests subscribe and you confirm each request below.
        </p>
        <form onSubmit={handleCreateService}>
          <div
            className="qk-host-form-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16,
            }}
          >
            <Field className="qk-host-form-full" label="Title">
              <input
                style={inputStyle}
                value={svcForm.title}
                onChange={(e) => patchSvc({ title: e.target.value })}
                placeholder="Sunset jet ski rental"
                required
              />
            </Field>

            <Field className="qk-host-form-full" label="Description">
              <textarea
                style={{ ...inputStyle, minHeight: 84, resize: 'vertical' }}
                value={svcForm.description}
                onChange={(e) => patchSvc({ description: e.target.value })}
                placeholder="What does the experience include?"
              />
            </Field>

            <Field label="Category">
              <select
                style={{ ...inputStyle, appearance: 'auto' }}
                value={svcForm.category}
                onChange={(e) => patchSvc({ category: e.target.value })}
              >
                {SERVICE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Location">
              <input
                style={inputStyle}
                value={svcForm.location}
                onChange={(e) => patchSvc({ location: e.target.value })}
                placeholder="Marina Bay"
              />
            </Field>
            <Field label="Price (EGP)">
              <input
                style={inputStyle}
                type="number"
                min={1}
                value={svcForm.price}
                onChange={(e) => patchSvc({ price: e.target.value })}
                placeholder="120"
                required
              />
            </Field>

            <Field className="qk-host-form-full" label="Image URL">
              <input
                style={inputStyle}
                value={svcForm.image_url}
                onChange={(e) => patchSvc({ image_url: e.target.value })}
                placeholder="https://…/photo.jpg"
                inputMode="url"
              />
            </Field>
          </div>

          {svcFormError && (
            <div
              style={{
                marginTop: 16,
                padding: '11px 14px',
                borderRadius: 12,
                background: 'rgba(91,15,22,0.08)',
                border: '1px solid rgba(91,15,22,0.2)',
                fontSize: 14,
                color: COLORS.burgundy,
                fontWeight: 600,
              }}
            >
              {svcFormError}
            </div>
          )}
          {svcFormOk && (
            <div
              style={{
                marginTop: 16,
                padding: '11px 14px',
                borderRadius: 12,
                background: 'rgba(15,81,50,0.10)',
                border: '1px solid rgba(15,81,50,0.25)',
                fontSize: 14,
                color: '#0f5132',
                fontWeight: 600,
              }}
            >
              {svcFormOk}
            </div>
          )}

          <button
            type="submit"
            disabled={svcSubmitting}
            className={svcSubmitting ? undefined : 'qk-press'}
            style={{
              marginTop: 18,
              padding: '13px 28px',
              fontSize: 15,
              fontWeight: 700,
              fontFamily: FONT,
              color: '#fff',
              background: GRAD_BURGUNDY,
              border: 'none',
              borderRadius: 14,
              cursor: svcSubmitting ? 'not-allowed' : 'pointer',
              opacity: svcSubmitting ? 0.6 : 1,
              boxShadow: svcSubmitting ? 'none' : '0 10px 24px rgba(91,15,22,0.28)',
            }}
          >
            {svcSubmitting ? 'Publishing…' : 'Publish service'}
          </button>
        </form>
      </Section>

      {/* e) Your services ----------------------------------------------------- */}
      <Section title="Your services" id="services">
        {servicesLoading ? (
          <Muted>Loading your services…</Muted>
        ) : servicesError ? (
          <RetryRow label="Couldn’t load your services." onRetry={loadServices} />
        ) : services.length === 0 ? (
          <Muted>You haven’t published any services yet. Add one above.</Muted>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 18,
            }}
          >
            {services.map((s) => {
              const cover = s.image_url || null
              return (
                <a
                  key={s.id}
                  href={`/services/${s.id}`}
                  className="qk-card"
                  style={{
                    display: 'block',
                    background: '#fff',
                    borderRadius: 18,
                    overflow: 'hidden',
                    textDecoration: 'none',
                    color: 'inherit',
                    border: '1px solid rgba(42,34,32,0.06)',
                    boxShadow: '0 8px 22px rgba(42,34,32,0.08)',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '4 / 3',
                      overflow: 'hidden',
                      background: COLORS.tan,
                    }}
                  >
                    {cover ? (
                      <img
                        src={cover}
                        alt={s.title}
                        loading="lazy"
                        className="qk-img-zoom"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    ) : (
                      <ImagePlaceholder iconSize={28} fontSize={12} label="No photo" />
                    )}
                  </div>
                  <div style={{ padding: '12px 14px 16px' }}>
                    {s.category && (
                      <span
                        style={{
                          display: 'inline-block',
                          background: COLORS.tan,
                          color: COLORS.burgundy,
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: 999,
                          marginBottom: 8,
                        }}
                      >
                        {s.category}
                      </span>
                    )}
                    <h3
                      style={{
                        margin: 0,
                        fontSize: 15,
                        fontWeight: 700,
                        color: COLORS.ink,
                        lineHeight: 1.3,
                      }}
                    >
                      {s.title}
                    </h3>
                    {s.location && (
                      <p
                        style={{
                          margin: '4px 0 0',
                          fontSize: 13,
                          color: COLORS.muted,
                        }}
                      >
                        {s.location}
                      </p>
                    )}
                    <p style={{ margin: '10px 0 0', fontSize: 14 }}>
                      <span style={{ fontWeight: 700, color: COLORS.burgundy }}>
                        EGP {s.price}
                      </span>
                    </p>
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </Section>

      {/* f) Service requests -------------------------------------------------- */}
      <Section title="Service requests">
        {svcRequestsLoading ? (
          <Muted>Loading service requests…</Muted>
        ) : svcRequestsError ? (
          <RetryRow
            label="Couldn’t load service requests."
            onRetry={loadServiceRequests}
          />
        ) : svcRequests.length === 0 ? (
          <Muted>No service requests yet.</Muted>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Pending first (actionable), then decided ones. */}
            {[...svcPending, ...svcDecided].map((r) => {
              const isPending = (r.status || '').toLowerCase() === 'pending'
              const busy = svcActingId === r.id
              const prefDate = r.preferred_date ? fmtDate(r.preferred_date) : null
              return (
                <article
                  key={r.id}
                  style={{
                    background: '#fff',
                    borderRadius: 18,
                    border: '1px solid rgba(42,34,32,0.06)',
                    boxShadow: '0 8px 22px rgba(42,34,32,0.08)',
                    padding: '16px 18px',
                  }}
                >
                  <div
                    className="qk-host-req-card"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 16,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          flexWrap: 'wrap',
                        }}
                      >
                        <h3
                          style={{
                            margin: 0,
                            fontSize: 16,
                            fontWeight: 700,
                            color: COLORS.ink,
                          }}
                        >
                          {r.service_title}
                        </h3>
                        <StatusBadge status={r.status} />
                      </div>
                      <p
                        style={{
                          margin: '3px 0 0',
                          fontSize: 13,
                          color: COLORS.muted,
                        }}
                      >
                        {r.requester_name || r.requester_email || 'A guest'}
                        {r.service_location ? ` · ${r.service_location}` : ''}
                      </p>
                      <p
                        style={{
                          margin: '8px 0 0',
                          fontSize: 14,
                          color: COLORS.ink,
                        }}
                      >
                        {prefDate ? `${prefDate} · ` : ''}
                        <span style={{ fontWeight: 700, color: COLORS.burgundy }}>
                          EGP {r.service_price}
                        </span>
                      </p>
                      {r.note && (
                        <p
                          style={{
                            margin: '6px 0 0',
                            fontSize: 13,
                            color: COLORS.muted,
                            fontStyle: 'italic',
                          }}
                        >
                          “{r.note}”
                        </p>
                      )}
                      {r.request_code && (
                        <p
                          style={{
                            margin: '4px 0 0',
                            fontSize: 12,
                            color: COLORS.muted,
                          }}
                        >
                          Code{' '}
                          <span
                            style={{
                              fontFamily:
                                '"Geist Mono", ui-monospace, SFMono-Regular, monospace',
                              fontWeight: 600,
                              color: COLORS.ink,
                            }}
                          >
                            {r.request_code}
                          </span>
                        </p>
                      )}
                    </div>

                    <div
                      className="qk-host-req-actions"
                      style={{
                        display: 'flex',
                        gap: 10,
                        justifyContent: 'flex-end',
                        flexWrap: 'wrap',
                      }}
                    >
                      {isPending && (
                        <>
                          <button
                            type="button"
                            onClick={() => actService(r.id, 'confirm')}
                            disabled={busy}
                            className={busy ? undefined : 'qk-press'}
                            style={{
                              padding: '9px 18px',
                              fontSize: 14,
                              fontWeight: 700,
                              fontFamily: FONT,
                              color: '#fff',
                              background: '#0f5132',
                              border: 'none',
                              borderRadius: 12,
                              cursor: busy ? 'not-allowed' : 'pointer',
                              opacity: busy ? 0.6 : 1,
                            }}
                          >
                            {busy ? '…' : 'Accept'}
                          </button>
                          <button
                            type="button"
                            onClick={() => actService(r.id, 'reject')}
                            disabled={busy}
                            className={busy ? undefined : 'qk-press'}
                            style={{
                              padding: '9px 18px',
                              fontSize: 14,
                              fontWeight: 700,
                              fontFamily: FONT,
                              color: COLORS.burgundy,
                              background: '#fff',
                              border: `1px solid ${COLORS.burgundy}`,
                              borderRadius: 12,
                              cursor: busy ? 'not-allowed' : 'pointer',
                              opacity: busy ? 0.6 : 1,
                            }}
                          >
                            {busy ? '…' : 'Reject'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </Section>
    </Shell>
  )
}

// ---- Earnings & payouts (mock) ---------------------------------------------

// Host earnings dashboard: three stat cards (total earned / paid out / pending)
// + a per-booking breakdown. All amounts come from the backend in EGP and are
// rendered through the currency formatter so they follow the chosen display
// currency. Lives at the top of the host dashboard (anchor #earnings).
// ---- Analytics dashboard ----------------------------------------------------

// Format a "YYYY-MM" month key into a short localized label (e.g. "Mar 2026").
function fmtMonthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-').map((p) => Number(p))
  if (!y || !m) return month
  const date = new Date(y, m - 1, 1)
  if (Number.isNaN(date.getTime())) return month
  return date.toLocaleDateString(locale, { month: 'short', year: 'numeric' })
}

// The host analytics section: stat cards (listings, total/paid bookings,
// revenue, avg rating, conversion %), a monthly revenue/bookings trend (a bar
// list — no chart lib), and a "Top listings" leaderboard.
function AnalyticsPanel({
  analytics,
  loading,
  error,
  onRetry,
}: {
  analytics: HostAnalytics | null
  loading: boolean
  error: boolean
  onRetry: () => void
}) {
  const { t, lang } = useLanguage()
  const { format } = useCurrency()
  const locale = lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US'

  // Has the host actually done anything yet? When everything is zero/empty we
  // show the friendly "no data" note instead of a wall of zeros.
  const hasData =
    !!analytics &&
    (analytics.totalBookings > 0 ||
      analytics.revenue > 0 ||
      analytics.listings > 0 ||
      analytics.byMonth.length > 0)

  // Largest monthly revenue → scales the trend bars (fallback to bookings, then
  // to 1 so a divide-by-zero never produces NaN widths).
  const maxMonthRevenue = analytics
    ? Math.max(0, ...analytics.byMonth.map((m) => m.revenue))
    : 0
  const maxMonthBookings = analytics
    ? Math.max(0, ...analytics.byMonth.map((m) => m.bookings))
    : 0
  const trendBasis =
    maxMonthRevenue > 0 ? 'revenue' : maxMonthBookings > 0 ? 'bookings' : 'none'

  const maxTopRevenue = analytics
    ? Math.max(0, ...analytics.topListings.map((l) => l.revenue))
    : 0

  return (
    <Section title={t('analytics.title')} id="analytics">
      <p style={{ margin: '0 0 18px', fontSize: 14, color: COLORS.muted }}>
        {t('analytics.subtitle')}
      </p>

      {loading ? (
        <Muted>{t('money.loading')}</Muted>
      ) : error || !analytics ? (
        <RetryRow label={t('analytics.error')} onRetry={onRetry} />
      ) : !hasData ? (
        <Muted>{t('analytics.noData')}</Muted>
      ) : (
        <>
          {/* Stat cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 14,
            }}
          >
            <StatCard
              label={t('analytics.revenue')}
              value={format(analytics.revenue)}
              accent
            />
            <StatCard
              label={t('analytics.bookings')}
              value={String(analytics.totalBookings)}
            />
            <StatCard
              label={t('analytics.paidBookings')}
              value={String(analytics.paidBookings)}
            />
            <StatCard
              label={t('analytics.listings')}
              value={String(analytics.listings)}
            />
            <StatCard
              label={t('analytics.avgRating')}
              value={
                analytics.reviewCount > 0
                  ? `★ ${analytics.avgRating.toFixed(1)}`
                  : '—'
              }
            />
            <StatCard
              label={t('analytics.conversion')}
              value={`${Math.round(analytics.conversionRate * 100)}%`}
            />
          </div>

          {analytics.reviewCount > 0 && (
            <p style={{ margin: '14px 0 0', fontSize: 12.5, color: COLORS.muted }}>
              {t('analytics.reviews', { count: analytics.reviewCount })}
            </p>
          )}

          {/* Monthly trend — bar list sized by revenue (or bookings) */}
          {analytics.byMonth.length > 0 && trendBasis !== 'none' && (
            <>
              <h3
                style={{
                  margin: '24px 0 4px',
                  fontSize: 14,
                  fontWeight: 700,
                  color: COLORS.ink,
                }}
              >
                {t('analytics.monthlyTrend')}
              </h3>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: COLORS.muted }}>
                {trendBasis === 'revenue'
                  ? t('analytics.byRevenue')
                  : t('analytics.bookings')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {analytics.byMonth.map((m) => {
                  const basisMax =
                    trendBasis === 'revenue' ? maxMonthRevenue : maxMonthBookings
                  const basisVal =
                    trendBasis === 'revenue' ? m.revenue : m.bookings
                  const pct =
                    basisMax > 0
                      ? Math.max(4, Math.round((basisVal / basisMax) * 100))
                      : 0
                  return (
                    <div
                      key={m.month}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '92px 1fr auto',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: COLORS.muted,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {fmtMonthLabel(m.month, locale)}
                      </span>
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'relative',
                          height: 14,
                          borderRadius: 999,
                          background: COLORS.tan,
                          overflow: 'hidden',
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            insetInlineStart: 0,
                            top: 0,
                            bottom: 0,
                            width: `${pct}%`,
                            borderRadius: 999,
                            background: GRAD_BURGUNDY,
                          }}
                        />
                      </span>
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: COLORS.ink,
                          textAlign: 'end',
                          whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {format(m.revenue)}
                        <span
                          style={{
                            color: COLORS.muted,
                            fontWeight: 600,
                            marginInlineStart: 6,
                          }}
                        >
                          ·{' '}
                          {t(
                            m.bookings === 1
                              ? 'analytics.bookingShort'
                              : 'analytics.bookingsShort',
                            { count: m.bookings }
                          )}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Top listings leaderboard */}
          {analytics.topListings.length > 0 && (
            <>
              <h3
                style={{
                  margin: '24px 0 12px',
                  fontSize: 14,
                  fontWeight: 700,
                  color: COLORS.ink,
                }}
              >
                {t('analytics.topListings')}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {analytics.topListings.map((l, i) => {
                  const pct =
                    maxTopRevenue > 0
                      ? Math.max(4, Math.round((l.revenue / maxTopRevenue) * 100))
                      : 0
                  return (
                    <div
                      key={`${l.title}-${i}`}
                      style={{
                        background: COLORS.cream,
                        border: '1px solid rgba(42,34,32,0.06)',
                        borderRadius: 16,
                        padding: '12px 16px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 9,
                            minWidth: 0,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              flex: '0 0 auto',
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              fontWeight: 800,
                              color: '#fff',
                              background:
                                i === 0
                                  ? 'linear-gradient(135deg,#B07A2A,#d8a55a)'
                                  : COLORS.burgundy,
                            }}
                          >
                            {i + 1}
                          </span>
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: COLORS.ink,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {l.title}
                          </span>
                        </span>
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            color: COLORS.burgundy,
                            whiteSpace: 'nowrap',
                            flex: '0 0 auto',
                          }}
                        >
                          {format(l.revenue)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          alignItems: 'center',
                          gap: 12,
                          marginTop: 8,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            position: 'relative',
                            height: 10,
                            borderRadius: 999,
                            background: COLORS.tan,
                            overflow: 'hidden',
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              insetInlineStart: 0,
                              top: 0,
                              bottom: 0,
                              width: `${pct}%`,
                              borderRadius: 999,
                              background:
                                'linear-gradient(135deg,#B07A2A,#d8a55a)',
                            }}
                          />
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: COLORS.muted,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t(
                            l.bookings === 1
                              ? 'analytics.bookingShort'
                              : 'analytics.bookingsShort',
                            { count: l.bookings }
                          )}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </Section>
  )
}

function EarningsPanel({
  earnings,
  loading,
  error,
  onRetry,
}: {
  earnings: HostEarnings | null
  loading: boolean
  error: boolean
  onRetry: () => void
}) {
  const { t, lang } = useLanguage()
  const { format } = useCurrency()
  const locale = lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US'

  function fmtRowDate(d: string): string {
    const date = new Date(d + 'T00:00:00')
    if (Number.isNaN(date.getTime())) return d
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  }

  function fmtPaidAt(iso: string | null): string | null {
    if (!iso) return null
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <Section title={t('money.earnings')} id="earnings">
      <p style={{ margin: '0 0 18px', fontSize: 14, color: COLORS.muted }}>
        {t('money.earningsSubtitle')}
      </p>

      {loading ? (
        <Muted>{t('money.loading')}</Muted>
      ) : error || !earnings ? (
        <RetryRow label={t('money.earningsError')} onRetry={onRetry} />
      ) : (
        <>
          {/* Stat cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 14,
            }}
          >
            <StatCard
              label={t('money.totalEarned')}
              value={format(earnings.totalEarned)}
              accent
            />
            <StatCard label={t('money.paidOut')} value={format(earnings.paidOut)} />
            <StatCard label={t('money.pending')} value={format(earnings.pending)} />
          </div>

          <p style={{ margin: '14px 0 0', fontSize: 12.5, color: COLORS.muted }}>
            {t('money.commissionNote', {
              percent: Math.round((1 - earnings.commissionRate) * 100),
            })}{' '}
            · {t('money.bookingsCount')}: {earnings.bookingsCount}
          </p>

          {/* Per-booking breakdown */}
          <h3
            style={{
              margin: '24px 0 12px',
              fontSize: 14,
              fontWeight: 700,
              color: COLORS.ink,
            }}
          >
            {t('money.recentPayouts')}
          </h3>

          {earnings.recent.length === 0 ? (
            <Muted>{t('money.noEarnings')}</Muted>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {earnings.recent.map((row) => {
                const paidAt = fmtPaidAt(row.paid_at)
                return (
                  <div
                    key={row.booking_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 14,
                      flexWrap: 'wrap',
                      background: COLORS.cream,
                      border: '1px solid rgba(42,34,32,0.06)',
                      borderRadius: 16,
                      padding: '14px 16px',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 14.5,
                          fontWeight: 700,
                          color: COLORS.ink,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.title}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: COLORS.muted }}>
                        {fmtRowDate(row.check_in)} – {fmtRowDate(row.check_out)}
                        {paidAt ? ` · ${t('money.paidOn')} ${paidAt}` : ''}
                      </p>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        flex: '0 0 auto',
                      }}
                    >
                      <div style={{ textAlign: 'end' }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 15,
                            fontWeight: 800,
                            color: COLORS.burgundy,
                          }}
                        >
                          {format(row.net)}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 11.5, color: COLORS.muted }}>
                          {t('money.net')} · {t('money.gross')} {format(row.gross)}
                        </p>
                      </div>
                      <EarningStatusBadge status={row.status} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </Section>
  )
}

// A single earnings stat tile (label + big value). `accent` paints the value
// burgundy for the headline "Total earned" card.
function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div
      style={{
        background: COLORS.cream,
        border: '1px solid rgba(42,34,32,0.06)',
        borderRadius: 18,
        padding: '16px 18px',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: COLORS.muted,
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: '8px 0 0',
          fontSize: 'clamp(20px, 3vw, 26px)',
          fontWeight: 800,
          color: accent ? COLORS.burgundy : COLORS.ink,
          lineHeight: 1.1,
        }}
      >
        {value}
      </p>
    </div>
  )
}

// Payout status pill: green "Paid out" vs gold "Upcoming". Labels localized.
function EarningStatusBadge({ status }: { status: 'paid_out' | 'upcoming' }) {
  const { t } = useLanguage()
  const paid = status === 'paid_out'
  return (
    <span
      style={{
        display: 'inline-block',
        background: paid ? 'rgba(15,81,50,0.12)' : 'rgba(176,122,42,0.16)',
        color: paid ? '#0f5132' : '#8a5a00',
        fontSize: 12,
        fontWeight: 700,
        padding: '4px 12px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        flex: '0 0 auto',
      }}
    >
      {paid ? t('money.status.paidOut') : t('money.status.upcoming')}
    </span>
  )
}

// ---- Small presentational helpers ------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.page,
        color: COLORS.ink,
        fontFamily: FONT,
      }}
    >
      <header
        style={{
          background: `linear-gradient(180deg, ${COLORS.tan} 0%, ${COLORS.page} 100%)`,
          borderBottom: '1px solid rgba(91,15,22,0.10)',
          padding: '20px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 980,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <a
            href="/explore"
            style={{ display: 'inline-flex', alignItems: 'center' }}
          >
            <img
              src="/logo.png"
              alt="QuickIn"
              height={40}
              style={{ height: 40, width: 'auto', display: 'block' }}
            />
          </a>
          <a
            href="/explore"
            style={{
              color: COLORS.burgundy,
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            ← Back to Explore
          </a>
        </div>
      </header>

      <section
        style={{ maxWidth: 980, margin: '0 auto', padding: '36px 24px 72px' }}
      >
        {children}
      </section>
    </main>
  )
}

function Section({
  title,
  id,
  children,
}: {
  title: string
  // Optional anchor target so the role-aware host nav can deep-link to a
  // section (e.g. /host#reservations). scroll-margin-top keeps the heading
  // clear of the sticky-ish header when jumped to.
  id?: string
  children: React.ReactNode
}) {
  return (
    <div
      id={id}
      style={{
        background: '#fff',
        borderRadius: 22,
        border: '1px solid rgba(42,34,32,0.06)',
        boxShadow: '0 8px 22px rgba(42,34,32,0.08)',
        padding: '24px 24px 26px',
        marginBottom: 24,
        scrollMarginTop: 90,
      }}
    >
      <h2
        style={{
          margin: '0 0 18px',
          fontSize: 19,
          fontWeight: 700,
          color: COLORS.ink,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 4,
            height: 18,
            borderRadius: 999,
            background: 'linear-gradient(135deg,#B07A2A,#d8a55a)',
          }}
        />
        {title}
      </h2>
      {children}
    </div>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={className} style={{ display: 'block' }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: 14, color: COLORS.muted }}>{children}</p>
}

// A labelled +/- number stepper for the add-listing "Details" step (guests,
// bedrooms, beds, bathrooms). The CURRENT VALUE renders between the two round
// buttons; tapping − / + steps it within [min, max]. The value is kept as a
// string in the parent form state (so it serializes straight into the POST
// body), so we parse → clamp → write back a string on every change. A NaN /
// blank value is treated as `min` so the control can never get stuck empty.
function Stepper({
  label,
  value,
  min = 0,
  max = 50,
  onChange,
}: {
  label: string
  value: string
  min?: number
  max?: number
  onChange: (next: string) => void
}) {
  const current = Number(value)
  const n = Number.isFinite(current) ? current : min
  const clamp = (x: number) => Math.max(min, Math.min(max, x))
  const set = (x: number) => onChange(String(clamp(x)))

  const btn = (disabled: boolean): React.CSSProperties => ({
    flex: '0 0 auto',
    width: 40,
    height: 40,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    lineHeight: 1,
    fontWeight: 700,
    fontFamily: FONT,
    color: disabled ? 'rgba(91,15,22,0.35)' : COLORS.burgundy,
    background: '#fff',
    border: `1px solid ${disabled ? 'rgba(91,15,22,0.25)' : COLORS.burgundy}`,
    cursor: disabled ? 'not-allowed' : 'pointer',
    userSelect: 'none',
    padding: 0,
  })

  const atMin = n <= min
  const atMax = n >= max

  return (
    <div>
      <span style={labelStyle}>{label}</span>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '6px 10px',
          background: '#fff',
          border: '1px solid rgba(42,34,32,0.14)',
          borderRadius: 14,
        }}
      >
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          onClick={() => set(n - 1)}
          disabled={atMin}
          style={btn(atMin)}
        >
          −
        </button>
        <span
          aria-live="polite"
          style={{
            minWidth: 28,
            textAlign: 'center',
            fontSize: 18,
            fontWeight: 700,
            color: COLORS.ink,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {clamp(n)}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          onClick={() => set(n + 1)}
          disabled={atMax}
          style={btn(atMax)}
        >
          +
        </button>
      </div>
    </div>
  )
}

// Inline cancellation-policy selector shown on each "Your listings" card. Picks
// one of the three policies and PATCHes /api/local/listings/:id immediately
// (optimistic — reverts on failure). Matches the inline-editor feel of the
// availability manager. `current` seeds the control from the loaded listing.
function ListingPolicyEditor({
  listingId,
  current,
}: {
  listingId: string
  current: CancellationPolicy
}) {
  const { t } = useLanguage()
  const [policy, setPolicy] = useState<CancellationPolicy>(current)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep in sync if the parent list reloads with a new value.
  useEffect(() => {
    setPolicy(current)
  }, [current])

  async function change(next: CancellationPolicy) {
    if (next === policy || saving) return
    const token = getToken()
    if (!token) {
      setError(t('availability.signInRequired'))
      return
    }
    const prev = policy
    setPolicy(next)
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await updateListingPolicy(token, listingId, next)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setPolicy(prev) // revert the optimistic change
      setError(t('cancel.error'))
    } finally {
      setSaving(false)
    }
  }

  const selectId = `policy-${listingId}`
  const desc = CANCELLATION_POLICIES.find((p) => p.value === policy)?.descKey

  return (
    <div>
      <label
        htmlFor={selectId}
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: COLORS.muted,
          marginBottom: 6,
        }}
      >
        {t('cancel.policyLabel')}
      </label>
      <select
        id={selectId}
        value={policy}
        disabled={saving}
        onChange={(e) => change(e.target.value as CancellationPolicy)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '9px 12px',
          fontSize: 13.5,
          fontFamily: FONT,
          fontWeight: 600,
          color: COLORS.ink,
          background: '#fff',
          border: '1px solid rgba(42,34,32,0.16)',
          borderRadius: 12,
          appearance: 'auto',
          cursor: saving ? 'wait' : 'pointer',
        }}
      >
        {CANCELLATION_POLICIES.map((p) => (
          <option key={p.value} value={p.value}>
            {t(p.nameKey)}
          </option>
        ))}
      </select>
      {desc && (
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 12,
            color: error ? COLORS.burgundy : COLORS.muted,
            lineHeight: 1.45,
          }}
        >
          {error ? error : saved ? `✓ ${t(desc)}` : t(desc)}
        </p>
      )}
    </div>
  )
}

// A small "% off" number input used in the add-listing Details step. Keeps the
// value as a string in the parent form; clamps display to a sane range on blur.
function PercentField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ position: 'relative' }}>
        <input
          style={{ ...inputStyle, paddingInlineEnd: 34 }}
          type="number"
          min={0}
          max={90}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(String(clampPercent(e.target.value)))}
          placeholder="0"
          inputMode="numeric"
        />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            insetInlineEnd: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 14,
            fontWeight: 700,
            color: COLORS.muted,
            pointerEvents: 'none',
          }}
        >
          %
        </span>
      </div>
    </label>
  )
}

// A small optional nightly-price input (EGP) used by the seasonal-pricing grid
// in the wizard and the inline editor. Keeps the value as a string in the
// parent; a blank box means "no override" (falls back to the base price). A
// leading "EGP" affordance sits inside the field; the placeholder hints "Base".
function PriceField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (next: string) => void
}) {
  const { t } = useLanguage()
  return (
    <label style={{ display: 'block' }}>
      <span
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 700,
          color: COLORS.muted,
          marginBottom: 5,
        }}
      >
        {label}
      </span>
      <div style={{ position: 'relative' }}>
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            insetInlineStart: 11,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 11.5,
            fontWeight: 700,
            color: COLORS.muted,
            pointerEvents: 'none',
          }}
        >
          EGP
        </span>
        <input
          style={{
            ...inputStyle,
            paddingInlineStart: 42,
            paddingTop: 9,
            paddingBottom: 9,
            fontSize: 13.5,
          }}
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('pricing.base')}
          inputMode="numeric"
          aria-label={label}
        />
      </div>
    </label>
  )
}

// Inline length-of-stay discount editor shown on each "Your listings" card. Two
// "% off" inputs (weekly ≥7 nights, monthly ≥28 nights) with a Save button that
// PATCHes /api/local/listings/:id. Mirrors the policy editor's inline feel and
// seeds from the loaded listing's values.
function ListingDiscountsEditor({
  listingId,
  weekly,
  monthly,
}: {
  listingId: string
  weekly: number
  monthly: number
}) {
  const { t } = useLanguage()
  const [weeklyVal, setWeeklyVal] = useState(String(weekly))
  const [monthlyVal, setMonthlyVal] = useState(String(monthly))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep in sync if the parent list reloads with new values.
  useEffect(() => {
    setWeeklyVal(String(weekly))
    setMonthlyVal(String(monthly))
  }, [weekly, monthly])

  const dirty =
    clampPercent(weeklyVal) !== weekly || clampPercent(monthlyVal) !== monthly

  async function save() {
    if (saving || !dirty) return
    const token = getToken()
    if (!token) {
      setError(t('availability.signInRequired'))
      return
    }
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const w = clampPercent(weeklyVal)
      const m = clampPercent(monthlyVal)
      await updateListingDiscounts(token, listingId, {
        weekly_discount: w,
        monthly_discount: m,
      })
      // Normalize the inputs to the saved (clamped) values.
      setWeeklyVal(String(w))
      setMonthlyVal(String(m))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError(t('growth.discountsError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <span style={labelStyle}>{t('growth.discounts')}</span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <PercentField
          label={t('growth.weeklyHint')}
          value={weeklyVal}
          onChange={setWeeklyVal}
        />
        <PercentField
          label={t('growth.monthlyHint')}
          value={monthlyVal}
          onChange={setMonthlyVal}
        />
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving || !dirty}
        className={saving || !dirty ? undefined : 'qk-press'}
        style={{
          marginTop: 8,
          width: '100%',
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 700,
          fontFamily: FONT,
          color: saving || !dirty ? COLORS.muted : COLORS.burgundy,
          background: '#fff',
          border: `1px solid ${saving || !dirty ? 'rgba(42,34,32,0.16)' : COLORS.burgundy}`,
          borderRadius: 12,
          cursor: saving || !dirty ? 'default' : 'pointer',
        }}
      >
        {saving ? t('growth.saving') : t('growth.save')}
      </button>
      {(saved || error) && (
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 12,
            color: error ? COLORS.burgundy : '#0f5132',
            fontWeight: 600,
          }}
        >
          {error ? error : `✓ ${t('growth.discountsSaved')}`}
        </p>
      )}
    </div>
  )
}

// Inline seasonal-pricing editor shown (collapsed by default) on each "Your
// listings" card. A weekend (Fri/Sat) nightly input + a 12-month grid of
// optional per-month nightly overrides, with a Save button that PATCHes
// /api/local/listings/:id via updateListingPricing. Mirrors the discounts
// editor's inline feel and seeds from the loaded listing. Blank inputs clear the
// override (weekend → null, that month dropped from the map).
function ListingPricingEditor({
  listingId,
  weekendPrice,
  monthlyPrices,
}: {
  listingId: string
  weekendPrice: number | null
  monthlyPrices: MonthlyPrices
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [weekendVal, setWeekendVal] = useState(
    weekendPrice != null && weekendPrice > 0 ? String(weekendPrice) : ''
  )
  const [monthVals, setMonthVals] = useState<string[]>(
    monthlyPricesToInputs(monthlyPrices)
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep in sync if the parent list reloads with new values.
  useEffect(() => {
    setWeekendVal(
      weekendPrice != null && weekendPrice > 0 ? String(weekendPrice) : ''
    )
    setMonthVals(monthlyPricesToInputs(monthlyPrices))
  }, [weekendPrice, monthlyPrices])

  const nextWeekend = parsePriceOrNull(weekendVal)
  const currentWeekend = weekendPrice != null && weekendPrice > 0 ? weekendPrice : null
  const nextMonthly = buildMonthlyPrices(monthVals)
  const dirty =
    nextWeekend !== currentWeekend ||
    !monthlyPricesEqual(nextMonthly, monthlyPrices ?? {})

  // How many month overrides are set — shown as a hint on the collapsed toggle.
  const setCount = Object.keys(nextMonthly).length

  async function save() {
    if (saving || !dirty) return
    const token = getToken()
    if (!token) {
      setError(t('availability.signInRequired'))
      return
    }
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await updateListingPricing(token, listingId, {
        weekend_price: nextWeekend,
        monthly_prices: nextMonthly,
      })
      // Normalize inputs to the saved values.
      setWeekendVal(nextWeekend != null ? String(nextWeekend) : '')
      setMonthVals(monthlyPricesToInputs(nextMonthly))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError(t('pricing.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="qk-press"
        style={{
          width: '100%',
          padding: '8px 12px',
          fontSize: 12.5,
          fontWeight: 700,
          fontFamily: FONT,
          color: COLORS.burgundy,
          background: '#fff',
          border: `1px solid ${COLORS.burgundy}`,
          borderRadius: 12,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span>{t('pricing.seasonal')}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.muted }}>
          {open
            ? '▾'
            : currentWeekend || setCount > 0
              ? t('pricing.activeBadge')
              : '▸'}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ maxWidth: 200 }}>
            <PriceField
              label={t('pricing.weekendPrice')}
              value={weekendVal}
              onChange={setWeekendVal}
            />
          </div>
          <span style={{ ...labelStyle, marginTop: 12 }}>
            {t('pricing.monthlyPrices')}
          </span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
            }}
          >
            {MONTHS.map((m, i) => (
              <PriceField
                key={m.key}
                label={t(m.key)}
                value={monthVals[i]}
                onChange={(v) =>
                  setMonthVals((prev) => prev.map((mv, j) => (j === i ? v : mv)))
                }
              />
            ))}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className={saving || !dirty ? undefined : 'qk-press'}
            style={{
              marginTop: 10,
              width: '100%',
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: FONT,
              color: saving || !dirty ? COLORS.muted : COLORS.burgundy,
              background: '#fff',
              border: `1px solid ${saving || !dirty ? 'rgba(42,34,32,0.16)' : COLORS.burgundy}`,
              borderRadius: 12,
              cursor: saving || !dirty ? 'default' : 'pointer',
            }}
          >
            {saving ? t('growth.saving') : t('pricing.save')}
          </button>
          {(saved || error) && (
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 12,
                color: error ? COLORS.burgundy : '#0f5132',
                fontWeight: 600,
              }}
            >
              {error ? error : `✓ ${t('pricing.saved')}`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Inline ownership-document (re)uploader shown on a pending/rejected listing's
// card. Picks an image, downscales it (~1200px), PATCHes /api/local/listings/:id
// with { ownership_doc } — which re-queues the listing to pending — then asks the
// parent to reload so the badge refreshes. A short note explains the current
// state (rejected listings get a stronger nudge to re-submit).
function OwnershipDocEditor({
  listingId,
  status,
  onResubmitted,
}: {
  listingId: string
  status: ApprovalStatus
  onResubmitted: () => void
}) {
  const { t } = useLanguage()
  const inputRef = useRef<HTMLInputElement>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    const token = getToken()
    if (!token) {
      setError(t('availability.signInRequired'))
      return
    }
    setError(null)
    setOk(false)
    setSubmitting(true)
    try {
      const dataUrl = await downscaleToDataUrl(file, 1200)
      await submitOwnershipDoc(token, listingId, dataUrl)
      setOk(true)
      onResubmitted()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setError(
        /large|size|400/i.test(msg)
          ? t('approval.tooLarge')
          : t('approval.submitError')
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 12,
        background:
          status === 'rejected' ? 'rgba(91,15,22,0.06)' : 'rgba(176,122,42,0.10)',
        border: `1px solid ${
          status === 'rejected'
            ? 'rgba(91,15,22,0.20)'
            : 'rgba(176,122,42,0.30)'
        }`,
      }}
    >
      <p
        style={{
          margin: '0 0 8px',
          fontSize: 12,
          lineHeight: 1.45,
          color: status === 'rejected' ? COLORS.burgundy : '#8a5a00',
          fontWeight: 600,
        }}
      >
        {ok
          ? t('approval.resubmitted')
          : status === 'rejected'
            ? t('approval.rejectedNote')
            : t('approval.pendingNote')}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handlePick}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={submitting}
        className={submitting ? undefined : 'qk-press'}
        style={{
          width: '100%',
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 700,
          fontFamily: FONT,
          color: COLORS.burgundy,
          background: '#fff',
          border: `1px solid ${COLORS.burgundy}`,
          borderRadius: 12,
          cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? t('approval.submitting') : t('approval.reupload')}
      </button>
      {error && (
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 12,
            color: COLORS.burgundy,
            fontWeight: 600,
          }}
        >
          {error}
        </p>
      )}
    </div>
  )
}

function RetryRow({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
        fontSize: 14,
        color: COLORS.burgundy,
      }}
    >
      <span style={{ fontWeight: 600 }}>{label}</span>
      <button
        type="button"
        onClick={onRetry}
        style={{
          appearance: 'none',
          border: `1px solid ${COLORS.burgundy}`,
          background: '#fff',
          color: COLORS.burgundy,
          fontWeight: 700,
          fontSize: 13,
          fontFamily: FONT,
          borderRadius: 999,
          padding: '6px 16px',
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  )
}

function Notice({
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  title: string
  body: string
  ctaHref: string
  ctaLabel: string
}) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 24px', color: COLORS.muted }}>
      <h1
        style={{
          margin: 0,
          fontFamily: '"Playfair Display", Georgia, serif',
          fontSize: 30,
          fontWeight: 700,
          color: COLORS.burgundy,
        }}
      >
        {title}
      </h1>
      <p style={{ margin: '12px auto 22px', fontSize: 15, maxWidth: 440 }}>
        {body}
      </p>
      <a
        href={ctaHref}
        className="qk-press"
        style={{
          display: 'inline-block',
          color: '#fff',
          background: GRAD_BURGUNDY,
          textDecoration: 'none',
          fontWeight: 700,
          padding: '12px 26px',
          borderRadius: 999,
          boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
        }}
      >
        {ctaLabel}
      </a>
    </div>
  )
}
