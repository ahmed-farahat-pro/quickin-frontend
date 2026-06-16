'use client'

// Client-side browse experience: live type-to-filter search + a List/Map toggle.
// The server component (page.tsx) renders the header/footer and passes the first
// page of listings as `initialListings` so the first paint is instant. The live
// search re-fetches the backend API directly.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  API_URL,
  aiSearch,
  buildListingQuery,
  getListings,
  type AiSearchFilters,
  type ListingFilters,
  type Listing,
} from '@/lib/api'
import { fetchWishlistIds } from '@/lib/wishlist'
import DatePickerField from '../_components/date-picker-field'
import ImagePlaceholder from '../_components/image-placeholder'
import HeartButton from '../_components/heart-button'
import RatingStars from '../_components/rating-stars'
import { useLanguage } from '@/lib/i18n/language-provider'
import { useCurrency } from '@/lib/currency/currency-provider'

// Leaflet must never run on the server (it reads `window` at import time), so
// the map is a client-only dynamic import with SSR disabled.
const ListingsMap = dynamic(() => import('./listings-map'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: '70vh',
        width: '100%',
        borderRadius: 22,
        border: '1px solid rgba(42,34,32,0.08)',
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6B6055',
        fontSize: 14,
      }}
    >
      Loading map…
    </div>
  ),
})

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  page: '#E4DECF',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  gold: '#B07A2A',
}

const GRAD_BURGUNDY = 'linear-gradient(135deg,#5B0F16,#8a2530)'
// A warm boutique cover used as the hero Ken Burns backdrop.
const HERO_COVER =
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=70'

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'
const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif'

type View = 'list' | 'map'

// One canonical area + how many published listings it holds (GET
// /api/local/regions). Selecting one adds `region=<region>` to the fetch.
interface RegionCount {
  region: string
  count: number
}

// Sort options offered by the segmented control; the value is sent verbatim as
// `sort=` to the backend. 'recommended' is the default and omitted from the URL.
type Sort = 'recommended' | 'price_asc' | 'price_desc' | 'newest'

// `labelKey` resolves to a translation at render time (see the component below).
const SORT_OPTIONS: { value: Sort; labelKey: string }[] = [
  { value: 'recommended', labelKey: 'explore.sort.recommended' },
  { value: 'price_asc', labelKey: 'explore.sort.priceAsc' },
  { value: 'price_desc', labelKey: 'explore.sort.priceDesc' },
  { value: 'newest', labelKey: 'explore.sort.newest' },
]

// Coarse property types the backend matches case-insensitively. Kept in sync
// with the host add-listing vocabulary; the value is sent verbatim as
// `propertyType=`. Each label is translated via `propertyType.<value>`.
const PROPERTY_TYPES = ['Apartment', 'Chalet', 'House', 'Villa'] as const

// Canonical amenity strings (identical to the host add-listing AMENITIES). The
// English value is sent to the API as part of `amenities=`; the visible label is
// translated via `amenity.<value>`. A listing must have ALL selected amenities.
const AMENITIES = [
  'WiFi',
  'Pool',
  'Kitchen',
  'Air conditioning',
  'Free parking',
  'Washer',
  'TV',
  'Heating',
  'Workspace',
  'Gym',
  'Beach access',
  'Pets allowed',
  'Hot tub',
  'BBQ grill',
  'Breakfast',
] as const

interface Filters {
  location: string
  checkIn: string
  checkOut: string
  guests: string
  region: string
  sort: Sort
  minPrice: string
  maxPrice: string
  // Discovery filters. `propertyType` is one coarse type or '' (any); `amenities`
  // is the set the listing must have ALL of; `bbox` is the map viewport set by
  // "Search this area" ('' when not constrained to a viewport).
  propertyType: string
  amenities: string[]
  bbox: string
}

interface Props {
  initialListings: Listing[]
  initialFilters: Filters
}

// Serialize the local Filters into the backend query string. The Filters fields
// already mirror ListingFilters one-to-one, so we delegate to the shared builder
// in lib/api (keeps param names + omit rules identical to the server fetch).
function buildQuery(f: Filters): string {
  return buildListingQuery(f as ListingFilters)
}

const EMPTY: Filters = {
  location: '',
  checkIn: '',
  checkOut: '',
  guests: '',
  region: '',
  sort: 'recommended',
  minPrice: '',
  maxPrice: '',
  propertyType: '',
  amenities: [],
  bbox: '',
}

