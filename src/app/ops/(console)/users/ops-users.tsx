'use client'

// The users directory (D1): search, filter, sort and page through every account.
//
// Search runs server-side, so it covers the whole table rather than whatever the old
// tab's hardcoded LIMIT 300 happened to hold. The search box is debounced so typing
// doesn't fire a request per keystroke, and every response is guarded by a `cancelled`
// flag so a slow early response can't overwrite a fast later one.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { COLORS, SERIF } from '../../ops-theme'
import { adminGet, controlStyle, fieldLabel, ghostBtn, numTd, pageStyle, panelStyle, td, th } from '../ops-ui'
import {
  DEFAULT_USER_LIMIT,
  statusLabel,
  USER_ROLE_FILTERS,
  USER_SORTS,
  USER_STATUS_FILTERS,
  type UserRoleFilter,
  type UserSort,
  type UserStatusFilter,
} from '@/lib/local/user-admin-core'
import { StatusPill, fmtDay } from './user-bits'

export type AdminUser = {
  id: string
  email: string
  full_name: string | null
  is_host: boolean
  email_verified: boolean
  verification_status: string
  created_at: string
  listing_count: number
  booking_count: number
  account_status: string
  status_reason: string | null
}

type Filters = {
  q: string
  status: UserStatusFilter
  role: UserRoleFilter
  sort: UserSort
  offset: number
}

const SORT_LABEL: Record<UserSort, string> = {
  recent: 'Newest first',
  oldest: 'Oldest first',
  name: 'Name (A–Z)',
  bookings: 'Most bookings',
}
const ROLE_LABEL: Record<UserRoleFilter, string> = { all: 'Everyone', host: 'Hosts', guest: 'Guests' }

export function OpsUsers({ initial }: { initial: { users: AdminUser[]; total: number } }) {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>(initial.users)
  const [total, setTotal] = useState(initial.total)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // `search` is what the operator is typing; `filters.q` is what we've actually
  // asked the server for. Splitting them is what makes the debounce work.
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>({
    q: '',
    status: 'all',
    role: 'all',
    sort: 'recent',
    offset: 0,
  })

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === search.trim() ? f : { ...f, q: search.trim(), offset: 0 }))
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  /** Any filter change resets to the first page — staying on page 4 of a result set
   *  that now has one page is how you get a confusing empty screen. */
  const set = useCallback((patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch, offset: patch.offset ?? 0 }))
  }, [])

  const query = useMemo(() => {
    const p = new URLSearchParams({
      status: filters.status,
      role: filters.role,
      sort: filters.sort,
      limit: String(DEFAULT_USER_LIMIT),
      offset: String(filters.offset),
    })
    if (filters.q) p.set('q', filters.q)
    return p.toString()
  }, [filters])

  // Skip the fetch the very first time: the server already rendered page one with
  // exactly these defaults, so remounting would just re-request it.
  const primed = useRef(false)

  useEffect(() => {
    if (!primed.current) {
      primed.current = true
      if (query === `status=all&role=all&sort=recent&limit=${DEFAULT_USER_LIMIT}&offset=0`) return
    }
    let cancelled = false
    setLoading(true)
    adminGet<{ users: AdminUser[]; total: number; error?: string }>(`users?${query}`).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res === 'forbidden') { setError('Your account does not have the Users module.'); return }
      if (!res) { setError('Could not load users. Please retry.'); return }
      setError(null)
      setUsers(res.users ?? [])
      setTotal(res.total ?? 0)
    })
    return () => { cancelled = true }
  }, [query])

  const from = total === 0 ? 0 : filters.offset + 1
  const to = Math.min(filters.offset + DEFAULT_USER_LIMIT, total)
  const canPrev = filters.offset > 0
  const canNext = filters.offset + DEFAULT_USER_LIMIT < total

  return (
    <main style={pageStyle}>
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 64px' }}>
        <h1 style={{ margin: '0 0 4px', fontFamily: SERIF, fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', color: COLORS.burgundy }}>
          Users
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: COLORS.muted }}>
          Every guest and host. Open anyone to see their listings, bookings, payments and
          documents — or to block or remove the account.
        </p>

        {error && <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.red, fontSize: 13, fontWeight: 700 }}>{error}</div>}

        {/* ---- Filters ---- */}
        <div style={{ ...panelStyle, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ flex: '2 1 240px' }}>
            <span style={fieldLabel}>Search</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email or phone"
              style={controlStyle}
            />
          </label>
          <label style={{ flex: '1 1 130px' }}>
            <span style={fieldLabel}>Status</span>
            <select value={filters.status} onChange={(e) => set({ status: e.target.value as UserStatusFilter })} style={controlStyle}>
              {USER_STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>{s === 'all' ? 'Any status' : statusLabel(s)}</option>
              ))}
            </select>
          </label>
          <label style={{ flex: '1 1 130px' }}>
            <span style={fieldLabel}>Type</span>
            <select value={filters.role} onChange={(e) => set({ role: e.target.value as UserRoleFilter })} style={controlStyle}>
              {USER_ROLE_FILTERS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </label>
          <label style={{ flex: '1 1 150px' }}>
            <span style={fieldLabel}>Sort</span>
            <select value={filters.sort} onChange={(e) => set({ sort: e.target.value as UserSort })} style={controlStyle}>
              {USER_SORTS.map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
            </select>
          </label>
        </div>

        {/* ---- Table ---- */}
        <div style={{ ...panelStyle, marginTop: 14, opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Email</th>
                  <th style={th}>Type</th>
                  <th style={th}>Status</th>
                  <th style={th}>Email</th>
                  <th style={{ ...th, textAlign: 'right' }}>Listings</th>
                  <th style={{ ...th, textAlign: 'right' }}>Bookings</th>
                  <th style={th}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => router.push(`/ops/users/${u.id}`)}
                    style={{ cursor: 'pointer' }}
                    title="Open profile"
                  >
                    <td style={{ ...td, fontWeight: 700 }}>{u.full_name || '—'}</td>
                    <td style={td}>{u.email}</td>
                    <td style={td}>{u.is_host ? 'Host' : 'Guest'}</td>
                    <td style={td}><StatusPill status={u.account_status} /></td>
                    <td style={td}>
                      {u.email_verified
                        ? <span style={{ color: COLORS.green, fontWeight: 700 }}>Verified</span>
                        : <span style={{ color: COLORS.muted }}>Unverified</span>}
                    </td>
                    <td style={numTd}>{u.listing_count}</td>
                    <td style={numTd}>{u.booking_count}</td>
                    <td style={td}>{fmtDay(u.created_at)}</td>
                  </tr>
                ))}
                {users.length === 0 && !loading && (
                  <tr>
                    <td style={{ ...td, color: COLORS.muted }} colSpan={8}>
                      No users match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ---- Pagination ---- */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: COLORS.muted }}>
              {total === 0 ? 'No results' : `Showing ${from}–${to} of ${total}`}
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={!canPrev || loading}
                onClick={() => setFilters((f) => ({ ...f, offset: Math.max(0, f.offset - DEFAULT_USER_LIMIT) }))}
                style={{ ...ghostBtn, opacity: canPrev ? 1 : 0.4 }}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!canNext || loading}
                onClick={() => setFilters((f) => ({ ...f, offset: f.offset + DEFAULT_USER_LIMIT }))}
                style={{ ...ghostBtn, opacity: canNext ? 1 : 0.4 }}
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
