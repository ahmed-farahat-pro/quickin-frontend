'use client'

// Host dashboard (UI-only) — gated client-side to role 'host' | 'admin' read
// from the qk_user persisted in localStorage. Talks to the backend with the
// bearer token in qk_token. Three sections:
//   a) Add a listing  -> POST /api/local/listings
//   b) Your listings  -> GET  /api/local/host/listings
//   c) Reservation requests -> GET /api/local/host/bookings  (+ confirm/reject)
import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  API_URL,
  getStoredUser,
  getToken,
  type Listing,
  type HostBooking,
  type Service,
  type ServiceRequest,
} from '@/lib/api'
import BookingChat from '@/app/_components/booking-chat'
import ImagePlaceholder from '@/app/_components/image-placeholder'

// Inlined at build time by Next. When set, the add-listing form shows a Google
// Maps pin-picker; when empty we silently fall back to the manual lat/lng
// inputs only. Client-only (touches window) -> dynamic import with ssr:false,
// mirroring how the explore page loads its map.
const GOOGLE_MAPS_API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyBigDJt5v66YrCqY-kd-V7AdU8fJl3N5_I'
const LocationPicker = dynamic(() => import('./location-picker'), {
  ssr: false,
})

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

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

const PROPERTY_TYPES = [
  'Apartment',
  'Villa',
  'House',
  'Chalet',
  'Cabin',
  'Guest House',
]

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

// Add-listing wizard step labels (index 0..4).
const WIZARD_STEPS = ['Basics', 'Location', 'Details', 'Amenities', 'Photos & review']

interface FormState {
  title: string
  description: string
  location: string
  country: string
  price_per_night: string
  max_guests: string
  bedrooms: string
  beds: string
  bathrooms: string
  property_type: string
  amenities: string[]
  lat: string
  lng: string
  image1: string
  image2: string
  image3: string
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  location: '',
  country: '',
  price_per_night: '',
  max_guests: '1',
  bedrooms: '1',
  beds: '1',
  bathrooms: '1',
  property_type: 'Apartment',
  amenities: [],
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
  const [gate, setGate] = useState<Gate>({ kind: 'checking' })