export default function ExploreClient({ initialListings, initialFilters }: Props) {
  const { t } = useLanguage()
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [listings, setListings] = useState<Listing[]>(initialListings)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [view, setView] = useState<View>('list')

  // Natural-language ("Ask AI") search. Independent of the structured filters
  // above: the host types a sentence, we POST it to /api/local/ai/search, then
  // render the parsed filters as chips + the matching listings. `aiActive` flips
  // the results section over to the AI result set; "Apply these filters" maps the
  // parsed filters back into the structured state and returns to normal mode.
  const [aiQuery, setAiQuery] = useState('')
  const [aiSearching, setAiSearching] = useState(false)
  const [aiError, setAiError] = useState(false)
  const [aiActive, setAiActive] = useState(false)
  const [aiFilters, setAiFilters] = useState<AiSearchFilters>({})
  const [aiListings, setAiListings] = useState<Listing[]>([])
  const aiAbortRef = useRef<AbortController | null>(null)

  // Canonical regions for the chip row (GET /api/local/regions). Fetched once on
  // mount; the row stays hidden until it loads (or silently if the call fails).
  const [regions, setRegions] = useState<RegionCount[]>([])

  // Saved listing ids (the user's wishlist) — used to pre-light the hearts on
  // each card. Only populated when signed in; stays empty otherwise.
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  // Tracks the query string that produced `listings`, so we can skip the very
  // first fetch (the server already rendered that exact result set).
  const lastQueryRef = useRef<string>(buildQuery(initialFilters))
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(async (f: Filters) => {
    const query = buildQuery(f)
    // Skip redundant fetches (e.g. whitespace-only edits that don't change params).
    if (query === lastQueryRef.current) return
    lastQueryRef.current = query

    // Abort any in-flight request so only the latest keystroke wins.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setSearching(true)
    setSearchError(false)
    try {
      const data = await getListings(f as ListingFilters, controller.signal)
      // Ignore stale responses that lost the race.
      if (!controller.signal.aborted) setListings(data)
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        // Keep the previous results on transient failure; just clear the spinner
        // and surface a subtle, non-blocking notice.
        console.error('Live search failed:', err)
        setSearchError(true)
      }
    } finally {
      if (abortRef.current === controller) {
        setSearching(false)
        abortRef.current = null
      }
    }
  }, [])

  // Debounce location typing (~300ms); fire dates/guests immediately.
  // A "Search this area" bbox is tied to a specific viewport, so changing a broad
  // filter (where/dates/guests/region/sort/price) drops it — amenities and
  // property type are allowed to compose with an active area, so they keep it.
  const updateFilter = useCallback(
    (patch: Partial<Filters>, opts?: { debounce?: boolean }) => {
      const composesWithArea =
        'bbox' in patch ||
        Object.keys(patch).every(
          (k) => k === 'amenities' || k === 'propertyType'
        )
      setFilters((prev) => {
        const next = { ...prev, ...patch }
        if (!composesWithArea) next.bbox = ''
        if (debounceRef.current) clearTimeout(debounceRef.current)
        if (opts?.debounce) {
          debounceRef.current = setTimeout(() => runSearch(next), 300)
        } else {
          runSearch(next)
        }
        return next
      })
    },
    [runSearch]
  )

  // Toggle a single amenity on/off (keeps any active "Search this area" bbox).
  const toggleAmenity = useCallback(
    (amenity: string) => {
      setFilters((prev) => {
        const has = prev.amenities.includes(amenity)
        const amenities = has
          ? prev.amenities.filter((a) => a !== amenity)
          : [...prev.amenities, amenity]
        const next = { ...prev, amenities }
        if (debounceRef.current) clearTimeout(debounceRef.current)
        runSearch(next)
        return next
      })
    },
    [runSearch]
  )

  // Reset only the discovery filters (amenities + property type). Other filters
  // (region/dates/guests/price/sort) and any active area are preserved.
  const clearDiscoveryFilters = useCallback(() => {
    setFilters((prev) => {
      const next = { ...prev, amenities: [], propertyType: '' }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      runSearch(next)
      return next
    })
  }, [runSearch])

  // "Search this area" — refetch listings within the map's current viewport,
  // merged with every other active filter (amenities/propertyType/region/…).
  const searchThisArea = useCallback((bbox: string) => {
    updateFilter({ bbox })
  }, [updateFilter])

  const clearAll = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setFilters(EMPTY)
    runSearch(EMPTY)
  }, [runSearch])

  // The round Search button — flush any pending debounce immediately.
  const submitSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    runSearch(filters)
  }, [filters, runSearch])

  // Run the natural-language search. POSTs the typed sentence to the AI endpoint,
  // then shows the parsed filters + matching listings. Non-fatal on error.
  const runAiSearch = useCallback(async () => {
    const query = aiQuery.trim()
    if (!query) return
    aiAbortRef.current?.abort()
    const controller = new AbortController()
    aiAbortRef.current = controller

    setAiSearching(true)
    setAiError(false)
    try {
      const result = await aiSearch(query, controller.signal)
      if (controller.signal.aborted) return
      setAiFilters(result.filters)
      setAiListings(result.listings)
      setAiActive(true)
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        console.error('AI search failed:', err)
        setAiError(true)
      }
    } finally {
      if (aiAbortRef.current === controller) {
        setAiSearching(false)
        aiAbortRef.current = null
      }
    }
  }, [aiQuery])

  // Exit AI mode and drop the AI result set (back to structured results).
  const clearAiSearch = useCallback(() => {
    aiAbortRef.current?.abort()
    setAiActive(false)
    setAiError(false)
    setAiFilters({})
    setAiListings([])
    setAiQuery('')
  }, [])

  // Map the AI-parsed filters into the structured filter state and re-run the
  // normal search, so the AI result becomes a regular, refinable filter set.
  const applyAiFilters = useCallback(() => {
    const next: Filters = {
      ...EMPTY,
      location: aiFilters.q?.trim() || '',
      region: aiFilters.region?.trim() || '',
      guests:
        typeof aiFilters.guests === 'number' && aiFilters.guests > 0
          ? String(aiFilters.guests)
          : '',
      minPrice:
        typeof aiFilters.minPrice === 'number' && aiFilters.minPrice > 0
          ? String(aiFilters.minPrice)
          : '',
      maxPrice:
        typeof aiFilters.maxPrice === 'number' && aiFilters.maxPrice > 0
          ? String(aiFilters.maxPrice)
          : '',
      propertyType: aiFilters.propertyType?.trim() || '',
      amenities: Array.isArray(aiFilters.amenities)
        ? aiFilters.amenities.filter(Boolean)
        : [],
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setFilters(next)
    runSearch(next)
    setAiActive(false)
    setView('list')
  }, [aiFilters, runSearch])

  // Cleanup timers/requests on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
      aiAbortRef.current?.abort()
    }
  }, [])

  // Load the region chips once on mount. Failure is non-fatal — the row simply
  // stays empty and the rest of the search keeps working.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/local/regions`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && Array.isArray(data)) setRegions(data as RegionCount[])
      } catch {
        /* ignore — chips are an enhancement, not required */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Load the signed-in user's saved listing ids once on mount so already-saved
  // hearts render filled. Skips entirely (empty set) when signed out.
  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      const { listingIds } = await fetchWishlistIds(controller.signal)
      setSavedIds(listingIds)
    })()
    return () => controller.abort()
  }, [])

  const hasFilters = useMemo(() => Boolean(buildQuery(filters)), [filters])

  const count = listings.length
  const countLabel = t(count === 1 ? 'explore.stayFound' : 'explore.staysFound', {
    count,
  })

  return (
    <>
      {/* Responsive rules for the inline-styled pill search bar + results grid.
          Inline styles can't hold media queries, so the layout-shifting bits
          carry class names and collapse to a stacked layout on small screens. */}
      <style>{`
        @media (max-width: 760px) {
          .qk-pill {
            flex-direction: column !important;
            align-items: stretch !important;
            border-radius: 26px !important;
            padding: 12px !important;
            gap: 4px !important;
          }
          .qk-pill-seg {
            border-right: none !important;
            border-bottom: 1px solid rgba(42,34,32,0.08) !important;
            padding: 12px 14px !important;
          }
          .qk-pill-seg:last-of-type { border-bottom: none !important; }
          .qk-pill-search-wrap {
            padding: 8px 6px 2px !important;
            justify-content: stretch !important;
          }
          .qk-pill-search-btn {
            width: 100% !important;
            border-radius: 16px !important;
            height: 50px !important;
          }
          .qk-pill-search-label { display: inline !important; }
          .qk-ai-search {
            flex-direction: column !important;
            align-items: stretch !important;
            border-radius: 22px !important;
          }
          .qk-ai-search > span { display: none !important; }
          .qk-ai-search button {
            width: 100% !important;
            justify-content: center !important;
            border-radius: 16px !important;
          }
        }
        @media (max-width: 440px) {
          .qk-results-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 620px) {
          .qk-controls-row {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 14px !important;
          }
          .qk-sort-seg { width: 100% !important; justify-content: center; }
        }
      `}</style>

      {/* Hero + Search bar — Ken Burns cover behind a soft cream wash. */}
      <section
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: COLORS.page,
          padding: '64px 24px 22px',
        }}
      >
        {/* Ken Burns backdrop */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            overflow: 'hidden',
          }}
        >
          <div
            className="qk-kenburns"
            style={{
              position: 'absolute',
              // Negative inset + the parent's overflow:hidden hides the soft blur edges.
              inset: -28,
              backgroundImage: `url(${HERO_COVER})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              // Blurred so it reads as a dreamy North Coast scene behind the hero.
              filter: 'blur(3px) saturate(1.08)',
              opacity: 0.6,
            }}
          />
          {/* Cream wash: lighter at the top so the North Coast photo shows through,
              fading to solid cream by the search/results so the headline + pill and
              everything below stay legible. */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(180deg, rgba(228,222,207,0.34) 0%, rgba(228,222,207,0.58) 42%, rgba(228,222,207,0.9) 76%, #E4DECF 100%)',
            }}
          />
        </div>

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            maxWidth: 1080,
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          {/* Travel motif: a plane climbs in along a dashed gold contrail that
              draws left→right — the same "boarding pass" flourish as the iOS app.
              In its own row above the eyebrow so the dotted line never overlaps text. */}
          <div
            aria-hidden="true"
            style={{ position: 'relative', height: 44, marginBottom: 4, pointerEvents: 'none' }}
          >
            <svg
              width="100%"
              height="54"
              viewBox="0 0 1000 54"
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0 }}
            >
              <path
                className="qk-contrail"
                d="M40 46 Q 520 2 940 18"
                fill="none"
                stroke={COLORS.gold}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="2 10"
              />
            </svg>
            <span
              className="qk-fly"
              style={{
                position: 'absolute',
                left: 'min(94%, 940px)',
                top: 2,
                color: COLORS.gold,
                filter: 'drop-shadow(0 3px 8px rgba(176,122,42,0.45))',
              }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(43deg)' }}>
                <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
              </svg>
            </span>
          </div>

          {/* Eyebrow — gold, uppercase, wide tracking ("North Coast · Egypt" style) */}
          <p
            className="qk-reveal"
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: COLORS.gold,
              animationDelay: '0.25s',
            }}
          >
            {t('explore.eyebrow')}
          </p>

          {/* Headline — one word in burgundy italic */}
          <h1
            className="qk-reveal"
            style={{
              margin: '14px auto 0',
              maxWidth: 760,
              fontFamily: SERIF,
              fontSize: 'clamp(34px, 6vw, 58px)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.08,
              color: COLORS.ink,
              animationDelay: '0.35s',
            }}
          >
            {t('explore.headlinePre')}{' '}
            <span style={{ fontStyle: 'italic', color: COLORS.burgundy }}>
              {t('explore.headlineEm')}
            </span>{' '}
            {t('explore.headlinePost')}
          </h1>
          <p
            className="qk-reveal"
            style={{
              margin: '16px auto 0',
              maxWidth: 540,
              fontSize: 16,
              lineHeight: 1.6,
              color: COLORS.muted,
              animationDelay: '0.45s',
            }}
          >
            {t('explore.subcopy')}
          </p>

          {/* Pill search (live — filters as you type; the round button flushes) */}
          <div
            role="search"
            className="qk-pill"
            style={{
              margin: '30px auto 0',
              maxWidth: 860,
              display: 'flex',
              alignItems: 'stretch',
              background: '#fff',
              borderRadius: 999,
              border: '1px solid rgba(42,34,32,0.08)',
              boxShadow: '0 22px 48px rgba(42,34,32,0.16)',
              padding: 8,
              textAlign: 'left',
            }}
          >
            {/* WHERE */}
            <div
              className="qk-pill-seg"
              style={{
                flex: '1.6 1 0',
                minWidth: 0,
                padding: '8px 22px',
                borderRight: '1px solid rgba(42,34,32,0.10)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <label htmlFor="where" style={segLabel}>
                {t('explore.where')}
              </label>
              <input
                id="where"
                type="text"
                name="location"
                placeholder={t('explore.wherePlaceholder')}
                autoComplete="off"
                value={filters.location}
                onChange={(e) =>
                  updateFilter({ location: e.target.value }, { debounce: true })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitSearch()
                }}
                style={segInput}
              />
            </div>

            {/* CHECK-IN (custom date picker) */}
            <div
              className="qk-pill-seg"
              style={{
                flex: '1 1 0',
                minWidth: 0,
                padding: '8px 18px',
                borderRight: '1px solid rgba(42,34,32,0.10)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <span style={segLabel}>{t('explore.checkIn')}</span>
              <PillDate
                value={filters.checkIn}
                ariaLabel={t('explore.checkIn')}
                placeholder={t('explore.datesPlaceholder')}
                onChange={(iso) =>
                  updateFilter({
                    checkIn: iso,
                    // Keep checkout valid: clear it if it's now before check-in.
                    checkOut:
                      iso && filters.checkOut && filters.checkOut < iso
                        ? ''
                        : filters.checkOut,
                  })
                }
              />
            </div>

            {/* CHECK-OUT (custom date picker; can't fall before check-in) */}
            <div
              className="qk-pill-seg"
              style={{
                flex: '1 1 0',
                minWidth: 0,
                padding: '8px 18px',
                borderRight: '1px solid rgba(42,34,32,0.10)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <span style={segLabel}>{t('explore.checkOut')}</span>
              <PillDate
                value={filters.checkOut}
                min={filters.checkIn || undefined}
                ariaLabel={t('explore.checkOut')}
                placeholder={t('explore.datesPlaceholder')}
                onChange={(iso) => updateFilter({ checkOut: iso })}
              />
            </div>

            {/* GUESTS */}
            <div
              className="qk-pill-seg"
              style={{
                flex: '0.9 1 0',
                minWidth: 0,
                padding: '8px 22px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <label htmlFor="guests" style={segLabel}>
                {t('explore.guests')}
              </label>
              <input
                id="guests"
                type="number"
                name="guests"
                min={1}
                placeholder={t('explore.guestsPlaceholder')}
                value={filters.guests}
                onChange={(e) => updateFilter({ guests: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitSearch()
                }}
                style={segInput}
              />
            </div>

            {/* Round burgundy Search button */}
            <div
              className="qk-pill-search-wrap"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                paddingLeft: 6,
                paddingRight: 4,
              }}
            >
              <button
                type="button"
                onClick={submitSearch}
                aria-label={t('explore.search')}
                className="qk-pill-search-btn qk-press"
                style={{
                  height: 56,
                  minWidth: 56,
                  padding: '0 22px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  borderRadius: 999,
                  border: 'none',
                  background: GRAD_BURGUNDY,
                  color: '#fff',
                  fontFamily: FONT,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
                  whiteSpace: 'nowrap',
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <span className="qk-pill-search-label" style={{ display: 'none' }}>
                  {t('explore.search')}
                </span>
              </button>
            </div>
          </div>

          {/* Natural-language ("Ask AI") search — a single sentence the AI turns
              into structured filters + matching listings. Sits under the pill as
              an additional search mode; the structured search keeps working. */}
          <div
            role="search"
            className="qk-ai-search"
            style={{
              margin: '16px auto 0',
              maxWidth: 860,
              display: 'flex',
              alignItems: 'stretch',
              gap: 8,
              background: '#fff',
              borderRadius: 999,
              border: '1px solid rgba(176,122,42,0.35)',
              boxShadow: '0 10px 28px rgba(176,122,42,0.16)',
              padding: 7,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                flex: '0 0 auto',
                display: 'inline-flex',
                alignItems: 'center',
                paddingInlineStart: 14,
                fontSize: 18,
                color: COLORS.gold,
              }}
            >
              ✨
            </span>
            <input
              type="text"
              name="aiQuery"
              autoComplete="off"
              placeholder={t('ai.aiSearchPlaceholder')}
              aria-label={t('ai.aiSearchTitle')}
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runAiSearch()
              }}
              style={{
                flex: '1 1 0',
                minWidth: 0,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontFamily: FONT,
                fontSize: 15,
                color: COLORS.ink,
                padding: '8px 6px',
              }}
            />
            <button
              type="button"
              onClick={runAiSearch}
              disabled={aiSearching || !aiQuery.trim()}
              className={aiSearching || !aiQuery.trim() ? undefined : 'qk-press'}
              style={{
                flex: '0 0 auto',
                height: 46,
                padding: '0 22px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 999,
                border: 'none',
                background: 'linear-gradient(135deg,#B07A2A,#d8a55a)',
                color: '#fff',
                fontFamily: FONT,
                fontSize: 14.5,
                fontWeight: 700,
                cursor:
                  aiSearching || !aiQuery.trim() ? 'not-allowed' : 'pointer',
                opacity: aiSearching || !aiQuery.trim() ? 0.6 : 1,
                boxShadow:
                  aiSearching || !aiQuery.trim()
                    ? 'none'
                    : '0 10px 24px rgba(176,122,42,0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              {aiSearching ? t('ai.searching') : t('ai.aiSearch')}
            </button>
          </div>

          {/* AI search error (non-blocking) */}
          {aiError && (
            <p
              role="status"
              style={{
                margin: '10px auto 0',
                maxWidth: 860,
                fontSize: 13.5,
                fontWeight: 600,
                color: COLORS.burgundy,
              }}
            >
              {t('ai.aiSearchError')}
            </p>
          )}

          {/* Region chips — an "All" chip plus one per region (with its listing
              count). Selecting a chip adds `region=` to the fetch; "All" clears
              it. Lives alongside the Where/dates/guests pill as an extra filter. */}
          {regions.length > 0 && (
            <div
              role="group"
              aria-label={t('explore.filterByRegion')}
              style={{
                margin: '22px auto 0',
                maxWidth: 860,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                justifyContent: 'center',
              }}
            >
              <RegionChip
                label={t('explore.all')}
                active={filters.region === ''}
                onClick={() => updateFilter({ region: '' })}
              />
              {regions.map((r) => (
                <RegionChip
                  key={r.region}
                  // Display label is localized; the region VALUE sent to the API
                  // (in onClick below) stays the English canonical.
                  label={t('region.' + r.region)}
                  count={r.count}
                  active={filters.region === r.region}
                  onClick={() =>
                    updateFilter({
                      region: filters.region === r.region ? '' : r.region,
                    })
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Sort + price filter row */}
      <section style={{ background: COLORS.page, padding: '20px 24px 0' }}>
        <div
          className="qk-controls-row"
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          {/* Sort segmented control */}
          <div>
            <span style={controlLabel}>{t('explore.sortBy')}</span>
            <div
              role="tablist"
              aria-label={t('explore.sortBy')}
              className="qk-sort-seg"
              style={{
                display: 'inline-flex',
                flexWrap: 'wrap',
                background: COLORS.tan,
                borderRadius: 999,
                padding: 4,
                gap: 4,
              }}
            >
              {SORT_OPTIONS.map((opt) => (
                <ToggleButton
                  key={opt.value}
                  label={t(opt.labelKey)}
                  active={filters.sort === opt.value}
                  onClick={() => updateFilter({ sort: opt.value })}
                  role="tab"
                />
              ))}
            </div>
          </div>

          {/* Price min/max */}
          <div>
            <span style={controlLabel}>{t('explore.pricePerNight')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder={t('explore.min')}
                aria-label={t('explore.min')}
                value={filters.minPrice}
                onChange={(e) =>
                  updateFilter({ minPrice: e.target.value }, { debounce: true })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitSearch()
                }}
                style={priceInput}
              />
              <span style={{ color: COLORS.muted, fontSize: 14 }}>–</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder={t('explore.max')}
                aria-label={t('explore.max')}
                value={filters.maxPrice}
                onChange={(e) =>
                  updateFilter({ maxPrice: e.target.value }, { debounce: true })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitSearch()
                }}
                style={priceInput}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Discovery filters: property type (single-select, "Any type" default) +
          amenities (multi-select chips). Both merge with the existing filters and
          refetch on change; the "Clear" link resets just these two. */}
      <section style={{ background: COLORS.page, padding: '20px 24px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          {/* Property type */}
          <div>
            <span style={controlLabel}>{t('filters.propertyType')}</span>
            <div
              role="tablist"
              aria-label={t('filters.propertyType')}
              style={{
                display: 'inline-flex',
                flexWrap: 'wrap',
                background: COLORS.tan,
                borderRadius: 999,
                padding: 4,
                gap: 4,
              }}
            >
              <ToggleButton
                label={t('filters.anyType')}
                active={filters.propertyType === ''}
                onClick={() => updateFilter({ propertyType: '' })}
                role="tab"
              />
              {PROPERTY_TYPES.map((pt) => (
                <ToggleButton
                  key={pt}
                  label={t('propertyType.' + pt)}
                  active={filters.propertyType === pt}
                  onClick={() =>
                    updateFilter({
                      propertyType: filters.propertyType === pt ? '' : pt,
                    })
                  }
                  role="tab"
                />
              ))}
            </div>
          </div>

          {/* Amenities (multi-select chips) */}
          <div style={{ marginTop: 18 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 6,
              }}
            >
              <span style={{ ...controlLabel, marginBottom: 0 }}>
                {t('filters.amenities')}
              </span>
              {filters.amenities.length > 0 && (
                <span style={{ fontSize: 13, color: COLORS.muted }}>
                  {t('filters.amenitiesSelected', {
                    count: filters.amenities.length,
                  })}
                </span>
              )}
              {(filters.amenities.length > 0 || filters.propertyType !== '') && (
                <button
                  type="button"
                  onClick={clearDiscoveryFilters}
                  style={{
                    appearance: 'none',
                    border: 'none',
                    background: 'transparent',
                    color: COLORS.burgundy,
                    fontWeight: 700,
                    fontSize: 13,
                    fontFamily: FONT,
                    cursor: 'pointer',
                    padding: 0,
                    textDecoration: 'underline',
                    marginInlineStart: 'auto',
                  }}
                >
                  {t('filters.clear')}
                </button>
              )}
            </div>
            <div
              role="group"
              aria-label={t('filters.amenities')}
              style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}
            >
              {AMENITIES.map((a) => (
                <AmenityChip
                  key={a}
                  label={t('amenity.' + a)}
                  active={filters.amenities.includes(a)}
                  onClick={() => toggleAmenity(a)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Status row: result count + searching indicator + clear + List/Map toggle */}
      <section style={{ background: COLORS.page, padding: '18px 24px 4px' }}>
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              fontSize: 14,
              color: COLORS.muted,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
            aria-live="polite"
            aria-busy={searching}
          >
            {searching ? (
              <span style={{ color: COLORS.burgundy, fontWeight: 600 }}>
                {t('explore.searching')}
              </span>
            ) : (
              <span>{countLabel}</span>
            )}
            {hasFilters && (
              <button
                type="button"
                onClick={clearAll}
                style={{
                  appearance: 'none',
                  border: 'none',
                  background: 'transparent',
                  color: COLORS.burgundy,
                  fontWeight: 700,
                  fontSize: 14,
                  fontFamily: FONT,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                {t('explore.clearFilters')}
              </button>
            )}
          </div>

          {/* List / Map toggle */}
          <div
            role="tablist"
            aria-label={t('explore.view.list') + ' / ' + t('explore.view.map')}
            style={{
              display: 'inline-flex',
              background: COLORS.tan,
              borderRadius: 999,
              padding: 4,
              gap: 4,
            }}
          >
            <ToggleButton
              label={t('explore.view.list')}
              active={view === 'list'}
              onClick={() => setView('list')}
            />
            <ToggleButton
              label={t('explore.view.map')}
              active={view === 'map'}
              onClick={() => setView('map')}
            />
          </div>
        </div>

        {/* Non-blocking notice if a live search request fails. */}
        {searchError && (
          <div
            role="status"
            style={{
              maxWidth: 1200,
              margin: '14px auto 0',
              background: 'rgba(91,15,22,0.06)',
              border: '1px solid rgba(91,15,22,0.18)',
              color: COLORS.burgundy,
              fontSize: 14,
              borderRadius: 14,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span>{t('explore.searchError')}</span>
            <button
              type="button"
              onClick={() => setSearchError(false)}
              aria-label={t('explore.dismiss')}
              style={{
                appearance: 'none',
                border: 'none',
                background: 'transparent',
                color: COLORS.burgundy,
                fontSize: 18,
                lineHeight: 1,
                cursor: 'pointer',
                padding: 0,
                flex: '0 0 auto',
              }}
            >
              ×
            </button>
          </div>
        )}
      </section>

      {/* AI search results — parsed filter chips + matching listings. Rendered
          above the structured results when an AI search is active. */}
      {aiActive && (
        <section
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            width: '100%',
            boxSizing: 'border-box',
            padding: '24px 24px 0',
            flex: '0 0 auto',
          }}
        >
          <div
            style={{
              background: '#fff',
              border: '1px solid rgba(176,122,42,0.3)',
              borderRadius: 24,
              boxShadow: '0 12px 32px rgba(176,122,42,0.12)',
              padding: '22px 22px 26px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontFamily: SERIF,
                  fontSize: 22,
                  fontWeight: 700,
                  color: COLORS.burgundy,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span aria-hidden="true">✨</span>
                {t('ai.aiResults')}
                <span
                  style={{
                    fontFamily: FONT,
                    fontSize: 14,
                    fontWeight: 600,
                    color: COLORS.muted,
                  }}
                >
                  ·{' '}
                  {t(
                    aiListings.length === 1
                      ? 'ai.aiResultCount'
                      : 'ai.aiResultsCount',
                    { count: aiListings.length }
                  )}
                </span>
              </h2>
              <button
                type="button"
                onClick={clearAiSearch}
                style={{
                  appearance: 'none',
                  border: 'none',
                  background: 'transparent',
                  color: COLORS.burgundy,
                  fontWeight: 700,
                  fontSize: 14,
                  fontFamily: FONT,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                {t('ai.clearAiSearch')}
              </button>
            </div>

            {/* Parsed filter chips */}
            <AiFilterChips filters={aiFilters} />

            {/* Apply-into-structured-filters action */}
            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                onClick={applyAiFilters}
                className="qk-press"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  color: '#fff',
                  background: GRAD_BURGUNDY,
                  border: 'none',
                  fontFamily: FONT,
                  fontSize: 14,
                  fontWeight: 700,
                  padding: '10px 20px',
                  borderRadius: 999,
                  cursor: 'pointer',
                  boxShadow: '0 10px 24px rgba(91,15,22,0.24)',
                }}
              >
                {t('ai.applyFilters')}
              </button>
            </div>

            {/* AI listing grid */}
            <div style={{ marginTop: 22 }}>
              {aiListings.length === 0 ? (
                <p
                  style={{
                    margin: 0,
                    padding: '20px 0',
                    textAlign: 'center',
                    fontSize: 15,
                    color: COLORS.muted,
                  }}
                >
                  {t('ai.aiNoResults')}
                </p>
              ) : (
                <div
                  className="qk-results-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 28,
                  }}
                >
                  {aiListings.map((listing) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      saved={savedIds.has(listing.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Results: list grid or map */}
      <section
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
          padding: '28px 24px 72px',
          flex: 1,
        }}
      >
        {view === 'map' ? (
          <ListingsMap listings={listings} onSearchArea={searchThisArea} />
        ) : listings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 24px', color: COLORS.muted }}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 600, color: COLORS.ink }}>
              {t('explore.noResultsTitle')}
            </p>
            <p style={{ margin: '8px 0 18px', fontSize: 15 }}>
              {t('explore.noResultsBody')}
            </p>
            <button
              type="button"
              onClick={clearAll}
              className="qk-press"
              style={{
                display: 'inline-block',
                color: '#fff',
                background: GRAD_BURGUNDY,
                border: 'none',
                fontFamily: FONT,
                fontSize: 15,
                fontWeight: 600,
                padding: '10px 22px',
                borderRadius: 999,
                cursor: 'pointer',
                boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
              }}
            >
              {t('explore.clearFilters')}
            </button>
          </div>
        ) : (
          <div
            className="qk-results-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 28,
            }}
          >
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                saved={savedIds.has(listing.id)}
              />
            ))}
          </div>
        )}
      </section>
    </>
  )
}

// A single explore card — rounded cover image (or clean placeholder), a heart,
// a guest-favorite star badge, and "EGP X / night".
function ListingCard({ listing, saved }: { listing: Listing; saved: boolean }) {
  const { t } = useLanguage()
  const { format } = useCurrency()
  const cover = listing.listing_images[0]?.url || null
  const reviewCount = listing.review_count ?? 0
  const rating = listing.rating ?? 0
  return (
    <a
      href={`/explore/${listing.id}`}
      className="qk-card"
      style={{
        display: 'block',
        background: '#fff',
        borderRadius: 22,
        overflow: 'hidden',
        textDecoration: 'none',
        color: 'inherit',
        boxShadow: '0 8px 22px rgba(42,34,32,0.10)',
        border: '1px solid rgba(42,34,32,0.05)',
        cursor: 'pointer',
      }}
    >
      {/* Cover */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '4 / 3',
          overflow: 'hidden',
          background: COLORS.tan,
          borderRadius: 22,
        }}
      >
        {cover ? (
          <img
            src={cover}
            alt={listing.title}
            loading="lazy"
            className="qk-img-zoom"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          <ImagePlaceholder />
        )}

        {/* Photo legibility overlay */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, transparent 45%, rgba(42,34,32,0.6))',
            pointerEvents: 'none',
          }}
        />

        {/* Heart — interactive wishlist toggle (pop-in + springy hover). Sits
            above the card's <a>; the button stops the click from navigating. */}
        <span
          style={{
            position: 'absolute',
            top: 12,
            insetInlineEnd: 12,
            zIndex: 2,
          }}
        >
          <HeartButton itemType="listing" itemId={listing.id} initialSaved={saved} />
        </span>

        {listing.is_guest_favorite && (
          <span
            className="qk-pop"
            style={{
              position: 'absolute',
              top: 14,
              insetInlineStart: 14,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: 'rgba(255,255,255,0.94)',
              color: COLORS.ink,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.01em',
              padding: '6px 12px',
              borderRadius: 999,
              boxShadow: '0 4px 12px rgba(42,34,32,0.16)',
            }}
          >
            <span className="qk-star" aria-hidden="true">
              ★
            </span>{' '}
            {t('listing.guestFavorite')}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '16px 20px 22px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              lineHeight: 1.3,
              color: COLORS.ink,
            }}
          >
            {listing.title}
          </h2>
          {/* Real rating: gold ★ + average, or "New" when no reviews yet. */}
          <span style={{ flex: '0 0 auto' }}>
            <RatingStars rating={rating} reviewCount={reviewCount} size={13} showCount={false} />
          </span>
        </div>
        {listing.location && (
          <p style={{ margin: '6px 0 0', fontSize: 14, color: COLORS.muted }}>
            {listing.location}
          </p>
        )}
        <p style={{ margin: '14px 0 0', fontSize: 15, color: COLORS.ink }}>
          <span style={{ fontWeight: 700, color: COLORS.burgundy }}>
            {format(listing.price_per_night)}
          </span>{' '}
          <span style={{ color: COLORS.muted }}>{t('listing.perNight')}</span>
        </p>
      </div>
    </a>
  )
}

// The parsed-filter chips for an AI search ("El Gouna · 6 guests · Villa · Pool
// · Under EGP 6,000"). Each present filter renders one boutique chip; region /
// property type / amenity labels are localized while their canonical English
// value drives the lookup. Money uses the active currency formatter.
function AiFilterChips({ filters }: { filters: AiSearchFilters }) {
  const { t } = useLanguage()
  const { format } = useCurrency()

  // Resolve a key only if a translation exists, else fall back to the raw value
  // (so an unmapped region/type/amenity still shows its English label).
  const labelFor = (prefix: string, value: string): string => {
    const key = prefix + value
    const resolved = t(key)
    return resolved === key ? value : resolved
  }

  const chips: string[] = []
  if (filters.q?.trim()) chips.push(filters.q.trim())
  if (filters.region?.trim())
    chips.push(labelFor('region.', filters.region.trim()))
  if (typeof filters.guests === 'number' && filters.guests > 0)
    chips.push(t('ai.filterGuests', { count: filters.guests }))
  if (filters.propertyType?.trim())
    chips.push(labelFor('propertyType.', filters.propertyType.trim()))
  for (const a of filters.amenities ?? []) {
    if (a?.trim()) chips.push(labelFor('amenity.', a.trim()))
  }
  if (typeof filters.maxPrice === 'number' && filters.maxPrice > 0)
    chips.push(t('ai.filterUnder', { amount: format(filters.maxPrice) }))
  if (typeof filters.minPrice === 'number' && filters.minPrice > 0)
    chips.push(t('ai.filterOver', { amount: format(filters.minPrice) }))

  return (
    <div style={{ marginTop: 14 }}>
      <span
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: COLORS.muted,
          marginBottom: 8,
        }}
      >
        {t('ai.parsedFilters')}
      </span>
      {chips.length === 0 ? (
        <span style={{ fontSize: 14, color: COLORS.muted }}>—</span>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {chips.map((chip, i) => (
            <span
              key={`${chip}-${i}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontFamily: FONT,
                fontSize: 13.5,
                fontWeight: 600,
                padding: '7px 14px',
                borderRadius: 999,
                color: COLORS.burgundy,
                background: 'rgba(91,15,22,0.06)',
                border: '1px solid rgba(91,15,22,0.16)',
                whiteSpace: 'nowrap',
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// The check-in field inside the pill: borderless trigger styled to sit flush in
// the segment (the popover calendar handles the rest).
function PillDate({
  value,
  onChange,
  min,
  ariaLabel = 'Date',
  placeholder = 'Add dates',
}: {
  value: string
  onChange: (iso: string) => void
  min?: string
  ariaLabel?: string
  placeholder?: string
}) {
  return (
    <div className="qk-pill-date">
      <style>{`
        .qk-pill-date > div > button {
          border: none !important;
          padding: 2px 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          font-size: 14px !important;
        }
        .qk-pill-date > div > button svg:first-child { display: none; }
      `}</style>
      <DatePickerField
        value={value}
        onChange={onChange}
        min={min}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
      />
    </div>
  )
}

const segLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: COLORS.ink,
  marginBottom: 3,
}

const segInput: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontFamily: FONT,
  fontSize: 14,
  color: COLORS.ink,
  padding: '2px 0',
}

