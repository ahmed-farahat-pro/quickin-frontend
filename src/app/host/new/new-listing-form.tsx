'use client'

// Create-listing form: POSTs the listing fields to /api/local/listings (host_id
// is taken from the signed-in caller server-side) and on success navigates to
// /host. Location is set with a map pin; photos are uploaded from the device
// (camera or library) and sent as compressed base64 data URLs. The same uploader
// attaches the proof-of-ownership document (`ownership_doc`) an admin reviews
// before the listing goes live — parity with the iOS/Android add-listing flows.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { GuestPriceHint } from '@/components/features/host/guest-price-hint'
import { PROPERTY_TYPES, MAX_WEB_LISTING_PHOTOS } from '@/lib/property-types'
import { REGIONS, AMENITIES } from '@/lib/listing-options'
import { checkListingPin } from '@/lib/local/listing-geo-policy'
import {
  checkListingAddress,
  checkListingArea,
  checkListingDescription,
  checkListingPhotos,
  checkListingPinPresence,
  checkListingPropertyType,
} from '@/lib/local/listing-completeness-policy'
import { OTHER_RESORT, isResortNameMissing } from '@/lib/resort-choice'
import { checkResortName, MIN_RESORT_NAME_LETTERS } from '@/lib/local/resort-core'
import { fileToCompressedDataUrl } from '@/lib/image'
import { DEFAULT_WEEKEND_DAYS } from '@/lib/geo'
import { DAYS_IN_WEEK, checkWeekendPrice, resolveWeekendSchedule } from '@/lib/local/listing-pricing-core'
import {
  checkListingTitle,
  normalizeListingTitle,
  MIN_TITLE_LETTERS,
  MAX_TITLE_LENGTH,
} from '@/lib/local/listing-title-policy'
import {
  CAPACITY_FIELDS,
  MIN_CAPACITY,
  checkListingCapacity,
} from '@/lib/local/listing-capacity-policy'
import { OwnershipDocField } from '../ownership-doc'

const C = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const LocationPickerMap = dynamic(() => import('./location-picker-map'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 260, borderRadius: 14, background: C.tan, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13 }}>…</div>
  ),
})

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 13.5,
  fontWeight: 700,
  color: C.ink,
  marginBottom: 6,
}

const input: React.CSSProperties = {
  width: '100%',
  fontFamily: 'inherit',
  fontSize: 14.5,
  padding: '11px 14px',
  border: `1px solid ${C.tan}`,
  borderRadius: 14,
  background: '#fff',
  color: C.ink,
  boxSizing: 'border-box',
}

const fieldWrap: React.CSSProperties = { marginBottom: 18 }

// The mark next to every label the host cannot skip. The bug this answers was
// half "the form accepted an empty listing" and half "nothing said it wouldn't"
// — a rule enforced at submit and nowhere on the page is a rule the host meets
// as a rejection. `aria-hidden` because the accessible name comes from the
// input's own `required`/`aria-required`, and a screen reader announcing
// "asterisk" after every label is noise.
function Req() {
  return (
    <span aria-hidden="true" style={{ color: C.burgundy, marginInlineStart: 3, fontWeight: 800 }}>
      *
    </span>
  )
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

// Egypt-first. `code` is the ISO country code used to scope map geocoding.
const COUNTRIES: { name: string; code: string }[] = [
  { name: 'Egypt', code: 'eg' },
  { name: 'Saudi Arabia', code: 'sa' },
  { name: 'United Arab Emirates', code: 'ae' },
  { name: 'Kuwait', code: 'kw' },
  { name: 'Qatar', code: 'qa' },
  { name: 'Bahrain', code: 'bh' },
  { name: 'Oman', code: 'om' },
  { name: 'Jordan', code: 'jo' },
  { name: 'Lebanon', code: 'lb' },
  { name: 'Morocco', code: 'ma' },
]

const CURRENCIES = ['EGP', 'USD', 'EUR', 'SAR', 'AED', 'GBP'] as const

interface PlaceHit {
  label: string // full display name (secondary line)
  short: string // concise "place, city" (primary line + what we store)
  lat: number
  lon: number
}

// A concise "place, city" label from a Nominatim (jsonv2 + addressdetails) result.
function placeShort(d: { name?: string; display_name?: string; address?: Record<string, string> }): string {
  const a = d.address || {}
  const primary =
    d.name ||
    a.suburb || a.neighbourhood || a.city_district ||
    a.city || a.town || a.village ||
    String(d.display_name || '').split(',')[0]
  const city = a.city || a.town || a.village || a.state
  if (primary && city && primary !== city) return `${primary}, ${city}`
  return (primary || String(d.display_name || '').split(',').slice(0, 2).join(', ')).trim()
}

const dropdownStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: '4px 0 0',
  padding: 4,
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  zIndex: 50,
  background: '#fff',
  border: `1px solid ${C.tan}`,
  borderRadius: 12,
  boxShadow: '0 12px 30px rgba(42,34,32,0.14)',
  maxHeight: 260,
  overflowY: 'auto',
}

