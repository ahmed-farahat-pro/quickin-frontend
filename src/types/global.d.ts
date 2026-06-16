// Shared ambient declarations for the `window.google` global, used by both the
// Google Identity Services sign-in (login/signup) and the Google Maps explore
// map. Declaring it in one place avoids conflicting `declare global` blocks
// (merged `interface Window` augmentations must agree on each property's type).
//
// This file is a NON-module ambient declaration (no top-level import/export), so
// every interface below is global and the `interface Window` merge applies
// project-wide.

// ---- Google Maps (loose structural slice we actually touch) -----------------
interface QkGLatLng {
  lat(): number
  lng(): number
}
interface QkGLatLngBounds {
  extend(p: { lat: number; lng: number }): void
  isEmpty(): boolean
  getCenter(): QkGLatLng
  // Corner accessors — used by the explore "Search this area" button to read the
  // current viewport from map.getBounds().
  getNorthEast(): QkGLatLng
  getSouthWest(): QkGLatLng
}
interface QkGMap {
  fitBounds(bounds: QkGLatLngBounds, padding?: number): void
  setCenter(p: { lat: number; lng: number }): void
  // Smooth recenter — used when a Places Autocomplete result is picked.
  panTo?: (p: { lat: number; lng: number }) => void
  setZoom(z: number): void
  // Current viewport bounds — used by the explore "Search this area" button.
  // Optional/undefined until the map has finished its first layout.
  getBounds?: () => QkGLatLngBounds | null | undefined
  // Map clicks carry the clicked coordinate in `latLng`; used by the host
  // add-listing pin-picker (host/location-picker.tsx).
  addListener(event: string, handler: (e: QkGMapMouseEvent) => void): void
}
// A Maps mouse event. `latLng` is optional because some map events fire without
// a coordinate (e.g. clicks on UI controls).
interface QkGMapMouseEvent {
  latLng?: QkGLatLng | null
}
interface QkGInfoWindow {
  setContent(content: string | Node): void
  open(opts: { map: QkGMap; anchor?: unknown }): void
  close(): void
}
interface QkGMarkerLike {
  setMap(map: QkGMap | null): void
  // Marker events. Both the click-to-place picker and the draggable pin attach
  // listeners; AdvancedMarkerElement fires `gmp-dragend` (payload carries the
  // coordinate in `latLng`), classic Marker fires `dragend` (read via
  // `getPosition`). The handler arg is optional so plain `click` handlers fit.
  addListener(event: string, handler: (e?: QkGMapMouseEvent) => void): void
  // Reposition an existing marker. Classic Markers accept a {lat,lng}; the
  // AdvancedMarkerElement exposes `position` as a settable property. The
  // host pin-picker prefers `setPosition` when present and falls back to
  // assigning `position`.
  setPosition?: (p: { lat: number; lng: number }) => void
  // Classic Marker — current position after a drag.
  getPosition?: () => QkGLatLng | null
  position?: { lat: number; lng: number } | null
}
// ---- Places Autocomplete (the slice the host search box touches) ------------
interface QkGPlaceAddressComponent {
  long_name: string
  short_name: string
  types: string[]
}
interface QkGPlaceGeometry {
  location: QkGLatLng
}
interface QkGPlaceResult {
  name?: string
  formatted_address?: string
  geometry?: QkGPlaceGeometry
  address_components?: QkGPlaceAddressComponent[]
}
interface QkGAutocomplete {
  addListener(event: string, handler: () => void): void
  getPlace(): QkGPlaceResult
}
interface QkGMapsApi {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => QkGMap
  LatLngBounds: new () => QkGLatLngBounds
  InfoWindow: new (opts?: Record<string, unknown>) => QkGInfoWindow
  Marker: new (opts: Record<string, unknown>) => QkGMarkerLike
  marker?: {
    AdvancedMarkerElement: new (opts: Record<string, unknown>) => QkGMarkerLike
  }
  places?: {
    Autocomplete: new (
      input: HTMLInputElement,
      opts?: Record<string, unknown>
    ) => QkGAutocomplete
  }
}

// ---- Google Identity Services (sign-in) -------------------------------------
interface QkGAccountsId {
  initialize: (config: {
    client_id: string
    callback: (resp: { credential?: string }) => void
  }) => void
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
  prompt: () => void
}

interface Window {
  google?: {
    maps?: QkGMapsApi
    accounts?: { id: QkGAccountsId }
  }
  __quickinGmapsPromise?: Promise<QkGMapsApi>
}
