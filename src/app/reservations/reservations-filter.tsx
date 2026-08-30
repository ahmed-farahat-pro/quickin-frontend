'use client'

// The status filter over /reservations — the guest-side twin of the host dashboard's
// listing filter in host-tabs.tsx, down to the pill styling.
//
// The cards arrive PRE-RENDERED from the server component (page.tsx), so this only
// decides which of them to mount. That matters: the cards carry server-only children
// (the dispute panel, the stay pass, the pay actions), and lifting the whole list into
// a client component to gain a chip row would have dragged all of that across the
// boundary for nothing.

import { useMemo, useState, type ReactNode } from 'react'
import {
  RESERVATION_FILTER_ORDER,
  reservationFilterCounts,
  reservationFilterMatches,
  type ReservationBucket,
  type ReservationFilter,
} from '@/lib/local/reservation-filter-core'

const COLORS = {
  burgundy: '#5B0F16',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

export interface ReservationItem {
  id: string
  /** Which chip this reservation sits behind. Folded SERVER-side by
   *  `reservationBucketFor`, so the payment stage it depends on is read once, next to
   *  the same `paymentStageFor` the rest of the page uses. */
  bucket: ReservationBucket
  /** The server-rendered <article> for this reservation. */
  card: ReactNode
}

/**
 * Reservation list + its status filter.
 *
 * Chips a guest has nothing behind are dropped rather than badged 0. The host's five
 * chips are a fixed vocabulary they work through; these ten describe a story most
 * guests only ever see part of, and eight empty chips to scroll past would bury the
 * two that hold something. "All" and the active chip always survive, so the row can
 * never go blank and the current filter can never vanish from under the list.
 */
export function ReservationsFilter({
  items,
  labels,
  emptyMessages,
  showAllLabel,
  groupLabel,
}: {
  items: ReservationItem[]
  labels: Record<ReservationFilter, string>
  /** Muted line per chip, shown when the guest has bookings but none behind it. */
  emptyMessages: Record<ReservationFilter, string>
  /** The way out of an empty filter — the only action that can change the result,
   *  since nobody can conjure a reservation into a status. */
  showAllLabel: string
  groupLabel: string
}) {
  const [filter, setFilter] = useState<ReservationFilter>('all')

  // Counted over every reservation, not the visible slice — a chip has to say what it
  // WOULD show, which is the opposite of what is on screen right now.
  const counts = useMemo(() => reservationFilterCounts(items.map((i) => i.bucket)), [items])
  const chips = RESERVATION_FILTER_ORDER.filter(
    (key) => key === 'all' || key === filter || counts[key] > 0
  )
  const visible = items.filter((item) => reservationFilterMatches(filter, item.bucket))

  return (
    <>
      <div
        role="group"
        aria-label={groupLabel}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}
      >
        {chips.map((key) => (
          <FilterPill
            key={key}
            label={labels[key]}
            // "All" stays bare: its count is just the number of cards below it, and
            // every other client leaves it bare for the same reason.
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
          <p style={{ margin: '0 0 14px', fontSize: 15 }}>{emptyMessages[filter]}</p>
          <button
            type="button"
            onClick={() => setFilter('all')}
            style={{
              appearance: 'none',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              fontFamily: FONT,
              fontSize: 14,
              fontWeight: 700,
              color: COLORS.burgundy,
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            {showAllLabel}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {visible.map((item) => (
            <div key={item.id}>{item.card}</div>
          ))}
        </div>
      )}
    </>
  )
}

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
