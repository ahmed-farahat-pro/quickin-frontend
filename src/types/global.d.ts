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
}
interface QkGMap {
  fitBounds(bounds: QkGLatLngBounds, padding?: number): void
  setCenter(p: { lat: number; lng: number }): void
  setZoom(z: number): void
}
interface QkGInfoWindow {
  setContent(content: string | Node): void
  open(opts: { map: QkGMap; anchor?: unknown }): void
  close(): void
}
interface QkGMarkerLike {
  setMap(map: QkGMap | null): void
  addListener(event: string, handler: () => void): void
}
interface QkGMapsApi {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => QkGMap
  LatLngBounds: new () => QkGLatLngBounds
  InfoWindow: new (opts?: Record<string, unknown>) => QkGInfoWindow
  Marker: new (opts: Record<string, unknown>) => QkGMarkerLike
  marker?: {
    AdvancedMarkerElement: new (opts: Record<string, unknown>) => QkGMarkerLike
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
