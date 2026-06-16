'use client'

// Leaflet map for the explore page with Airbnb-style PRICE PINS.
// Rendered ONLY on the client (imported via next/dynamic with { ssr: false }
// from listings-map.tsx) because Leaflet touches `window` at module load.
//
// Each listing is drawn as a rounded burgundy "EGP price" pill (an L.divIcon)
// instead of the default teardrop marker. Clicking a pill opens a popup with a
// photo thumbnail + title + location + price + a link to /explore/[id].
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Listing } from '@/lib/api'
import ImagePlaceholder from '../_components/image-placeholder'
import SearchThisAreaButton from './search-this-area-button'

const COLORS = {
  burgundy: '#5B0F16',
  ink: '#2A2220',
  muted: '#6B6055',
}

// This is an Egypt-focused product, so the map opens framed on Egypt rather than
// the whole world. A rough Egypt bounding box lets us prefer Egyptian pins when
// deciding the initial frame (stray international demo listings still render, but
// don't yank the view out to a global zoom).
const EGYPT_CENTER: [number, number] = [26.8206, 30.8025]
const EGYPT_ZOOM = 5
const inEgypt = (lat: number, lng: number): boolean =>
  lat >= 22 && lat <= 32 && lng >= 24 && lng <= 37

// Guard against bad data: latitude must be within ±90 and longitude within ±180.
// Without this, a junk listing (e.g. lat 3213213) blows the fit-bounds out to the
// entire planet and the map looks broken.
const validLat = (n: number): boolean => Number.isFinite(n) && n >= -90 && n <= 90
const validLng = (n: number): boolean => Number.isFinite(n) && n >= -180 && n <= 180

type GeoListing = Listing & { lat: number; lng: number }

// Escape any user-controlled text we drop into the divIcon HTML string.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Build the rounded burgundy price-pill marker (Airbnb style). The pill scales
// itself, so we let Leaflet size the icon to its content and anchor it at the
// center so the pill sits exactly over the coordinate.
function priceIcon(listing: GeoListing): L.DivIcon {
  const price = `EGP ${listing.price_per_night}`
  return L.divIcon({
    className: '',
    iconSize: undefined,
    iconAnchor: undefined,
    html: `<div style="background:#5B0F16;color:#fff;font-weight:700;font-size:13px;padding:5px 10px;border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.3);white-space:nowrap;transform:translate(-50%,-50%);display:inline-block">${esc(price)}</div>`,
  })
}

// Keep the visible map bounds in sync with the current (filtered) markers.
function FitBounds({ points }: { points: GeoListing[] }) {
  const map = useMap()
  // Serialize coordinates so the effect only re-runs when the set actually changes.
  const key = points.map((p) => `${p.id}:${p.lat},${p.lng}`).join('|')

  useEffect(() => {
    // Frame on Egyptian pins when there are any; otherwise on whatever valid pins
    // exist (e.g. the user filtered to a foreign location); otherwise Egypt.
    const egyptian = points.filter((p) => inEgypt(p.lat, p.lng))
    const frame = egyptian.length > 0 ? egyptian : points
    if (frame.length === 0) {
      map.setView(EGYPT_CENTER, EGYPT_ZOOM, { animate: false })
      return
    }
    if (frame.length === 1) {
      map.setView([frame[0].lat, frame[0].lng], 11, { animate: false })
      return
    }
    const bounds = L.latLngBounds(frame.map((p) => [p.lat, p.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13, animate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])

  return null
}

// Grabs the Leaflet map instance into the parent via a setter. Lives inside
// MapContainer so useMap() resolves; renders nothing. We read bounds off this
// instance when "Search this area" is clicked.
function MapInstanceCapture({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap()
  useEffect(() => {
    onReady(map)
  }, [map, onReady])
  return null
}

export default function LeafletListingsMap({
  listings,
  onSearchArea,
}: {
  listings: Listing[]
  // Called with the current viewport bbox ("minLng,minLat,maxLng,maxLat") when
  // the user taps "Search this area". Omit to hide the button.
  onSearchArea?: (bbox: string) => void
}) {
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null)

  // Read the live viewport from the captured map instance and hand the parent a
  // GeoJSON-order bbox (west,south,east,north = minLng,minLat,maxLng,maxLat).
  const handleSearchArea = () => {
    if (!mapInstance || !onSearchArea) return
    const b = mapInstance.getBounds()
    const sw = b.getSouthWest()
    const ne = b.getNorthEast()
    onSearchArea(`${sw.lng},${sw.lat},${ne.lng},${ne.lat}`)
  }

  // Only listings with real coordinates can be placed on the map.
  const points = useMemo<GeoListing[]>(
    () =>
      listings.filter(
        (l): l is GeoListing =>
          typeof l.lat === 'number' &&
          typeof l.lng === 'number' &&
          validLat(l.lat) &&
          validLng(l.lng)
      ),
    [listings]
  )

  // Stable initial view: always open on Egypt (FitBounds refines to the actual
  // pins once mounted). MapContainer only reads `center`/`zoom` on first mount,
  // so these are computed once and never recomputed — feeding fresh values on
  // every keystroke would otherwise yank the viewport while the user pans.
  const initialCenter = useMemo<[number, number]>(() => EGYPT_CENTER, [])
  const initialZoom = useMemo(() => EGYPT_ZOOM, [])

  return (
    <div
      style={{
        position: 'relative',
        height: '70vh',
        width: '100%',
        borderRadius: 22,
        overflow: 'hidden',
        border: '1px solid rgba(42,34,32,0.08)',
        boxShadow: '0 6px 24px rgba(42,34,32,0.08)',
      }}
    >
      {onSearchArea && mapInstance && (
        <SearchThisAreaButton onClick={handleSearchArea} />
      )}
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <MapInstanceCapture onReady={setMapInstance} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {points.map((listing) => {
          const thumb = listing.listing_images[0]?.url || null
          const price = `EGP ${listing.price_per_night}`
          return (
            <Marker
              key={listing.id}
              position={[listing.lat, listing.lng]}
              icon={priceIcon(listing)}
            >
              <Popup>
                <a
                  href={`/explore/${listing.id}`}
                  style={{
                    display: 'block',
                    width: 180,
                    textDecoration: 'none',
                    color: COLORS.ink,
                  }}
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={listing.title}
                      style={{
                        width: '100%',
                        height: 110,
                        objectFit: 'cover',
                        borderRadius: 10,
                        display: 'block',
                        marginBottom: 8,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        height: 110,
                        borderRadius: 10,
                        overflow: 'hidden',
                        marginBottom: 8,
                        background: '#EFE6D8',
                      }}
                    >
                      <ImagePlaceholder iconSize={24} fontSize={11} />
                    </div>
                  )}
                  <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>
                    {listing.title}
                  </div>
                  {listing.location && (
                    <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
                      {listing.location}
                    </div>
                  )}
                  <div style={{ fontSize: 13, marginTop: 6 }}>
                    <span style={{ fontWeight: 700, color: COLORS.burgundy }}>
                      {price}
                    </span>{' '}
                    <span style={{ color: COLORS.muted }}>/ night</span>
                  </div>
                </a>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}