// Small uppercase caption above the sort + price controls.
const controlLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: COLORS.muted,
  marginBottom: 6,
}

const priceInput: React.CSSProperties = {
  width: 92,
  boxSizing: 'border-box',
  padding: '9px 12px',
  fontFamily: FONT,
  fontSize: 14,
  color: COLORS.ink,
  background: '#fff',
  border: '1px solid rgba(42,34,32,0.14)',
  borderRadius: 999,
  outline: 'none',
}

function ToggleButton({
  label,
  active,
  onClick,
  role = 'tab',
}: {
  label: string
  active: boolean
  onClick: () => void
  role?: string
}) {
  return (
    <button
      type="button"
      role={role}
      aria-selected={active}
      onClick={onClick}
      className="qk-tap"
      style={{
        appearance: 'none',
        border: 'none',
        cursor: 'pointer',
        fontFamily: FONT,
        fontSize: 14,
        fontWeight: 600,
        padding: '8px 20px',
        borderRadius: 999,
        color: active ? '#fff' : COLORS.ink,
        background: active ? GRAD_BURGUNDY : 'transparent',
        transition: 'background 0.15s ease, color 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

// A region filter chip: name + optional count (e.g. "Ain Sokhna · 2"). Burgundy
// when selected, matching the host add-listing region chips.
function RegionChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="qk-chip"
      style={{
        appearance: 'none',
        cursor: 'pointer',
        fontFamily: FONT,
        fontSize: 14,
        fontWeight: 600,
        padding: '9px 18px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        color: active ? '#fff' : COLORS.ink,
        background: active ? GRAD_BURGUNDY : '#fff',
        border: active
          ? '1px solid transparent'
          : '1px solid rgba(42,34,32,0.14)',
        boxShadow: active
          ? '0 8px 20px rgba(91,15,22,0.22)'
          : '0 2px 8px rgba(42,34,32,0.06)',
      }}
    >
      {label}
      {typeof count === 'number' && (
        <span
          style={{
            marginInlineStart: 7,
            fontWeight: 700,
            color: active ? 'rgba(255,255,255,0.85)' : COLORS.muted,
          }}
        >
          · {count}
        </span>
      )}
    </button>
  )
}

// A toggleable amenity chip for the multi-select. Mirrors the host add-listing
// amenity chips (a leading ✓ when on, + when off) and the boutique burgundy
// fill. `aria-pressed` exposes the toggle state to assistive tech.
function AmenityChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="qk-chip"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        appearance: 'none',
        cursor: 'pointer',
        fontFamily: FONT,
        fontSize: 14,
        fontWeight: 600,
        padding: '9px 16px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        color: active ? '#fff' : COLORS.ink,
        background: active ? GRAD_BURGUNDY : '#fff',
        border: active
          ? '1px solid transparent'
          : '1px solid rgba(42,34,32,0.14)',
        boxShadow: active
          ? '0 8px 20px rgba(91,15,22,0.22)'
          : '0 2px 8px rgba(42,34,32,0.06)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          width: 16,
          height: 16,
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 800,
          color: active ? '#fff' : COLORS.burgundy,
        }}
      >
        {active ? '✓' : '+'}
      </span>
      {label}
    </button>
  )
}
