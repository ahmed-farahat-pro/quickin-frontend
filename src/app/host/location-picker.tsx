'use client'

// Leaflet + OpenStreetMap PIN-PICKER for the host add-listing wizard
// (host/page.tsx, step 2). Replaces the old Google Maps picker, whose JS key is
// dead — Leaflet needs no API key. Built on react-leaflet, mirroring the
// explore map (explore/leaflet-listings-map.tsx); rendered ONLY on the client
// (next/dynamic { ssr: false } in the parent) because Leaflet touches `window`
// at module load.
//
// Three ways to set the coordinate, all reported back via the SAME callback
// contract the parent already uses:
//   • SEARCH box  — queries OSM Nominatim; picking a result recenters the map,
//     moves the pin, and reports the place label + country via `onPlace`.
//   • the MAP     — tapping drops/moves the burgundy pin; the pin is also
//     DRAGGABLE for fine-tuning. Either gesture reports the coordinate via
//     `onPick(lat, lng)`.
//   • "Use my current location" — geolocation centers the map + moves the pin.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const COLORS = {
  burgundy: '#5B0F16',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

// Egypt-focused product, so the map opens framed on Egypt (matches the explore
// map) until the host picks a point.
const EGYPT_CENTER: [number, number] = [26.8206, 30.8025]
const EGYPT_ZOOM = 5
// Zoom we snap to once an actual point is chosen (search / geolocation / value).
const PICKED_ZOOM = 14

// Resolved from a search selection and handed to the parent so it can fill the
// listing's location + country fields. (Same shape the old Google picker used.)
export interface PlacePick {
  location: string
  country: string
  lat: number
  lng: number
}

// One OSM Nominatim search hit (the slice we read).
interface NominatimResult {
  lat: string
  lon: string
  display_name: string
  address?: { country?: string }
}

// Burgundy teardrop pin (matches the explore price-pill palette). An L.divIcon
// keeps us off Leaflet's default marker PNGs (which 404 under bundlers without
// extra asset wiring).
const PIN_ICON = L.divIcon({
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  html:
    '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;' +
    'transform:rotate(-45deg);background:#5B0F16;border:2px solid #fff;' +
    'box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
})

const validLat = (n: number): boolean => Number.isFinite(n) && n >= -90 && n <= 90
const validLng = (n: number): boolean =>
  Number.isFinite(n) && n >= -180 && n <= 180

// Imperatively recenters the map whenever `target` changes (search pick or
// geolocation). MapContainer only reads center/zoom on first mount, so panning
// after mount must go through the map instance like this.
function Recenter({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.setView([target.lat, target.lng], PICKED_ZOOM, { animate: true })
  }, [target, map])
  return null
}

