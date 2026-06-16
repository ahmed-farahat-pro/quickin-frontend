'use client'

// Google Maps version of the explore price-pin map. Used ONLY when
// NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set (listings-map.tsx decides). Loads the
// Maps JavaScript API on demand, then renders one Airbnb-style burgundy
// "EGP price" pill per listing. Clicking a pill opens an InfoWindow with a photo
// thumbnail + title + location + price + a link to /explore/[id]. The map fits
// its bounds to the markers and rebuilds them whenever the listings change.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Listing } from '@/lib/api'
import SearchThisAreaButton from './search-this-area-button'

const COLORS = {
  burgundy: '#5B0F16',
  ink: '#2A2220',
  muted: '#6B6055',
}

// Egypt-first framing (see leaflet-listings-map for the rationale): open on Egypt,
// prefer Egyptian pins when fitting bounds, and reject impossible coordinates so a
// junk listing can't blow the viewport out to the whole planet.
const EGYPT_CENTER = { lat: 26.8206, lng: 30.8025 }
const EGYPT_ZOOM = 5
const inEgypt = (lat: number, lng: number): boolean =>
  lat >= 22 && lat <= 32 && lng >= 24 && lng <= 37
const validLat = (n: number): boolean => Number.isFinite(n) && n >= -90 && n <= 90
const validLng = (n: number): boolean => Number.isFinite(n) && n >= -180 && n <= 180

type GeoListing = Listing & { lat: number; lng: number }

// Loose structural typings for the slice of the Google Maps JS API we touch are
// declared once in src/types/global.d.ts (as Qk* interfaces) so the GIS and Maps
// `window.google` augmentations don't conflict. Local aliases keep this file
// readable.
type GMap = QkGMap
type GMapsApi = QkGMapsApi
type GInfoWindow = QkGInfoWindow
type GMarkerLike = QkGMarkerLike

// Load the Maps JS API exactly once per page. Subsequent calls reuse the same
// promise (so flipping List/Map or re-rendering never injects a second script).
// Exported so the host add-listing pin-picker (host/location-picker.tsx) shares
// the identical single-script loader instead of injecting a second one.
export function loadGoogleMaps(apiKey: string): Promise<GMapsApi> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser'))
  }
  // NB: no early `Promise.resolve(window.google.maps)` — with loading=async the
  // `Map` class is lazy, so a second caller that finds window.google.maps already
  // present must STILL await importLibrary('maps') or `new google.maps.Map()`
  // throws "Map is not a constructor". The cached promise below guarantees that.
  if (window.__quickinGmapsPromise) return window.__quickinGmapsPromise

  window.__quickinGmapsPromise = new Promise<GMapsApi>((resolve, reject) => {
    // Import the classes we use, THEN resolve. Runs whether we inject the script
    // ourselves or google.maps already exists on the page.
    const ensure = async () => {
      const maps = window.google?.maps
      if (!maps) {
        reject(new Error('Google Maps loaded but window.google.maps is missing'))
        return
      }
      try {
        const importLibrary = (maps as unknown as {
          importLibrary?: (name: string) => Promise<unknown>
        }).importLibrary
        if (typeof importLibrary === 'function') {
          await importLibrary('maps')
          await importLibrary('marker')
          // `places` is best-effort — only the host add-listing search box uses it.
          try {
            await importLibrary('places')
          } catch {
            /* places unavailable — autocomplete just won't attach */
          }
        }
        resolve(maps)
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Google Maps failed to import libraries'))
      }
    }

    // Already loaded (e.g. the host picker injected it first) → just ensure libs.
    if (window.google?.maps) {
      void ensure()
      return
    }

    const params = new URLSearchParams({
      key: apiKey,
      libraries: 'marker,places',
      loading: 'async',
      v: 'weekly',
    })
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.async = true
    script.defer = true
    script.onload = () => void ensure()
    script.onerror = () => reject(new Error('Failed to load Google Maps JS API'))
    document.head.appendChild(script)
  })
  return window.__quickinGmapsPromise
}