  // Add-listing wizard
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [step, setStep] = useState(0) // 0..3
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formOk, setFormOk] = useState<string | null>(null)

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

  // Gate on mount, then load data if allowed.
  useEffect(() => {
    const token = getToken()
    const user = getStoredUser()
    if (!token || !user) {
      setGate({ kind: 'anon' })
      return
    }
    const role = (user.role || '').toLowerCase()
    if (role !== 'host' && role !== 'admin') {
      setGate({ kind: 'forbidden' })
      return
    }
    const raw =
      (user.full_name && user.full_name.trim()) ||
      (user.name && user.name.trim()) ||
      (user.email ? user.email.split('@')[0] : '')
    setGate({ kind: 'ok', firstName: raw ? raw.split(' ')[0] : 'Host' })
    loadListings()
    loadBookings()
    loadServices()
    loadServiceRequests()
  }, [loadListings, loadBookings, loadServices, loadServiceRequests])

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
          location: form.location.trim(),
          country: form.country.trim(),
          price_per_night: price,
          bedrooms: Number(form.bedrooms) || 0,
          beds: Number(form.beds) || 0,
          bathrooms: Number(form.bathrooms) || 0,
          max_guests: Number(form.max_guests) || 1,
          property_type: form.property_type,
          amenities: form.amenities,
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
      setFormOk('Listing published. It now appears in “Your listings” below.')
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
        }
        @media (max-width: 560px) {
          .qk-host-step-label { display: none !important; }
        }
        @media (max-width: 460px) {
          .qk-host-form-grid { grid-template-columns: 1fr !important; }
          .qk-host-req-card { grid-template-columns: 1fr !important; }
          .qk-host-req-actions { justify-content: flex-start !important; }
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
                    ? COLORS.burgundy
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
                    background: active ? '#fff' : COLORS.burgundy,
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
              <Field label="Description">
                <textarea
                  style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
                  value={form.description}
                  onChange={(e) => patch({ description: e.target.value })}
                  placeholder="What makes this place special?"
                />
              </Field>
            </div>
          )}

          {/* STEP 2 — Location -------------------------------------------- */}
          {step === 1 && (
            <div style={{ display: 'grid', gap: 14 }}>
              <p style={{ margin: 0, fontSize: 14, color: COLORS.muted }}>
                Search for a place to jump there, then tap the map to drop the
                pin — drag it to fine-tune the exact spot.
              </p>
              {GOOGLE_MAPS_API_KEY ? (
                <LocationPicker
                  apiKey={GOOGLE_MAPS_API_KEY}
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
              ) : (
                <p style={{ margin: 0, fontSize: 14, color: COLORS.muted }}>
                  Map unavailable — enter coordinates below.
                </p>
              )}

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
              <Field label="Guests">
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  value={form.max_guests}
                  onChange={(e) => patch({ max_guests: e.target.value })}
                />
              </Field>
              <Field label="Bedrooms">
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  value={form.bedrooms}
                  onChange={(e) => patch({ bedrooms: e.target.value })}
                />
              </Field>
              <Field label="Beds">
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  value={form.beds}
                  onChange={(e) => patch({ beds: e.target.value })}
                />
              </Field>
              <Field label="Bathrooms">
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  value={form.bathrooms}
                  onChange={(e) => patch({ bathrooms: e.target.value })}
                />
              </Field>
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
                        background: on ? COLORS.burgundy : '#fff',
                        border: on
                          ? `1px solid ${COLORS.burgundy}`
                          : '1px solid rgba(42,34,32,0.16)',
                        transition: 'background 0.12s ease, color 0.12s ease',
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

          {/* STEP 5 — Photos & review ------------------------------------- */}
          {step === 4 && (
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
                style={{
                  padding: '12px 28px',
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: FONT,
                  color: '#fff',
                  background: COLORS.burgundy,
                  border: 'none',
                  borderRadius: 14,
                  cursor: 'pointer',
                }}
              >
                Next
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '12px 28px',
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: FONT,
                  color: '#fff',
                  background: COLORS.burgundy,
                  border: 'none',
                  borderRadius: 14,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Publishing…' : 'Publish listing'}
              </button>
            )}
          </div>
        </form>
      </Section>

      {/* b) Your listings ----------------------------------------------------- */}
      <Section title="Your listings">
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
              return (
                <a
                  key={l.id}
                  href={`/explore/${l.id}`}
                  style={{
                    display: 'block',
                    background: '#fff',
                    borderRadius: 18,
                    overflow: 'hidden',
                    textDecoration: 'none',
                    color: 'inherit',
                    border: '1px solid rgba(42,34,32,0.06)',
                    boxShadow: '0 4px 18px rgba(42,34,32,0.07)',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '4 / 3',
                      background: COLORS.tan,
                    }}
                  >
                    {cover ? (
                      <img
                        src={cover}
                        alt={l.title}
                        loading="lazy"
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
                  </div>
                  <div style={{ padding: '12px 14px 16px' }}>
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
              )
            })}
          </div>
        )}
      </Section>

      {/* c) Reservation requests --------------------------------------------- */}
      <Section title="Reservation requests">
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
                    borderRadius: 16,
                    border: '1px solid rgba(42,34,32,0.06)',
                    boxShadow: '0 4px 18px rgba(42,34,32,0.06)',
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
                        style={{
                          padding: '9px 18px',
                          fontSize: 14,
                          fontWeight: 700,
                          fontFamily: FONT,
                          color: openChatId === b.id ? '#fff' : COLORS.burgundy,
                          background:
                            openChatId === b.id ? COLORS.burgundy : COLORS.tan,
                          border: `1px solid ${COLORS.burgundy}`,
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
            style={{
              marginTop: 18,
              padding: '13px 28px',
              fontSize: 15,
              fontWeight: 700,
              fontFamily: FONT,
              color: '#fff',
              background: COLORS.burgundy,
              border: 'none',
              borderRadius: 14,
              cursor: svcSubmitting ? 'not-allowed' : 'pointer',
              opacity: svcSubmitting ? 0.6 : 1,
            }}
          >
            {svcSubmitting ? 'Publishing…' : 'Publish service'}
          </button>
        </form>
      </Section>

      {/* e) Your services ----------------------------------------------------- */}
      <Section title="Your services">
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
                  style={{
                    display: 'block',
                    background: '#fff',
                    borderRadius: 18,
                    overflow: 'hidden',
                    textDecoration: 'none',
                    color: 'inherit',
                    border: '1px solid rgba(42,34,32,0.06)',
                    boxShadow: '0 4px 18px rgba(42,34,32,0.07)',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '4 / 3',
                      background: COLORS.tan,
                    }}
                  >
                    {cover ? (
                      <img
                        src={cover}
                        alt={s.title}
                        loading="lazy"
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
                    borderRadius: 16,
                    border: '1px solid rgba(42,34,32,0.06)',
                    boxShadow: '0 4px 18px rgba(42,34,32,0.06)',
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

// ---- Small presentational helpers ------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.cream,
        color: COLORS.ink,
        fontFamily: FONT,
      }}
    >
      <header
        style={{
          background: `linear-gradient(180deg, ${COLORS.tan} 0%, ${COLORS.cream} 100%)`,
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
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 22,
        border: '1px solid rgba(42,34,32,0.06)',
        boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
        padding: '24px 24px 26px',
        marginBottom: 24,
      }}
    >
      <h2
        style={{
          margin: '0 0 18px',
          fontSize: 19,
          fontWeight: 700,
          color: COLORS.ink,
        }}
      >
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
        style={{
          display: 'inline-block',
          color: '#fff',
          background: COLORS.burgundy,
          textDecoration: 'none',
          fontWeight: 700,
          padding: '12px 26px',
          borderRadius: 999,
        }}
      >
        {ctaLabel}
      </a>
    </div>
  )
}
