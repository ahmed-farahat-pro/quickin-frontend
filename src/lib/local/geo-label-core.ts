// =============================================================================
// GEO LABEL CORE — the words that go with the pin
// =============================================================================
// The host form asks for the place twice: in words (the Location field) and as a
// pin on the map. Until now the wiring only ran one way. Typing a place and
// picking a suggestion moved the pin (forward geocode), but dragging the pin —
// or clicking a new spot on the map — changed the coordinates and left the words
// alone, so a listing could read "Porto, Marina" while the pin sat in Alexandria
// and the host had no way to tell which one the guest would see. This module is
// the missing direction: given a Nominatim result it derives the short label the
// Location field shows, for BOTH directions of that wiring.
//
// It is pure — no fetch, no React — for the usual reason: the label rules are
// the fiddly part (Nominatim answers a dragged pin in the desert with nothing
// but a governorate, and a pin on a building with a house number nobody wants in
// a Location field), and pure rules run under `node --test`. The forms own the
// network call and the debounce; this file owns what the answer reads as.
//
// `placeShort` was duplicated byte-for-byte in new-listing-form.tsx and
// edit-listing-form.tsx before it moved here, along with COUNTRIES and PlaceHit.
// Both forms now import all three, so the create and edit flows cannot drift.
// =============================================================================

/** A Nominatim result, in the shape we actually read from it. */
export interface NominatimPlace {
  name?: string
  display_name?: string
  address?: Record<string, string>
}

/** One row of the location autocomplete. */
export interface PlaceHit {
  label: string // full display name (secondary line)
  short: string // concise "place, city" (primary line + what we store)
  lat: number
  lon: number
}

/**
 * Egypt-first. `code` is the ISO country code used to scope map geocoding.
 * One list for both host forms so they always offer the same choices.
 */
export const COUNTRIES: { name: string; code: string }[] = [
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

/** The ISO code for a country name, or '' when it isn't one we scope by. */
export function countryCodeFor(name: unknown): string {
  const s = String(name ?? '').trim()
  return COUNTRIES.find((c) => c.name === s)?.code ?? ''
}

/** A trimmed string, or '' for anything that isn't usable text. */
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** The first comma-separated segment of a display_name. */
function firstSegment(display: unknown): string {
  return text(String(display ?? '').split(',')[0])
}

/** A concise "place, city" label from a Nominatim (jsonv2 + addressdetails) result. */
export function placeShort(d: NominatimPlace): string {
  const a = d.address || {}
  const primary =
    text(d.name) ||
    text(a.suburb) || text(a.neighbourhood) || text(a.city_district) ||
    text(a.city) || text(a.town) || text(a.village) ||
    firstSegment(d.display_name)
  const city = text(a.city) || text(a.town) || text(a.village) || text(a.state)
  if (primary && city && primary !== city) return `${primary}, ${city}`
  return (primary || String(d.display_name || '').split(',').slice(0, 2).join(', ')).trim()
}

/**
 * The Location text for a pin the host just dropped or dragged.
 *
 * Same "place, city" shape `placeShort` produces for a search hit — a host who
 * picks "Sidi Abdel Rahman, Marsa Matrouh" from the dropdown and a host who
 * drags the pin to the same spot must end up with the same words in the field.
 *
 * Two things differ from the search case, both because a reverse result
 * describes a coordinate rather than a place someone searched for:
 *
 *   • It reaches further down for a primary — `hamlet`, and `road` below every
 *     settlement word, because a pin on a desert highway has nothing else. The
 *     road sits UNDER the village on purpose: "Sahl Hasheesh Road, Sahl
 *     Hasheesh" is what naive ordering gives you, and the village alone is the
 *     word a guest recognises.
 *   • It falls back to the coarse "state, country" and then to the country name
 *     alone, because Nominatim answers a pin in open desert or at sea with
 *     nothing finer. Coarse-but-true beats the previous behaviour — the words of
 *     wherever the pin used to be.
 *
 * Returns '' only when the result carries no usable place words at all. The
 * caller treats that as "don't touch the field" and says so under the map:
 * silently blanking a Location the host typed is worse than leaving it stale,
 * and unlike the stale case they can see it happen.
 */
export function reverseLabel(d: NominatimPlace | null | undefined): string {
  if (!d) return ''
  const a = d.address || {}
  // `name` is the matched feature — a resort, a compound, a marina — and it is
  // the best label there is WHEN it is one of those. At the granularity we ask
  // for, though, the thing under a pin is usually a road, and Nominatim then
  // mirrors the road name into `name`: taking it would put "Street 92" in the
  // field over the neighbourhood the street is in. So a `name` that IS the road
  // is dropped back down to where `road` already sits in the chain.
  const named = text(d.name)
  const primary =
    (named && named !== text(a.road) ? named : '') ||
    text(a.suburb) || text(a.neighbourhood) || text(a.city_district) ||
    text(a.village) || text(a.hamlet) || text(a.town) ||
    text(a.road) ||
    text(a.city)
  const city = text(a.city) || text(a.town) || text(a.village) || text(a.state)

  if (primary && city && primary !== city) return `${primary}, ${city}`
  if (primary) return primary
  if (city) {
    const country = text(a.country)
    return country && country !== city ? `${city}, ${country}` : city
  }
  return text(a.country) || firstSegment(d.display_name)
}

/** Nominatim's public endpoint — the same host the forward search already uses. */
export const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'

/**
 * Reverse-geocode URL for a pin.
 *
 * `zoom=16` asks for neighbourhood/major-street granularity rather than the
 * building-level default: a Location field wants "Sidi Abdel Rahman, Marsa
 * Matrouh", not "27, Street 9, ...". `addressdetails=1` is what fills the
 * `address` object both label functions read.
 */
export function reverseGeocodeUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '16',
    lat: String(lat),
    lon: String(lng),
  })
  return `${NOMINATIM_BASE}/reverse?${params.toString()}`
}

/**
 * How long to wait after the pin stops moving before asking Nominatim.
 *
 * A drag settles in one `dragend`, but a host correcting themselves fires
 * several map clicks in a row, and Nominatim's usage policy is one request a
 * second. Half a second is under what reads as lag and over what reads as a
 * burst. The in-flight request is aborted when a newer pin arrives regardless.
 */
export const REVERSE_GEOCODE_DEBOUNCE_MS = 500