function priceLabel(listing: Listing): string {
  return `EGP ${listing.price_per_night}`
}

// Inline "no photo" placeholder (HTML string) for the InfoWindow when a listing
// has no image — mirrors the shared ImagePlaceholder look (tan box + house +
// label) without React, since the InfoWindow body is a raw HTML string.
const PLACEHOLDER_HTML = `
  <div style="width:100%;height:110px;border-radius:10px;margin-bottom:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:linear-gradient(160deg,#EFE6D8 0%,#F6F1E6 100%);color:#6B6055">
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#5B0F16" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="opacity:.55"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/></svg>
    <span style="font-size:11px;font-weight:600">No photo</span>
  </div>`

// Burgundy price-pill DOM node for an AdvancedMarkerElement.
function makePill(label: string): HTMLDivElement {
  const el = document.createElement('div')
  el.textContent = label
  el.style.cssText =
    'background:#5B0F16;color:#fff;font-weight:700;font-size:13px;padding:5px 10px;border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.3);white-space:nowrap;font-family:"DM Sans",ui-sans-serif,system-ui,sans-serif;cursor:pointer'
  return el
}

// InfoWindow body: photo thumbnail + title + location + price + link.
function infoHtml(listing: GeoListing): string {
  const thumb = listing.listing_images[0]?.url || null
  const price = priceLabel(listing)
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  const media = thumb
    ? `<img src="${esc(thumb)}" alt="${esc(listing.title)}" style="width:100%;height:110px;object-fit:cover;border-radius:10px;display:block;margin-bottom:8px" />`
    : PLACEHOLDER_HTML
  return `
    <a href="/explore/${esc(listing.id)}" style="display:block;width:180px;text-decoration:none;color:${COLORS.ink};font-family:'DM Sans',ui-sans-serif,system-ui,sans-serif">
      ${media}
      <div style="font-weight:600;font-size:14px;line-height:1.3">${esc(listing.title)}</div>
      ${listing.location ? `<div style="font-size:12px;color:${COLORS.muted};margin-top:2px">${esc(listing.location)}</div>` : ''}
      <div style="font-size:13px;margin-top:6px">
        <span style="font-weight:700;color:${COLORS.burgundy}">${esc(price)}</span>
        <span style="color:${COLORS.muted}"> / night</span>
      </div>
    </a>`
}

