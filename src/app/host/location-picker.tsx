'use client'

// Google Maps PIN-PICKER for the host add-listing form (host/page.tsx).
// The host clicks anywhere on the map to drop a marker; clicking again moves
// it. The chosen coordinate is reported up via `onPick(lat, lng)` and shown as
// text by the parent. Rendered ONLY when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set
// (the parent decides) and only on the client (imported via next/dynamic with
// { ssr: false }) because it touches `window` at runtime.
//
// IMPORTANT: this REUSES the exact same single-script loader as the explore map
// (loadGoogleMaps, exported from explore/google-listings-map.tsx) so the Maps JS
// API is never injected twice on the same page.
import { useEffect, useRef } from 'react'
import { loadGoogleMaps } from '@/app/explore/google-listings-map'

const COLORS = {
  burgundy: '#5B0F16',
}

// Map center until the host clicks (Dubai).
const DUBAI = { lat: 25.2048, lng: 55.2708 }

type GMap = QkGMap
type GMapsApi = QkGMapsApi
type GMarkerLike = QkGMarkerLike

// Burgundy pin DOM node for an AdvancedMarkerElement (matches the explore pills).
function makePin(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText =
    'width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#5B0F16;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)'
  return el
}

export default function LocationPicker({
  apiKey,
  value,
  onPick,
}: {
  apiKey: string
  // Currently chosen coordinate (if any) — keeps the marker in sync when the
  // form is reset after a successful publish.
  value: { lat: number; lng: number } | null
  onPick: (lat: number, lng: number) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<GMap | null>(null)
  const apiRef = useRef<GMapsApi | null>(null)
  const markerRef = useRef<GMarkerLike | null>(null)
  // Latest onPick without forcing the boot effect to re-run when the parent
  // re-renders (the parent passes a fresh closure each render).
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  // Place or move the single marker to the given coordinate.
  const placeMarker = (api: GMapsApi, map: GMap, lat: number, lng: number) => {
    const position = { lat, lng }
    if (markerRef.current) {
      if (markerRef.current.setPosition) markerRef.current.setPosition(position)
      else markerRef.current.position = position
      return
    }
    if (api.marker?.AdvancedMarkerElement) {
      markerRef.current = new api.marker.AdvancedMarkerElement({
        map,
        position,
        content: makePin(),
      })
    } else {
      // Classic Marker fallback (no mapId / marker library).
      markerRef.current = new api.Marker({
        map,
        position,
        icon: {
          path: 0, // google.maps.SymbolPath.CIRCLE
          fillColor: COLORS.burgundy,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 9,
        },
      })
    }
  }

  // Boot the map once. The click handler is the only writer of coordinates.
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
        // Restore an existing pick (e.g. coords typed manually before mount).
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
  )
}