// Tap-to-place: clicking anywhere on the map drops/moves the pin.
function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export default function LocationPicker({
  value,
  onPick,
  onPlace,
}: {
  // Kept for backwards-compat with the old Google picker call site; unused now
  // that the map is keyless OSM.
  apiKey?: string
  // Currently chosen coordinate (if any) — keeps the marker in sync when the
  // form is reset after a successful publish or when lat/lng are typed by hand.
  value: { lat: number; lng: number } | null
  onPick: (lat: number, lng: number) => void
  // Fired when a search result is chosen: carries the resolved label + country
  // alongside the coordinate.
  onPlace?: (pick: PlacePick) => void
}) {
  // Search box state.
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)

  // The coordinate we want the map to fly to. Bumped on search pick + on
  // geolocation; a fresh object each time so <Recenter> re-fires even when the
  // numbers repeat.
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null)

  // Drag handler is stable but reads the latest onPick via a ref so we don't
  // rebuild the Marker on every parent render.
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  const markerHandlers = useMemo(
    () => ({
      dragend(e: L.DragEndEvent) {
        const m = e.target as L.Marker
        const ll = m.getLatLng()
        onPickRef.current(ll.lat, ll.lng)
      },
    }),
    []
  )

  // Run an OSM Nominatim search for the typed query and show up to 5 hits.
  async function runSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setSearchError(null)
    setResults([])
    try {
      const url =
        'https://nominatim.openstreetmap.org/search?format=json&limit=5' +
        '&addressdetails=1&q=' +
        encodeURIComponent(q)
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`Search failed: ${res.status}`)
      const data = (await res.json()) as NominatimResult[]
      const hits = Array.isArray(data) ? data.slice(0, 5) : []
      setResults(hits)
      if (hits.length === 0) setSearchError('No matches — try a broader search.')
    } catch {
      setSearchError('Could not search right now. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  // Select a search hit → move pin, recenter, report the place to the parent.
  function chooseResult(r: NominatimResult) {
    const lat = Number(r.lat)
    const lng = Number(r.lon)
    if (!validLat(lat) || !validLng(lng)) return
    onPick(lat, lng)
    setFlyTo({ lat, lng })
    setResults([])
    // The first comma-delimited chunk of display_name is a decent short label.
    const label = r.display_name?.split(',')[0]?.trim() || r.display_name || ''
    onPlace?.({
      location: label,
      country: r.address?.country || '',
      lat,
      lng,
    })
  }

  // "Use my current location" → browser geolocation → move pin + recenter.
  function useMyLocation() {
    setGeoError(null)
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('Geolocation is not available in this browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        onPick(lat, lng)
        setFlyTo({ lat, lng })
      },
      () => setGeoError('Could not get your location. Check permissions and try again.'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Stable initial view — Egypt (or the carried-over pick on first mount).
  // Refinement after mount happens via <Recenter>.
  const initialCenter = useMemo<[number, number]>(
    () => (value ? [value.lat, value.lng] : EGYPT_CENTER),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialZoom = useMemo(() => (value ? PICKED_ZOOM : EGYPT_ZOOM), [])

  const hasPin = !!value && validLat(value.lat) && validLng(value.lng)

  return (
    <div>
      {/* Search + "use my location" row */}
      <form
        onSubmit={runSearch}
        style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a place, address or city…"
          style={{
            flex: '1 1 220px',
            minWidth: 0,
            boxSizing: 'border-box',
            padding: '11px 14px',
            fontSize: 14,
            fontFamily: FONT,
            color: COLORS.ink,
            background: '#fff',
            border: '1px solid rgba(42,34,32,0.14)',
            borderRadius: 14,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          style={{
            flex: '0 0 auto',
            padding: '11px 20px',
            fontSize: 14,
            fontWeight: 700,
            fontFamily: FONT,
            color: '#fff',
            background: COLORS.burgundy,
            border: 'none',
            borderRadius: 14,
            cursor: searching || !query.trim() ? 'not-allowed' : 'pointer',
            opacity: searching || !query.trim() ? 0.6 : 1,
          }}
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
        <button
          type="button"
          onClick={useMyLocation}
          style={{
            flex: '0 0 auto',
            padding: '11px 16px',
            fontSize: 14,
            fontWeight: 700,
            fontFamily: FONT,
            color: COLORS.burgundy,
            background: '#fff',
            border: `1px solid ${COLORS.burgundy}`,
            borderRadius: 14,
            cursor: 'pointer',
          }}
        >
          Use my location
        </button>
      </form>

      {/* Search results dropdown */}
      {results.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: '0 0 10px',
            padding: 6,
            background: '#fff',
            border: '1px solid rgba(42,34,32,0.14)',
            borderRadius: 14,
            boxShadow: '0 6px 18px rgba(42,34,32,0.10)',
          }}
        >
          {results.map((r, i) => (
            <li key={`${r.lat},${r.lon},${i}`}>
              <button
                type="button"
                onClick={() => chooseResult(r)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 12px',
                  fontSize: 13,
                  fontFamily: FONT,
                  color: COLORS.ink,
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 10,
                  cursor: 'pointer',
                  lineHeight: 1.35,
                }}
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {(searchError || geoError) && (
        <p style={{ margin: '0 0 10px', fontSize: 13, color: COLORS.burgundy }}>
          {searchError || geoError}
        </p>
      )}

      {/* The map */}
      <div
        style={{
          height: 320,
          width: '100%',
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid rgba(42,34,32,0.14)',
        }}
      >
        <MapContainer
          center={initialCenter}
          zoom={initialZoom}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPlace onPick={onPick} />
          <Recenter target={flyTo} />
          {hasPin && value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={PIN_ICON}
              draggable
              eventHandlers={markerHandlers}
            />
          )}
        </MapContainer>
      </div>

      <p style={{ margin: '8px 0 0', fontSize: 13, color: COLORS.muted }}>
        Tap the map to drop the pin, or drag it to fine-tune the spot.
      </p>
    </div>
  )
}
