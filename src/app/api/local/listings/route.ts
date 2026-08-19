import { NextResponse } from 'next/server'
import { getListings, createListing, isListingInputError, getListingGateState } from '@/lib/local/db'
import { getUserFromRequest } from '@/lib/local/auth'
import { checkListingPin, listingPinProblemMessage } from '@/lib/local/listing-geo-policy'
import { canPublishListing } from '@/lib/local/host-verification-core'

// Local-only API (no Supabase). GET /api/local/listings → JSON array.
// Supports search: ?location=&guests=&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
// Consumed by the /explore web page and the iOS + Android apps.
//   POST /api/local/listings { ...listing fields, images?, ownership_doc? }
//        → { listing, pin_warning } (auth; host_id = caller). The ownership doc is
//        the proof-of-ownership image an admin reviews in /ops before the listing
//        goes live. `pin_warning` is null, or the reason the map pin disagrees
//        with the country/region — a warning; the listing is created either way.
export const dynamic = 'force-dynamic'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }

/** Accepts http(s) image URLs or inline base64 image data URLs (device uploads). */
function isImageSrc(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(v)) return true
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const listings = await getListings({
      location: url.searchParams.get('location') || undefined,
      guests: url.searchParams.get('guests') ? Number(url.searchParams.get('guests')) : undefined,
      checkIn: url.searchParams.get('checkIn') || undefined,
      checkOut: url.searchParams.get('checkOut') || undefined,
      type: url.searchParams.get('type') || undefined,
      sortBy: url.searchParams.get('sort') || undefined,
    })
    return NextResponse.json(listings, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('GET /api/local/listings failed:', err)
    return NextResponse.json(
      { error: 'Failed to load listings' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Please sign in to create a listing' }, { status: 401, headers: CORS })
    // This route previously required nothing beyond a session, so any signed-in
    // guest could create a listing here even though the mobile API has always
    // required a host. Both checks now live in one place: approved host AND
    // identity-verified. The `code` lets the client show the right next step.
    const gate = canPublishListing(await getListingGateState(user.id))
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.message, code: gate.code }, { status: 403, headers: CORS })
    }
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: CORS })
    const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v))
    const listing = await createListing(user.id, {
      title: String(body.title ?? ''),
      description: body.description ?? undefined,
      location: body.location ?? undefined,
      country: body.country ?? undefined,
      lat: num(body.lat),
      lng: num(body.lng),
      price_per_night: Number(body.price_per_night),
      weekend_price: num(body.weekend_price),
      // Cleaned and judged in one place — createListing runs
      // listing-pricing-core, which drops junk days and refuses all seven.
      weekend_days: body.weekend_days,
      currency: body.currency ?? undefined,
      // Deliberately NOT run through num(): `Number('')` is 0, and 0 bedrooms is
      // the bug. createListing decides these through listing-capacity-policy.
      bedrooms: body.bedrooms,
      beds: body.beds,
      bathrooms: body.bathrooms,
      max_guests: body.max_guests,
      property_type: body.property_type ?? undefined,
      // Curated area + amenity chips — same catalogs the edit form uses.
      region: body.region ?? undefined,
      resort_id: body.resort_id ?? body.resortId ?? undefined,
      resort_name: body.resort_name ?? body.resortName ?? undefined,
      amenities: Array.isArray(body.amenities) ? body.amenities : undefined,
      images: Array.isArray(body.images)
        ? body.images.filter(isImageSrc).map((u: string) => u.trim())
        : undefined,
      // Same alias pair the mobile apps send (ownership_doc / ownershipDoc).
      ownership_doc: body.ownership_doc ?? body.ownershipDoc ?? undefined,
    })
    // A pin that disagrees with the country/region the host chose is reported,
    // never refused — see listing-geo-policy.ts. The host form already renders
    // this verdict under its map from the same module, so nothing on the web
    // needs the field; it is here because the mobile API answers with it on the
    // same route, and a caller pointed at either door should get the same answer.
    const pinProblem = checkListingPin(listing)
    return NextResponse.json(
      {
        listing,
        pin_warning: pinProblem
          ? { code: pinProblem.code, scope: pinProblem.scope, message: listingPinProblemMessage(pinProblem) }
          : null,
      },
      { status: 201, headers: CORS },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('POST /api/local/listings failed:', err)
    // Same split as PATCH: a fixable input problem answers 400 with its reason.
    if (isListingInputError(err) || /Invalid|required|attach a photo|too large/i.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 400, headers: CORS })
    }
    return NextResponse.json({ error: 'Failed to create listing' }, { status: 500, headers: CORS })
  }
}
