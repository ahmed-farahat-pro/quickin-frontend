'use client'

// Google Maps PIN-PICKER for the host add-listing wizard (host/page.tsx, step 2).
// Two ways to set the coordinate:
//   • a PLACE SEARCH box (Google Places Autocomplete) above the map — picking a
//     result recenters the map, moves the pin, and reports the place name +
//     country back to the parent via `onPlace`.
//   • the MAP itself — tapping drops/moves the burgundy pin; the pin is also
//     DRAGGABLE for fine-tuning. Either gesture reports the coordinate via
//     `onPick(lat, lng)`.
// Rendered ONLY when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set (the parent decides)
// and only on the client (next/dynamic { ssr: false }) because it touches
// `window` at runtime.
//
// IMPORTANT: this REUSES the exact same single-script loader as the explore map
// (loadGoogleMaps, exported from explore/google-listings-map.tsx) so the Maps JS
// API is never injected twice on the same page. That loader now also pulls in
// the `places` library used by the Autocomplete below.
import { useEffect, useRef } from 'react'
import { loadGoogleMaps } from '@/app/explore/google-listings-map'

const COLORS = {
  burgundy: '#5B0F16',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

// Map center until the host picks something (Dubai).
const DUBAI = { lat: 25.2048, lng: 55.2708 }

type GMap = QkGMap
type GMapsApi = QkGMapsApi
type GMarkerLike = QkGMarkerLike
type GAutocomplete = QkGAutocomplete

// Resolved from a Places Autocomplete selection and handed to the parent so it
// can fill the listing's location + country fields.
export interface PlacePick {
  location: string
  country: string
  lat: number
  lng: number
}

// Burgundy pin DOM node for an AdvancedMarkerElement (matches the explore pills).
function makePin(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText =
    'width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#5B0F16;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)'
  return el
}

// Pull the country `long_name` out of a place's address_components.
function countryOf(place: QkGPlaceResult): string {
  const comp = place.address_components?.find((c) => c.types.includes('country'))
  return comp?.long_name ?? ''
}

export default function LocationPicker({
  apiKey,
  value,
  onPick,
  onPlace,
}: {
  apiKey: string
  // Currently chosen coordinate (if any) — keeps the marker in sync when the
  // form is reset after a successful publish.
  value: { lat: number; lng: number } | null
  onPick: (lat: number, lng: number) => void
  // Fired when a Places Autocomplete result is chosen: carries the resolved
  // human label + country alongside the coordinate.
  onPlace?: (pick: PlacePick) => void
}) {
  const searchRef = useRef<HTMLInputElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<GMap | null>(null)
  const apiRef = useRef<GMapsApi | null>(null)
  const markerRef = useRef<GMarkerLike | null>(null)
  const acRef = useRef<GAutocomplete | null>(null)
  // Latest callbacks without forcing the boot effect to re-run when the parent
  // re-renders (the parent passes fresh closures each render).
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const onPlaceRef = useRef(onPlace)
  onPlaceRef.current = onPlace

  // Place or move the single (draggable) marker to the given coordinate.
  const placeMarker = (api: GMapsApi, map: GMap, lat: number, lng: number) => {
    const position = { lat, lng }
    if (markerRef.current) {
      if (markerRef.current.setPosition) markerRef.current.setPosition(position)
      else markerRef.current.position = position
      return
    }
    if (api.marker?.AdvancedMarkerElement) {
      const marker = new api.marker.AdvancedMarkerElement({
        map,
        position,
        gmpDraggable: true,
        content: makePin(),
      })
      // Dragging fine-tunes; the AdvancedMarkerElement carries the coordinate in
      // the event's `latLng`.
      marker.addListener('gmp-dragend', (e) => {
        const ll = e?.latLng
        if (ll) onPickRef.current(ll.lat(), ll.lng())
      })
      markerRef.current = marker
    } else {
      // Classic Marker fallback (no mapId / marker library).
      const marker = new api.Marker({
        map,
        position,
        draggable: true,
        icon: {
          path: 0, // google.maps.SymbolPath.CIRCLE
          fillColor: COLORS.burgundy,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 9,
        },
      })
      marker.addListener('dragend', () => {
        const ll = marker.getPosition?.()
        if (ll) onPickRef.current(ll.lat(), ll.lng())
      })
      markerRef.current = marker
    }
  }

  // Boot the map + autocomplete once.
  useEffect(() => {
    let cancelled = false
    loadGoogleMaps(apiKey)
      .then((api) => {
        if (cancelled || !containerRef.current) return
        apiRef.current = api
        if (!mapRef.current) {
          mapRef.current = new api.Map(containerRef.current, {
            center: value ?? DUBAI,
            zoom: value ? 13 : 10,
            // mapId enables AdvancedMarkerElement; DEMO_MAP_ID needs no cloud
            // config (same as the explore map).
            mapId: 'DEMO_MAP_ID',
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          })
          // Tapping the map drops/moves the pin.
          mapRef.current.addListener('click', (e) => {
            const ll = e.latLng
            if (!ll) return
            const lat = ll.lat()
            const lng = ll.lng()
            if (apiRef.current && mapRef.current) {
              placeMarker(apiRef.current, mapRef.current, lat, lng)
            }
            onPickRef.current(lat, lng)
          })
        }

        // Places Autocomplete on the search box (best-effort — only when the
        // `places` library loaded).
        if (api.places?.Autocomplete && searchRef.current && !acRef.current) {
          const ac = new api.places.Autocomplete(searchRef.current, {
            fields: ['name', 'formatted_address', 'geometry', 'address_components'],
          })
          ac.addListener('place_changed', () => {
            const place = ac.getPlace()
            const loc = place.geometry?.location
            if (!loc || !mapRef.current || !apiRef.current) return
            const lat = loc.lat()
            const lng = loc.lng()
            // Recenter + move the pin.
            if (mapRef.current.panTo) mapRef.current.panTo({ lat, lng })
            else mapRef.current.setCenter({ lat, lng })
            mapRef.current.setZoom(14)
            placeMarker(apiRef.current, mapRef.current, lat, lng)
            onPickRef.current(lat, lng)
            onPlaceRef.current?.({
              location: place.name || place.formatted_address || '',
              country: countryOf(place),
              lat,
              lng,
            })
          })
          acRef.current = ac
        }

        // Restore an existing pick (e.g. coords carried over from a prior step).
        if (value) placeMarker(api, mapRef.current, value.lat, value.lng)
      })
      .catch((err) => {
        console.error('Google Maps pin-picker init failed:', err)
      })
    return () => {
      cancelled = true
    }
    // Boot once per apiKey; value is reconciled by the dedicated effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  // Keep the marker in sync with the controlled `value` (covers form reset to
  // null after publish, and manual lat/lng edits in the text inputs).
  useEffect(() => {
    const api = apiRef.current
    const map = mapRef.current
    if (!api || !map) return
    if (value) {
      placeMarker(api, map, value.lat, value.lng)
    } else if (markerRef.current) {
      markerRef.current.setMap(null)
      markerRef.current = null
    }
    // placeMarker is stable enough for this controlled-sync; deps are the coords.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng])

  // Clean up the marker on unmount.
  useEffect(() => {
    return () => {
      markerRef.current?.setMap(null)
      markerRef.current = null
    }
  }, [])

  return (
    <div>
      <input
        ref={searchRef}
        type="text"
        placeholder="Search a place, address or city…"
        style={{
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
          marginBottom: 10,
        }}
      />
      <div
        style={{
          height: 320,
          width: '100%',
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid rgba(42,34,32,0.14)',
        }}
      >
        <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      </div>
    </div>
  )
}
