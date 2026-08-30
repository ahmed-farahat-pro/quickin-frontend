'use client'

// Client interactivity for the host dashboard.
//  - HostTabs: "My Listings" vs "Incoming Reservations". Both sections are
//    rendered server-side and passed in as slots; this only toggles which one
//    is visible (reuses the boutique pill toggle used on /explore).
//  - HostListingsFilter: All / Published / Under review / Rejected / Deactivated
//    filter above the listings grid. The cards themselves are still server-rendered
//    and handed over as slots, so the filter never duplicates card markup.
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import {
  HOST_LISTING_FILTER_ORDER,
  hostListingFilterCounts,
  hostListingFilterMatches,
  type HostListingFilter,
  type HostListingStatus,
} from '@/lib/local/host-listing-filter-core'

const COLORS = {
  burgundy: '#5B0F16',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

export function HostTabs({
  listingsLabel,
  reservationsLabel,
  listings,
  reservations,
}: {
  listingsLabel: string
  reservationsLabel: string
  listings: ReactNode
  reservations: ReactNode
}) {
  const [tab, setTab] = useState<'listings' | 'reservations'>('listings')

  return (
    <>
      <div
        role="tablist"
        aria-label={`${listingsLabel} / ${reservationsLabel}`}
        style={{
          display: 'inline-flex',
          background: COLORS.tan,
          borderRadius: 999,
          padding: 4,
          gap: 4,
          marginBottom: 26,
          maxWidth: '100%',
          flexWrap: 'wrap',
        }}
      >
        <TabButton label={listingsLabel} active={tab === 'listings'} onClick={() => setTab('listings')} />
        <TabButton label={reservationsLabel} active={tab === 'reservations'} onClick={() => setTab('reservations')} />
      </div>
      <div>{tab === 'listings' ? listings : reservations}</div>
    </>
  )
}

/**
 * The state a host listing is shown in — the union of moderation and visibility,
 * because from the host's side "why can nobody see this?" has one answer, not two.
 *
 * Computed by `hostVisibilityState()` in lib/local/host-visibility-core.ts (the
 * module the backend enforces the same rules from), then mapped onto these names:
 *   live         → 'approved'     — the wire name the filter has always used
 *   deactivated  → 'deactivated'  — the HOST took it down; only they can undo it
 *   blocked      → 'blocked'      — someone else did; the host cannot undo it
 *   under_review / rejected       — unchanged
 *
 * The union itself, the chip order and the counting live in
 * lib/local/host-listing-filter-core.ts so they can be unit-tested off the DOM;
 * both types are re-exported here because page.tsx has always imported them
 * from this module.
 */
export type { HostListingFilter, HostListingStatus }

export type HostListingItem = {
  id: string
  status: HostListingStatus
  /** The server-rendered <ListingCard /> for this listing. */
  card: ReactNode
}

/**
 * Listings grid + its status filter. Cards arrive pre-rendered from the server
 * component (page.tsx), so this only decides which of them to mount.
 */
export function HostListingsFilter({
  items,
  labels,
  emptyLabel,
  emptyTitle,
  showAllLabel,
}: {
  items: HostListingItem[]
  labels: Record<HostListingFilter, string>
  emptyLabel: string
  emptyTitle: string
  /** Label for the way out of an empty filter — the only action that can change
   *  the result, since the host cannot conjure a listing into a status. */
  showAllLabel: string
}) {
  const [filter, setFilter] = useState<HostListingFilter>('all')
  const visible = items.filter((item) => hostListingFilterMatches(filter, item.status))
  // Counted over every listing, not the visible slice — a chip has to say what
  // it would show, which is the opposite of what is on screen right now.
  const counts = useMemo(() => hostListingFilterCounts(items.map((item) => item.status)), [items])

  return (
    <>
      <div
        role="group"
        aria-label={HOST_LISTING_FILTER_ORDER.map((key) => labels[key]).join(' / ')}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 18,
        }}
      >
        {HOST_LISTING_FILTER_ORDER.map((key) => (
          <FilterPill
            key={key}
            label={labels[key]}
            // "All" stays bare: its count is just the number of cards below it,
            // and iOS leaves it bare for the same reason.
            count={key === 'all' ? undefined : counts[key]}
            active={filter === key}
            onClick={() => setFilter(key)}
          />
        ))}
      </div>

      {visible.length === 0 ? (
        <div
          role="status"
          style={{
            background: '#fff',
            borderRadius: 22,
            border: '1px solid rgba(42,34,32,0.06)',
            boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
            padding: '36px 24px',
            textAlign: 'center',
            color: COLORS.muted,
          }}
        >
          <p style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: COLORS.ink }}>{emptyTitle}</p>
          <p style={{ margin: 0, fontSize: 15 }}>{emptyLabel}</p>
          <button
            type="button"
            onClick={() => setFilter('all')}
            style={{
              marginTop: 14,
              padding: '9px 18px',
              borderRadius: 999,
              border: `1px solid ${COLORS.burgundy}`,
              background: 'transparent',
              color: COLORS.burgundy,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {showAllLabel}
          </button>
        </div>
      ) : (
        <div
          className="qk-host-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 18,
          }}
        >
          {visible.map((item) => (
            <Fragment key={item.id}>{item.card}</Fragment>
          ))}
        </div>
      )}
    </>
  )
}

/**
 * Filter chip: burgundy fill when active, white + hairline border otherwise,
 * with the number of listings behind it in a small counter pill (omit `count`
 * to render the chip bare). Mirrors QKChip on iOS.
 */
function FilterPill({
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
      style={{
        appearance: 'none',
        cursor: 'pointer',
        fontFamily: FONT,
        fontSize: 13.5,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: count === undefined ? '8px 16px' : '8px 10px 8px 16px',
        borderRadius: 999,
        border: `1px solid ${active ? COLORS.burgundy : 'rgba(42,34,32,0.16)'}`,
        color: active ? '#fff' : COLORS.ink,
        background: active ? COLORS.burgundy : '#fff',
        transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {count === undefined ? null : (
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            lineHeight: 1,
            padding: '3px 7px',
            borderRadius: 999,
            minWidth: 20,
            textAlign: 'center',
            color: active ? '#fff' : COLORS.muted,
            background: active ? 'rgba(255,255,255,0.22)' : COLORS.tan,
          }}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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
        padding: '9px 20px',
        borderRadius: 999,
        color: active ? '#fff' : COLORS.ink,
        background: active ? COLORS.burgundy : 'transparent',
        transition: 'background 0.15s ease, color 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}