export default function GoogleListingsMap({
  listings,
  apiKey,
  onError,
  onSearchArea,
}: {
  listings: Listing[]
  apiKey: string
  // Called when Google Maps can't be used (bad/restricted key, billing off,
  // or the script fails to load) so the parent can fall back to Leaflet.
  onError?: () => void
  // Called with the current viewport bbox ("minLng,minLat,maxLng,maxLat") when
  // the user taps "Search this area". Omit to hide the button.
  onSearchArea?: (bbox: string) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<GMap | null>(null)
  const apiRef = useRef<GMapsApi | null>(null)
  const infoRef = useRef<GInfoWindow | null>(null)
  const markersRef = useRef<GMarkerLike[]>([])
  // Flips true once the map has booted so the "Search this area" overlay only
  // appears when there's a real viewport to read.
  const [mapReady, setMapReady] = useState(false)

  // Read the live viewport from the map and hand the parent a GeoJSON-order bbox
  // (west,south,east,north = minLng,minLat,maxLng,maxLat).
  const handleSearchArea = () => {
    const map = mapRef.current
    if (!map || !onSearchArea || typeof map.getBounds !== 'function') return
    const b = map.getBounds()
    if (!b) return
    const sw = b.getSouthWest()
    const ne = b.getNorthEast()
    onSearchArea(`${sw.lng()},${sw.lat()},${ne.lng()},${ne.lat()}`)
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

  // Serialize point identities so the marker effect only re-runs on real change.
  const pointsKey = points.map((p) => `${p.id}:${p.lat},${p.lng}`).join('|')

  // (Re)build markers for the current points; also fits bounds to them.
  const renderMarkers = (api: GMapsApi, map: GMap) => {
    // Tear down the previous set.
    for (const m of markersRef.current) m.setMap(null)
    markersRef.current = []

    const info = infoRef.current ?? new api.InfoWindow()
    infoRef.current = info

    const bounds = new api.LatLngBounds()
    const useAdvanced = Boolean(api.marker?.AdvancedMarkerElement)

    for (const listing of points) {
      const position = { lat: listing.lat, lng: listing.lng }
      bounds.extend(position)
      const label = priceLabel(listing)

      let marker: GMarkerLike
      if (useAdvanced && api.marker) {
        marker = new api.marker.AdvancedMarkerElement({
          map,
          position,
          title: listing.title,
          content: makePill(label),
        })
      } else {
        // Classic Marker fallback: burgundy dot + price text label.
        marker = new api.Marker({
          map,
          position,
          title: listing.title,
          label: {
            text: label,
            color: '#ffffff',
            fontWeight: '700',
            fontSize: '12px',
          },
          icon: {
            path: 0, // google.maps.SymbolPath.CIRCLE
            fillColor: COLORS.burgundy,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            scale: 16,
          },
        })
      }

      marker.addListener('click', () => {
        info.setContent(infoHtml(listing))
        info.open({ map, anchor: marker })
      })
      markersRef.current.push(marker)
    }

    // Frame on Egyptian pins when there are any; else on whatever pins exist
    // (e.g. a foreign-location search); else stay on the Egypt home view.
    const egyptian = points.filter((p) => inEgypt(p.lat, p.lng))
    const frame = egyptian.length > 0 ? egyptian : points
    if (frame.length === 1) {
      map.setCenter({ lat: frame[0].lat, lng: frame[0].lng })
      map.setZoom(11)
    } else if (frame.length > 1) {
      const fb = new api.LatLngBounds()
      for (const p of frame) fb.extend({ lat: p.lat, lng: p.lng })
      map.fitBounds(fb, 48)
    } else {
      map.setCenter(EGYPT_CENTER)
      map.setZoom(EGYPT_ZOOM)
    }
  }

  // Boot the map once the API is available.
  useEffect(() => {
    let cancelled = false
    // Google invokes this global on auth failures (InvalidKeyMapError,
    // RefererNotAllowedMapError, billing not enabled). The script still loads,
    // so .catch never fires — this is the only signal. Route it to the fallback.
    ;(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
      if (!cancelled) onError?.()
    }
    loadGoogleMaps(apiKey)
      .then((api) => {
        if (cancelled || !containerRef.current) return
        apiRef.current = api
        if (!mapRef.current) {
          // Always boot on Egypt; renderMarkers() reframes to the actual pins.
          mapRef.current = new api.Map(containerRef.current, {
            center: EGYPT_CENTER,
            zoom: EGYPT_ZOOM,
            // mapId is required for AdvancedMarkerElement; DEMO_MAP_ID works
            // without extra cloud config for prototypes.
            mapId: 'DEMO_MAP_ID',
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          })
        }
        renderMarkers(api, mapRef.current)
        setMapReady(true)
      })
      .catch((err) => {
        // Expected when the Maps key is invalid/restricted or billing is off.
        // Not fatal — the parent swaps in the keyless Leaflet map.
        console.warn('Google Maps unavailable, falling back to Leaflet:', err?.message || err)
        if (!cancelled) onError?.()
      })
    return () => {
      cancelled = true
    }
    // Markers are rebuilt whenever the point set changes (pointsKey).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, pointsKey])

  // Clean up markers/InfoWindow on unmount (e.g. List/Map toggle).
  useEffect(() => {
    return () => {
      for (const m of markersRef.current) m.setMap(null)
      markersRef.current = []
      infoRef.current?.close()
    }
  }, [])

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
      {onSearchArea && mapReady && (
        <SearchThisAreaButton onClick={handleSearchArea} />
      )}
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  )
}