export type ResortOption = { id: string; name: string; region: string }

export function NewListingForm({
  resorts = [],
  commissionRate = 0,
}: {
  resorts?: ResortOption[]
  /** Platform commission as a fraction — drives the "guests will see" hint. */
  commissionRate?: number
}) {
  const router = useRouter()
  const t = useTranslations('hostPage.create')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Controlled fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [country, setCountry] = useState('Egypt')
  const [region, setRegion] = useState('')
  // Resort catalog + the host's choice. OTHER_RESORT is the sentinel that swaps the
  // dropdown for a free-text box; the typed name is saved as-is and queued for an
  // admin, so the host is never blocked waiting on moderation.
  const [resortId, setResortId] = useState('')
  const [resortOther, setResortOther] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [geo, setGeo] = useState<'idle' | 'locating' | 'fail'>('idle')
  const [placeResults, setPlaceResults] = useState<PlaceHit[]>([])
  const [placeOpen, setPlaceOpen] = useState(false)
  const placeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const placeAbortRef = useRef<AbortController | null>(null)
  const placeBlurRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [price, setPrice] = useState('')
  const [weekendPrice, setWeekendPrice] = useState('')
  const [weekendDays, setWeekendDays] = useState<number[]>(DEFAULT_WEEKEND_DAYS)
  const [currency, setCurrency] = useState('EGP')
  const [bedrooms, setBedrooms] = useState('1')
  const [beds, setBeds] = useState('1')
  const [bathrooms, setBathrooms] = useState('1')
  const [maxGuests, setMaxGuests] = useState('2')
  const [propertyType, setPropertyType] = useState('Apartment')
  const [amenities, setAmenities] = useState<string[]>([])
  const [photos, setPhotos] = useState<string[]>([]) // base64 data URLs
  const [photoBusy, setPhotoBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  // Proof of ownership — one compressed data URL, admin-only (never public).
  const [ownershipDoc, setOwnershipDoc] = useState('')

  // A weekend is part of a week. Lighting up all seven prices every night at the
  // weekend rate and leaves the price-per-night field above applying to nothing,
  // so the last unlit day stays unlit — the host is told why under the pills.
  // Same rule the API runs — see lib/local/listing-pricing-core.ts.
  const weekendDaysFull = weekendDays.length >= DAYS_IN_WEEK - 1
  // …and the other end of the same pair. A rate with every pill off is a rate no
  // night can ever be charged at, so it is said under the pills as the host
  // types rather than held back until they press Create.
  const typedWeekendRate = checkWeekendPrice(weekendPrice)
  const weekendDaysMissing =
    weekendDays.length === 0 && typedWeekendRate.ok && typedWeekendRate.value !== null

  function toggleWeekendDay(day: number) {
    setWeekendDays((prev) => {
      if (prev.includes(day)) return prev.filter((d) => d !== day)
      if (prev.length >= DAYS_IN_WEEK - 1) return prev
      return [...prev, day].sort()
    })
  }

  function toggleAmenity(value: string) {
    setAmenities((prev) => (prev.includes(value) ? prev.filter((a) => a !== value) : [...prev, value]))
  }

  // Forward-geocode the typed location (scoped to the chosen country) so the map
  // recenters + drops a pin there. The host can still tap/drag to fine-tune.
  async function geocodeLocation() {
    const q = location.trim()
    if (!q) return
    setGeo('locating')
    try {
      const code = COUNTRIES.find((c) => c.name === country)?.code
      const cc = code ? `&countrycodes=${code}` : ''
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1${cc}&q=${encodeURIComponent(q)}`
      )
      const data = await res.json()
      const hit = Array.isArray(data) ? data[0] : null
      if (hit?.lat && hit?.lon) {
        setLat(Number(hit.lat))
        setLng(Number(hit.lon))
        setGeo('idle')
      } else {
        setGeo('fail')
      }
    } catch {
      setGeo('fail')
    }
  }

  // Live place search (multiple results, scoped to the chosen country) so the
  // host can search a city/area and pick the right spot to pin — even when they
  // are physically somewhere else. Picking a result recenters the map + pins it.
  function runPlaceSearch(query: string) {
    placeAbortRef.current?.abort()
    const q = query.trim()
    if (q.length < 2) {
      setPlaceResults([])
      return
    }
    const controller = new AbortController()
    placeAbortRef.current = controller
    const code = COUNTRIES.find((c) => c.name === country)?.code
    const cc = code ? `&countrycodes=${code}` : ''
    fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6${cc}&q=${encodeURIComponent(q)}`,
      { signal: controller.signal },
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (controller.signal.aborted) return
        const arr = (Array.isArray(data) ? data : []) as Array<{
          display_name?: string; name?: string; lat?: string; lon?: string; address?: Record<string, string>
        }>
        const hits: PlaceHit[] = arr
          .map((d) => ({ label: String(d.display_name || ''), short: placeShort(d), lat: Number(d.lat), lon: Number(d.lon) }))
          .filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lon) && !!h.label)
        setPlaceResults(hits)
      })
      .catch((err) => {
        if ((err as Error)?.name !== 'AbortError') setPlaceResults([])
      })
  }

  function onLocationChange(value: string) {
    setLocation(value)
    setGeo('idle')
    setPlaceOpen(true)
    if (placeDebounceRef.current) clearTimeout(placeDebounceRef.current)
    placeDebounceRef.current = setTimeout(() => runPlaceSearch(value), 300)
  }

  function pickPlace(h: PlaceHit) {
    setLocation(h.short || h.label)
    setLat(h.lat)
    setLng(h.lon)
    setGeo('idle')
    setPlaceResults([])
    setPlaceOpen(false)
  }

  // Clean up the debounce + in-flight search on unmount.
  useEffect(() => {
    return () => {
      if (placeDebounceRef.current) clearTimeout(placeDebounceRef.current)
      if (placeBlurRef.current) clearTimeout(placeBlurRef.current)
      placeAbortRef.current?.abort()
    }
  }, [])

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // allow re-picking the same file
    if (!files.length) return
    const room = MAX_WEB_LISTING_PHOTOS - photos.length
    if (room <= 0) {
      setError(t('errors.tooManyPhotos', { max: MAX_WEB_LISTING_PHOTOS }))
      return
    }
    setPhotoBusy(true)
    setError(null)
    try {
      const picked = files.slice(0, room)
      const encoded: string[] = []
      for (const f of picked) {
        try {
          encoded.push(await fileToCompressedDataUrl(f))
        } catch {
          setError(t('errors.photoFailed'))
        }
      }
      setPhotos((prev) => [...prev, ...encoded].slice(0, MAX_WEB_LISTING_PHOTOS))
      if (files.length > room) setError(t('errors.tooManyPhotos', { max: MAX_WEB_LISTING_PHOTOS }))
    } finally {
      setPhotoBusy(false)
    }
  }

  function removePhoto(i: number) {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i))
  }

  // The policy answers with a `{code, field}` problem rather than a sentence, so
  // the reason can be said in the host's own language here instead of English
  // being echoed from the API. Same shape the capacity errors use, and the field
  // labels are the ones already rendered above each input, so the message and
  // the label a host is looking at always name the field the same way.
  function completenessMessage(problem: {
    code: 'required' | 'letters' | 'tooShort' | 'tooFew'
    field: 'description' | 'location' | 'region' | 'pin' | 'propertyType' | 'photos'
    min?: number
  }): string {
    // The pin already had a sentence written for it in all four locales, and
    // "Please fill in Map location" is not what you do to a map. Use it.
    if (problem.field === 'pin') return t('errors.pinRequired')
    return t(`errors.completeness.${problem.code}`, {
      field: t(`fields.${problem.field}`),
      min: problem.min ?? 0,
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // A title has to read as a title: `@@@@@` cleared the old non-empty check
    // and published as the listing's name. Same rule the API runs — see
    // lib/local/listing-title-policy.ts.
    const trimmedTitle = normalizeListingTitle(title)
    const titleProblem = checkListingTitle(trimmedTitle)
    if (titleProblem) {
      setError(t(`errors.title.${titleProblem.code}`, { min: MIN_TITLE_LETTERS, max: MAX_TITLE_LENGTH }))
      return
    }
    // Everything between the title and the price. A listing used to need only a
    // title and a price — no description, no address, no area, no pin, no photo
    // — so a host could publish something no guest could read, find, see or
    // place. Same rule the API runs; the checks are ordered the way the fields
    // are laid out below, so a host who skipped several is sent to the topmost
    // one rather than to whichever the code looked at first. See
    // lib/local/listing-completeness-policy.ts.
    const missingAbovePrice =
      checkListingDescription(description) ??
      checkListingAddress(location) ??
      checkListingArea({
        region,
        resort_id: resortId && resortId !== OTHER_RESORT ? resortId : '',
        resort_name: resortId === OTHER_RESORT ? resortOther : '',
      }) ??
      checkListingPinPresence(lat, lng)
    if (missingAbovePrice) {
      setError(completenessMessage(missingAbovePrice))
      return
    }
    const priceNum = Number(price)
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setError(t('errors.priceInvalid'))
      return
    }
    // The pin was optional here while both apps gate their location step on one,
    // so the web was the only door a listing could come through with no
    // coordinates at all — and with no pin, the check under the map has nothing
    // to judge, which is how a listing could carry a North Coast address under a
    // Cairo area chip unchallenged. The pin is what the policy trusts, so it is
    // required before any of it means anything.
    if (lat == null || lng == null) {
      setError(t('errors.pinRequired'))
      return
    }
    // "Other" without a name is not "no resort" — see isResortNameMissing().
    if (isResortNameMissing(resortId, resortOther)) {
      setError(t('errors.resortName.required'))
      return
    }
    // …and a box holding `@@@@@` is not a name. It used to submit, and a name with
    // no letters is stored as no resort at all. Same rule the API runs — see
    // lib/local/resort-core.ts.
    const resortProblem = resortId === OTHER_RESORT ? checkResortName(resortOther) : null
    if (resortProblem) {
      setError(t(`errors.resortName.${resortProblem.code}`, { min: MIN_RESORT_NAME_LETTERS }))
      return
    }

    // Capacity: a place with 0 bedrooms, 0 beds and 0 bathrooms was accepted here
    // and published — the old `num()` helper kept anything >= 0, and an empty
    // field became 0 rather than the default it was handed. Same rule the API
    // runs — see lib/local/listing-capacity-policy.ts.
    const capacity: Record<string, string> = { bedrooms, beds, bathrooms, guests: maxGuests }
    for (const field of CAPACITY_FIELDS) {
      const problem = checkListingCapacity(field, capacity[field])
      if (problem) {
        // 'guests' is `fields.maxGuests` in the copy — the only field whose
        // policy name and label key differ.
        const labelKey = field === 'guests' ? 'maxGuests' : field
        setError(t(`errors.capacity.${problem.code}`, { field: t(`fields.${labelKey}`), min: MIN_CAPACITY }))
        return
      }
    }
    // Weekend pricing is optional, but a rate the host typed has to be a rate:
    // 0 used to be dropped here and the listing saved without weekend pricing at
    // all, with the day pills still lit. Same rule the API runs.
    const weekend = checkWeekendPrice(weekendPrice)
    if (!weekend.ok) {
      setError(t('errors.weekendPriceInvalid'))
      return
    }
    const weekend_price = weekend.value ?? undefined
    // The days that rate applies to, judged against the rate itself. The pills
    // can't reach all seven, but the value they hold is what gets sent, so the
    // rule is checked here rather than assumed — and it also catches the pills
    // being turned ALL the way off under a rate the host typed, which used to
    // submit happily and store a weekend price no night could be charged at.
    // Same rule the API runs — see lib/local/listing-pricing-core.ts.
    const weekendSchedule = resolveWeekendSchedule(weekend.value, weekendDays)
    if (!weekendSchedule.ok) {
      setError(t(`errors.weekendDays.${weekendSchedule.problem}`))
      return
    }

    // …and the two required fields that sit below the capacity row: the property
    // type (always prefilled here, but the API accepts a payload without one)
    // and the photos. A listing with no photo is the one a guest scrolls past.
    const missingBelow = checkListingPropertyType(propertyType) ?? checkListingPhotos(photos)
    if (missingBelow) {
      setError(completenessMessage(missingBelow))
      return
    }

    setBusy(true)
    try {
      const res = await fetch('/api/local/listings', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmedTitle,
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          country: country.trim() || undefined,
          lat: lat ?? undefined,
          lng: lng ?? undefined,
          price_per_night: priceNum,
          weekend_price,
          weekend_days: weekendSchedule.days ?? undefined,
          currency: currency.trim() || 'EGP',
          bedrooms,
          beds,
          bathrooms,
          max_guests: maxGuests,
          property_type: propertyType || undefined,
          region: region || undefined,
          resort_id: resortId && resortId !== OTHER_RESORT ? resortId : undefined,
          resort_name: resortId === OTHER_RESORT ? resortOther.trim() || undefined : undefined,
          amenities,
          images: photos,
          ownership_doc: ownershipDoc || undefined,
        }),
      })
      if (res.status === 401) {
        router.push('/login')
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || t('errors.createFailed'))
      }
      router.push('/host')
      router.refresh()
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : t('errors.createFailed'))
    }
  }

  // Does the pin agree with the country + curated area chosen above? Derived on
  // every render (it is three comparisons — see listing-geo-policy.ts), so the
  // warning appears and clears as the host moves the pin or changes either field.
  // The region is named in the host's own language; a country name is not
  // translated anywhere in this form, so it is passed through as chosen.
  const pinProblem = checkListingPin({ lat, lng, country, region })
  const pinProblemPlace = pinProblem
    ? (() => {
        const known = REGIONS.find((r) => r.value === pinProblem.scope)
        return known ? t(`regions.${known.key}`) : pinProblem.scope
      })()
    : ''
  const pinProblemText = pinProblem
    ? t(`pinMismatch.${pinProblem.code}`, { place: pinProblemPlace })
    : ''

  return (
    <form
      onSubmit={submit}
      style={{
        background: '#fff',
        borderRadius: 24,
        border: `1px solid rgba(42,34,32,0.06)`,
        boxShadow: '0 6px 24px rgba(42,34,32,0.07)',
        padding: '28px 26px',
      }}
    >
      <style>{`
        @media (max-width: 560px) {
          .qk-new-row { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Says the rule once, at the top, instead of leaving the host to infer it
          from the marks. Half the reported bug was that nothing on this page
          indicated which fields were required. */}
      <p style={{ margin: '0 0 18px', fontSize: 12.5, color: C.muted }}>
        <Req />
        <span style={{ marginInlineStart: 6 }}>{t('requiredLegend')}</span>
      </p>

      <div style={fieldWrap}>
        <label style={label} htmlFor="title">{t('fields.title')}<Req /></label>
        <input
          id="title"
          style={input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('placeholders.title')}
          // The policy already refuses a longer title on submit; capping the
          // field means the host is stopped as they type instead of after.
          maxLength={MAX_TITLE_LENGTH}
          required
        />
      </div>

      <div style={fieldWrap}>
        <label style={label} htmlFor="description">{t('fields.description')}<Req /></label>
        <textarea
          id="description"
          style={{ ...input, minHeight: 96, resize: 'vertical' }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('placeholders.description')}
          required
        />
      </div>

      <div className="qk-new-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, ...fieldWrap }}>
        <div style={{ position: 'relative' }}>
          <label style={label} htmlFor="location">{t('fields.location')}<Req /></label>
          <input
            id="location"
            style={input}
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            onFocus={() => { if (location.trim().length >= 2) { setPlaceOpen(true); runPlaceSearch(location) } }}
            onBlur={() => {
              if (placeBlurRef.current) clearTimeout(placeBlurRef.current)
              placeBlurRef.current = setTimeout(() => setPlaceOpen(false), 150)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (placeResults[0]) pickPlace(placeResults[0])
                else geocodeLocation()
              } else if (e.key === 'Escape') {
                setPlaceOpen(false)
              }
            }}
            placeholder={t('placeholders.location')}
            autoComplete="off"
            role="combobox"
            aria-expanded={placeOpen}
            required
          />
          {placeOpen && placeResults.length > 0 && (
            <ul style={dropdownStyle}>
              {placeResults.map((h, i) => (
                <li
                  key={`${h.lat},${h.lon},${i}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pickPlace(h)
                  }}
                  style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: C.ink }}>{h.short}</div>
                  <div style={{ fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.label}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p style={{ margin: '6px 0 0', fontSize: 12, color: C.muted }}>{t('searchHint')}</p>
        </div>
        <div>
          <label style={label} htmlFor="country">{t('fields.country')}</label>
          <select
            id="country"
            style={input}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Curated browse area — the chips guests filter by (same four on mobile). */}
      <div style={fieldWrap}>
        <label style={label} htmlFor="region">{t('fields.region')}<Req /></label>
        <select
          id="region"
          style={input}
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          required
        >
          <option value="">{t('regionNone')}</option>
          {REGIONS.map((r) => (
            <option key={r.value} value={r.value}>{t(`regions.${r.key}`)}</option>
          ))}
        </select>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.muted }}>{t('regionHint')}</p>
      </div>

      {/* Resort / compound. Narrowed to the chosen region so the two can't disagree —
          picking one also sets the region server-side. */}
      <div style={fieldWrap}>
        <label style={label} htmlFor="resort">{t('fields.resort')}</label>
        <select
          id="resort"
          style={input}
          value={resortId}
          onChange={(e) => setResortId(e.target.value)}
        >
          <option value="">{t('resortNone')}</option>
          {resorts
            .filter((r) => !region || r.region === region)
            .map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          <option value={OTHER_RESORT}>{t('resortOther')}</option>
        </select>
        {resortId === OTHER_RESORT && (
          <input
            style={{ ...input, marginTop: 8 }}
            value={resortOther}
            onChange={(e) => setResortOther(e.target.value)}
            placeholder={t('resortOtherPlaceholder')}
            maxLength={120}
            required
          />
        )}
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.muted }}>
          {resortId === OTHER_RESORT ? t('resortOtherHint') : t('resortHint')}
        </p>
      </div>

      {/* Map pin — sets lat/lng; guests see an approximate area, not the exact pin. */}
      <div style={fieldWrap}>
        <label style={label}>{t('fields.pinLocation')}<Req /></label>
        <LocationPickerMap lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln) }} />
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: geo === 'fail' ? C.burgundy : C.muted }}>
          {geo === 'locating'
            ? t('locating')
            : geo === 'fail'
            ? t('geocodeFail')
            : lat != null && lng != null
            ? t('pinSet', { lat: lat.toFixed(4), lng: lng.toFixed(4) })
            : t('pinHint')}
        </p>
        {/* The pin used to be free of the words above it: a host could choose Egypt →
            North Coast and drop the pin in Germany, and it saved silently. This says
            so — it does not block, because a bounding box must never be the reason a
            real property can't be listed. An ignored warning is badged in /ops. */}
        {pinProblemText ? (
          <p
            role="status"
            style={{
              margin: '8px 0 0',
              padding: '10px 12px',
              borderRadius: 12,
              background: '#FBEEEF',
              border: `1px solid ${C.burgundy}33`,
              fontSize: 12.5,
              lineHeight: 1.5,
              color: C.burgundy,
              fontWeight: 600,
            }}
          >
            {pinProblemText}
          </p>
        ) : null}
      </div>

      <div className="qk-new-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, ...fieldWrap }}>
        <div>
          <label style={label} htmlFor="price">{t('fields.price')}<Req /></label>
          <input
            id="price"
            style={input}
            type="number"
            min="1"
            step="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="1200"
            required
          />
          <GuestPriceHint value={price} rate={commissionRate} currency={currency} />
        </div>
        <div>
          <label style={label} htmlFor="currency">{t('fields.currency')}</label>
          <select
            id="currency"
            style={input}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Weekend pricing (optional, configurable days) */}
      <div style={fieldWrap}>
        <label style={label} htmlFor="weekendPrice">{t('fields.weekendPrice')}</label>
        <input
          id="weekendPrice"
          style={input}
          type="number"
          min="0"
          step="1"
          value={weekendPrice}
          onChange={(e) => setWeekendPrice(e.target.value)}
          placeholder={t('placeholders.weekendPrice')}
        />
        <GuestPriceHint value={weekendPrice} rate={commissionRate} currency={currency} />
        <p style={{ margin: '8px 0 8px', fontSize: 12.5, color: C.muted }}>{t('fields.weekendDays')}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {WEEKDAY_KEYS.map((k, day) => {
            const on = weekendDays.includes(day)
            const locked = !on && weekendDaysFull
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleWeekendDay(day)}
                aria-pressed={on}
                disabled={locked}
                title={locked ? t('errors.weekendDays.wholeWeek') : undefined}
                style={{
                  padding: '7px 12px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: locked ? 'not-allowed' : 'pointer',
                  opacity: locked ? 0.45 : 1,
                  border: `1px solid ${on ? C.burgundy : 'rgba(42,34,32,0.16)'}`,
                  background: on ? C.burgundy : '#fff',
                  color: on ? '#fff' : C.ink,
                }}
              >
                {t(`weekdays.${k}`)}
              </button>
            )
          })}
        </div>
        {weekendDaysFull && (
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: C.muted }}>
            {t('errors.weekendDays.wholeWeek')}
          </p>
        )}
        {weekendDaysMissing && (
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: C.burgundy }}>
            {t('errors.weekendDays.noDaysChosen')}
          </p>
        )}
      </div>

      <div className="qk-new-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, ...fieldWrap }}>
        <div>
          <label style={label} htmlFor="bedrooms">{t('fields.bedrooms')}<Req /></label>
          <input id="bedrooms" style={input} type="number" min="1" step="1" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} required />
        </div>
        <div>
          <label style={label} htmlFor="beds">{t('fields.beds')}<Req /></label>
          <input id="beds" style={input} type="number" min="1" step="1" value={beds} onChange={(e) => setBeds(e.target.value)} required />
        </div>
        <div>
          <label style={label} htmlFor="bathrooms">{t('fields.bathrooms')}<Req /></label>
          <input id="bathrooms" style={input} type="number" min="1" step="1" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} required />
        </div>
        <div>
          <label style={label} htmlFor="maxGuests">{t('fields.maxGuests')}<Req /></label>
          <input id="maxGuests" style={input} type="number" min="1" step="1" value={maxGuests} onChange={(e) => setMaxGuests(e.target.value)} required />
        </div>
      </div>

      {/* Property type — icon grid */}
      <div style={fieldWrap}>
        <label style={label}>{t('fields.propertyType')}<Req /></label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
            gap: 10,
          }}
        >
          {PROPERTY_TYPES.map((p) => {
            const on = propertyType === p.value
            const Icon = p.Icon
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setPropertyType(p.value)}
                aria-pressed={on}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 7,
                  padding: '14px 8px',
                  borderRadius: 14,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 12.5,
                  fontWeight: 600,
                  border: `1px solid ${on ? C.burgundy : 'rgba(42,34,32,0.14)'}`,
                  background: on ? 'rgba(91,15,22,0.06)' : '#fff',
                  color: on ? C.burgundy : C.ink,
                }}
              >
                <Icon size={22} strokeWidth={1.8} color={on ? C.burgundy : C.muted} />
                {t(`propertyTypes.${p.key}`)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Amenities — the same catalog (and the same stored values) as iOS/Android */}
      <div style={fieldWrap}>
        <label style={label}>{t('fields.amenities')}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {AMENITIES.map((a) => {
            const on = amenities.includes(a.value)
            const Icon = a.Icon
            return (
              <button
                key={a.value}
                type="button"
                onClick={() => toggleAmenity(a.value)}
                aria-pressed={on}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '8px 14px',
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  border: `1px solid ${on ? C.burgundy : 'rgba(42,34,32,0.16)'}`,
                  background: on ? C.burgundy : '#fff',
                  color: on ? '#fff' : C.ink,
                }}
              >
                <Icon size={15} strokeWidth={1.9} />
                {t(`amenities.${a.key}`)}
              </button>
            )
          })}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 12.5, color: C.muted }}>{t('amenitiesHint')}</p>
      </div>

      {/* Photos — camera or library, compressed to base64, up to MAX_WEB_LISTING_PHOTOS */}
      <div style={fieldWrap}>
        <label style={label}>{t('fields.photos')}<Req /></label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={onPickFiles}
          style={{ display: 'none' }}
        />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={photoBusy || photos.length >= MAX_WEB_LISTING_PHOTOS}
            style={{
              padding: '10px 18px',
              borderRadius: 12,
              border: `1px solid ${C.tan}`,
              background: C.cream,
              color: C.burgundy,
              fontWeight: 700,
              fontSize: 14,
              fontFamily: 'inherit',
              cursor: photoBusy || photos.length >= MAX_WEB_LISTING_PHOTOS ? 'default' : 'pointer',
              opacity: photoBusy || photos.length >= MAX_WEB_LISTING_PHOTOS ? 0.6 : 1,
            }}
          >
            {photoBusy ? t('photosProcessing') : t('photosCta')}
          </button>
          <span style={{ fontSize: 12.5, color: C.muted }}>
            {t('photosCount', { count: photos.length, max: MAX_WEB_LISTING_PHOTOS })}
          </span>
        </div>

        {photos.length > 0 && (
          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
              gap: 10,
            }}
          >
            {photos.map((src, i) => (
              <div key={i} style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden', background: C.tan }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                {i === 0 && (
                  <span style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(91,15,22,0.92)', color: '#fff', fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999 }}>
                    {t('photosCover')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  aria-label={t('photosRemove')}
                  style={{
                    position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 999,
                    border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 14, lineHeight: 1,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <p style={{ margin: '8px 0 0', fontSize: 12.5, color: C.muted }}>{t('photosHint')}</p>
      </div>

      {/* Ownership document — reviewed in /ops before the listing goes live. */}
      <OwnershipDocField
        value={ownershipDoc}
        onChange={setOwnershipDoc}
        onError={setError}
        idPrefix="new"
      />

      {error && (
        <p style={{ margin: '0 0 14px', fontSize: 13.5, color: '#b3261e', fontWeight: 600 }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="submit"
          disabled={busy}
          style={{
            background: C.burgundy,
            color: '#fff',
            border: 'none',
            borderRadius: 999,
            padding: '12px 30px',
            fontWeight: 700,
            fontSize: 15,
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.7 : 1,
            fontFamily: 'inherit',
          }}
        >
          {busy ? t('publishing') : t('publish')}
        </button>
        <a
          href="/host"
          style={{
            color: C.muted,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14.5,
          }}
        >
          {t('cancel')}
        </a>
      </div>
    </form>
  )
}
