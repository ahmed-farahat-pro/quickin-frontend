'use client'

// Client-side browse experience: live type-to-filter search + a List/Map toggle.
// The server component (page.tsx) renders the header/footer and passes the first
// page of listings as `initialListings` so the first paint is instant. The live
// search re-fetches the backend API directly.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { API_URL, type Listing } from '@/lib/api'
import DatePickerField from '../_components/date-picker-field'
import ImagePlaceholder from '../_components/image-placeholder'

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
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'
const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif'

type View = 'list' | 'map'

interface Filters {
  location: string
  checkIn: string
  checkOut: string
  guests: string
}

interface Props {
  initialListings: Listing[]
  initialFilters: Filters
}

function buildQuery(f: Filters): string {
  const params = new URLSearchParams()
  if (f.location.trim()) params.set('location', f.location.trim())
  if (f.checkIn) params.set('checkIn', f.checkIn)
  if (f.checkOut) params.set('checkOut', f.checkOut)
  if (f.guests.trim()) params.set('guests', f.guests.trim())
  return params.toString()
}

const EMPTY: Filters = { location: '', checkIn: '', checkOut: '', guests: '' }

export default function ExploreClient({ initialListings, initialFilters }: Props) {
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [listings, setListings] = useState<Listing[]>(initialListings)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [view, setView] = useState<View>('list')

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
      const res = await fetch(
        `${API_URL}/api/local/listings${query ? `?${query}` : ''}`,
        { signal: controller.signal }
      )
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data: Listing[] = await res.json()
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
  const updateFilter = useCallback(
    (patch: Partial<Filters>, opts?: { debounce?: boolean }) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch }
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

  // Cleanup timers/requests on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [])

  const hasFilters = useMemo(() => Boolean(buildQuery(filters)), [filters])

  const count = listings.length
  const countLabel = `${count} ${count === 1 ? 'stay' : 'stays'} found`

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
        }
        @media (max-width: 440px) {
          .qk-results-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Hero + Search bar */}
      <section style={{ background: COLORS.cream, padding: '52px 24px 16px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', textAlign: 'center' }}>
          {/* Eyebrow */}
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: COLORS.burgundy,
            }}
          >
            Curated stays for slow travelers
          </p>

          {/* Headline — one word in burgundy italic */}
          <h1
            style={{
              margin: '14px auto 0',
              maxWidth: 760,
              fontFamily: SERIF,
              fontSize: 'clamp(34px, 6vw, 58px)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.08,
              color: COLORS.ink,
            }}
          >
            Find your next{' '}
            <span style={{ fontStyle: 'italic', color: COLORS.burgundy }}>
              boutique
            </span>{' '}
            stay
          </h1>
          <p
            style={{
              margin: '16px auto 0',
              maxWidth: 540,
              fontSize: 16,
              lineHeight: 1.6,
              color: COLORS.muted,
            }}
          >
            A hand-picked collection of homes — from lakeside villas to desert
            hideaways.
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
              boxShadow: '0 14px 40px rgba(42,34,32,0.12)',
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
                Where
              </label>
              <input
                id="where"
                type="text"
                name="location"
                placeholder="Search destinations"
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
              <span style={segLabel}>Check-in</span>
              <PillDate
                value={filters.checkIn}
                ariaLabel="Check-in date"
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
              <span style={segLabel}>Check-out</span>
              <PillDate
                value={filters.checkOut}
                min={filters.checkIn || undefined}
                ariaLabel="Check-out date"
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
                Guests
              </label>
              <input
                id="guests"
                type="number"
                name="guests"
                min={1}
                placeholder="Add guests"
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
                aria-label="Search"
                className="qk-pill-search-btn"
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
                  background: COLORS.burgundy,
                  color: '#fff',
                  fontFamily: FONT,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 6px 16px rgba(91,15,22,0.30)',
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
                  Search
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Status row: result count + searching indicator + clear + List/Map toggle */}
      <section style={{ background: COLORS.cream, padding: '18px 24px 4px' }}>
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
                Searching…
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
                Clear filters
              </button>
            )}
          </div>

          {/* List / Map toggle */}
          <div
            role="tablist"
            aria-label="Choose view"
            style={{
              display: 'inline-flex',
              background: COLORS.tan,
              borderRadius: 999,
              padding: 4,
              gap: 4,
            }}
          >
            <ToggleButton
              label="List"
              active={view === 'list'}
              onClick={() => setView('list')}
            />
            <ToggleButton
              label="Map"
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
            <span>
              We couldn&apos;t refresh the results just now — showing your last
              matches. Try again in a moment.
            </span>
            <button
              type="button"
              onClick={() => setSearchError(false)}
              aria-label="Dismiss"
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
          <ListingsMap listings={listings} />
        ) : listings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 24px', color: COLORS.muted }}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 600, color: COLORS.ink }}>
              No stays match your search
            </p>
            <p style={{ margin: '8px 0 18px', fontSize: 15 }}>
              Try widening your dates or location.
            </p>
            <button
              type="button"
              onClick={clearAll}
              style={{
                display: 'inline-block',
                color: '#fff',
                background: COLORS.burgundy,
                border: 'none',
                fontFamily: FONT,
                fontSize: 15,
                fontWeight: 600,
                padding: '10px 22px',
                borderRadius: 999,
                cursor: 'pointer',
              }}
            >
              Clear filters
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
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}

