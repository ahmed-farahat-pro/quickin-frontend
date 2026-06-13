'use client'

// Map chooser for the explore page. Prefers Google Maps, but ALWAYS falls back
// to the keyless Leaflet (OpenStreetMap) map so the page is never without a
// working map:
//
//   - key present + Google loads  -> Google Maps (google-listings-map.tsx)
//   - key missing                 -> Leaflet price-pin map
//   - key present but Google FAILS -> Leaflet price-pin map (runtime fallback)
//
// The last case is the important one: a restricted/expired key or a project with
// billing off makes Google render a useless grey error tile (and historically
// threw "t.Map is not a constructor"). google-listings-map calls onError in that
// case (via Google's gm_authFailure global + the loader catch), and we swap to
// Leaflet — which needs no key, no billing, and no referrer allow-list.
//
// Both render the same Airbnb-style burgundy "EGP price" pills over the FILTERED
// listings. Client-only: explore-client.tsx imports this via next/dynamic with
// { ssr: false } because both map libraries touch `window` at load time.
import { useState } from 'react'
import type { Listing } from '@/lib/api'
import LeafletListingsMap from './leaflet-listings-map'
import GoogleListingsMap from './google-listings-map'

// Inlined at build time by Next. Falls back to the project key so the deployed map
// works without needing the Vercel env var (the key is exposed client-side anyway).
// Empty only if you explicitly want the Leaflet fallback.
const GOOGLE_MAPS_API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyBigDJt5v66YrCqY-kd-V7AdU8fJl3N5_I'

export default function ListingsMap({ listings }: { listings: Listing[] }) {
  const [googleFailed, setGoogleFailed] = useState(false)
  if (GOOGLE_MAPS_API_KEY && !googleFailed) {
    return (
      <GoogleListingsMap
        listings={listings}
        apiKey={GOOGLE_MAPS_API_KEY}
        onError={() => setGoogleFailed(true)}
      />
    )
  }
  return <LeafletListingsMap listings={listings} />
}
