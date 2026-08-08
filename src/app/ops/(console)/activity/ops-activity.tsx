'use client'

// The site activity feed (F1): signups, sign-ins, listings, bookings, payments and
// cancellations in one stream.
//
// Paging uses a `hasMore` flag rather than a total, because counting a seven-branch
// UNION would cost as much as the page itself — so the footer says "showing 1–50"
// with a Next that disables at the end, not "of 4,213".
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { COLORS, SERIF } from '../../ops-theme'
import { ClearFilters, EmptyRow, adminGet, controlStyle, fieldLabel, ghostBtn, numTd, pageStyle, panelStyle, td, th, money } from '../ops-ui'
import {
  DEFAULT_ACTIVITY_LIMIT,
  EVENT_KINDS,
  eventLabel,
  eventTone,
  type EventKind,
} from '@/lib/local/activity-core'

type ActivityEvent = {
  kind: string
  at: string
  actor_id: string | null
  actor_email: string | null
  actor_name: string | null
  subject: string | null
  subject_type: string | null
  subject_id: string | null
  amount: number | null
  detail: string | null
}

type Filters = { kind: EventKind | ''; q: string; from: string; to: string; offset: number }

const TONE: Record<string, { bg: string; fg: string }> = {
  green: { bg: '#E4F3EC', fg: COLORS.green },
  amber: { bg: '#FDF0DC', fg: '#8A5A12' },
  red: { bg: '#FBE7E5', fg: COLORS.red },
  neutral: { bg: COLORS.tan, fg: COLORS.ink },
}

function fmt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function OpsActivity({ initial }: { initial: { events: ActivityEvent[]; hasMore: boolean } }) {
  const [events, setEvents] = useState<ActivityEvent[]>(initial.events)
  const [hasMore, setHasMore] = useState(initial.hasMore)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>({ kind: '', q: '', from: '', to: '', offset: 0 })

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === search.trim() ? f : { ...f, q: search.trim(), offset: 0 }))
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const set = useCallback((patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch, offset: patch.offset ?? 0 }))
  }, [])

  /** Whether anything is actually narrowing the feed. Zero rows with nothing set is
   *  a quiet platform, not a bad filter, and the two want different sentences. */
  const narrowed = filters.kind !== '' || filters.q !== '' || filters.from !== '' || filters.to !== ''

  const clearFilters = useCallback(() => {
    setSearch('')
    setFilters({ kind: '', q: '', from: '', to: '', offset: 0 })
  }, [])

  const query = useMemo(() => {
    const p = new URLSearchParams({ limit: String(DEFAULT_ACTIVITY_LIMIT), offset: String(filters.offset) })
    if (filters.kind) p.set('kind', filters.kind)
    if (filters.q) p.set('q', filters.q)
    if (filters.from) p.set('from', filters.from)
    if (filters.to) p.set('to', filters.to)
    return p.toString()
  }, [filters])

  // The server already rendered page one with these exact defaults.
  const primed = useRef(false)
  useEffect(() => {
    if (!primed.current) {
      primed.current = true
      if (query === `limit=${DEFAULT_ACTIVITY_LIMIT}&offset=0`) return
    }
    let cancelled = false
    setLoading(true)
    adminGet<{ events: ActivityEvent[]; hasMore: boolean; error?: string }>(`activity?${query}`).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res === 'forbidden') { setError('Your account does not have the Overview module.'); return }
      if (!res) { setError('Could not load activity. Please retry.'); return }
      setError(null)
      setEvents(res.events ?? [])
      setHasMore(Boolean(res.hasMore))
    })
    return () => { cancelled = true }
  }, [query])

  const from = events.length ? filters.offset + 1 : 0
  const to = filters.offset + events.length

  return (
    <main style={pageStyle}>
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 64px' }}>
        <h1 style={{ margin: '0 0 4px', fontFamily: SERIF, fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', color: COLORS.burgundy }}>
          Activity
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: COLORS.muted }}>
          Everything that happened on the site and in the apps — signups, sign-ins, listings,
          bookings, payments and cancellations.
        </p>

        {error && <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.red, fontSize: 13, fontWeight: 700 }}>{error}</div>}

        <div style={{ ...panelStyle, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ flex: '2 1 220px' }}>
            <span style={fieldLabel}>Search</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Who — name or email" style={controlStyle} />
          </label>
          <label style={{ flex: '1 1 170px' }}>
            <span style={fieldLabel}>Event</span>
            <select value={filters.kind} onChange={(e) => set({ kind: e.target.value as EventKind | '' })} style={controlStyle}>
              <option value="">Everything</option>
              {EVENT_KINDS.map((k) => <option key={k} value={k}>{eventLabel(k)}</option>)}
            </select>
          </label>
          <label style={{ flex: '1 1 130px' }}>
            <span style={fieldLabel}>From</span>
            <input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} style={controlStyle} />
          </label>
          <label style={{ flex: '1 1 130px' }}>
            <span style={fieldLabel}>To</span>
            <input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} style={controlStyle} />
          </label>
        </div>

        <div style={{ ...panelStyle, marginTop: 14, opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>When</th>
                  <th style={th}>Event</th>
                  <th style={th}>Who</th>
                  <th style={th}>What</th>
                  <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => {
                  const tone = TONE[eventTone(e.kind as EventKind)] ?? TONE.neutral
                  return (
                    <tr key={`${e.kind}-${e.subject_id}-${e.at}-${i}`}>
                      <td style={{ ...td, whiteSpace: 'nowrap', color: COLORS.muted }}>{fmt(e.at)}</td>
                      <td style={td}>
                        <span style={{ background: tone.bg, color: tone.fg, borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {eventLabel(e.kind as EventKind)}
                        </span>
                      </td>
                      <td style={td}>
                        {e.actor_id ? (
                          <a href={`/ops/users/${e.actor_id}`} style={{ color: COLORS.burgundy, textDecoration: 'none', fontWeight: 700 }}>
                            {e.actor_name || e.actor_email || '—'}
                          </a>
                        ) : (e.actor_name || e.actor_email || '—')}
                      </td>
                      <td style={td}>
                        {e.subject || '—'}
                        {e.detail ? <span style={{ color: COLORS.muted }}> · {e.detail}</span> : null}
                      </td>
                      <td style={numTd}>{e.amount != null ? money(e.amount) : '—'}</td>
                    </tr>
                  )
                })}
                {events.length === 0 && !loading && (
                  narrowed ? (
                    <EmptyRow
                      colSpan={5}
                      tone="filtered"
                      title="No activity matches these filters"
                      body="Events exist outside the kind, search or date range you picked."
                      meta={<ClearFilters onClear={clearFilters} />}
                    />
                  ) : (
                    <EmptyRow
                      colSpan={5}
                      tone="blank"
                      title="No activity recorded yet"
                      body="Bookings, payments and moderation all write here as they happen."
                    />
                  )
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: COLORS.muted }}>
              {events.length === 0 ? 'No events' : `Showing ${from}–${to}`}
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={filters.offset === 0 || loading}
                onClick={() => setFilters((f) => ({ ...f, offset: Math.max(0, f.offset - DEFAULT_ACTIVITY_LIMIT) }))}
                style={{ ...ghostBtn, opacity: filters.offset === 0 ? 0.4 : 1 }}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!hasMore || loading}
                onClick={() => setFilters((f) => ({ ...f, offset: f.offset + DEFAULT_ACTIVITY_LIMIT }))}
                style={{ ...ghostBtn, opacity: hasMore ? 1 : 0.4 }}
              >
                Next
              </button>
            </span>
          </div>
        </div>
      </section>
    </main>
  )
}