// A single explore card — rounded cover image (or clean placeholder), a heart,
// a guest-favorite star badge, and "EGP X / night".
function ListingCard({ listing }: { listing: Listing }) {
  const cover = listing.listing_images[0]?.url || null
  return (
    <a
      href={`/explore/${listing.id}`}
      style={{
        display: 'block',
        background: '#fff',
        borderRadius: 22,
        overflow: 'hidden',
        textDecoration: 'none',
        color: 'inherit',
        boxShadow: '0 6px 24px rgba(42,34,32,0.08)',
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

        {/* Heart */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 34,
            height: 34,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(42,34,32,0.18)',
          }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke={COLORS.burgundy}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8Z" />
          </svg>
        </span>

        {listing.is_guest_favorite && (
          <span
            style={{
              position: 'absolute',
              top: 14,
              left: 14,
              background: 'rgba(255,255,255,0.94)',
              color: COLORS.burgundy,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.01em',
              padding: '6px 12px',
              borderRadius: 999,
              boxShadow: '0 2px 8px rgba(42,34,32,0.14)',
            }}
          >
            ★ Guest favorite
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
          {listing.is_guest_favorite && (
            <span
              style={{
                flex: '0 0 auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 13,
                fontWeight: 700,
                color: COLORS.ink,
              }}
            >
              <span style={{ color: COLORS.burgundy }}>★</span> 5.0
            </span>
          )}
        </div>
        {listing.location && (
          <p style={{ margin: '6px 0 0', fontSize: 14, color: COLORS.muted }}>
            {listing.location}
          </p>
        )}
        <p style={{ margin: '14px 0 0', fontSize: 15, color: COLORS.ink }}>
          <span style={{ fontWeight: 700, color: COLORS.burgundy }}>
            EGP {listing.price_per_night}
          </span>{' '}
          <span style={{ color: COLORS.muted }}>/ night</span>
        </p>
      </div>
    </a>
  )
}

// The check-in field inside the pill: borderless trigger styled to sit flush in
// the segment (the popover calendar handles the rest).
function PillDate({
  value,
  onChange,
  min,
  ariaLabel = 'Date',
}: {
  value: string
  onChange: (iso: string) => void
  min?: string
  ariaLabel?: string
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
        placeholder="Add dates"
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

function ToggleButton({
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
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
        background: active ? COLORS.burgundy : 'transparent',
        transition: 'background 0.15s ease, color 0.15s ease',
      }}
    >
      {label}
    </button>
  )
}
