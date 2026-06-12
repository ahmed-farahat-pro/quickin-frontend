'use client'

// Full admin panel. The hardcoded admin (username "admin") logs in via the normal
// login form; on success they're routed here. This page reads the admin bearer
// token, loads EVERYTHING from /api/local/admin/overview, and can delete any row
// (users, listings, bookings, services, subscriptions) via the admin-gated API.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_URL } from '@/lib/api'

const COLORS = { burgundy: '#5B0F16', cream: '#F6F1E6', tan: '#EFE6D8', ink: '#2A2220', muted: '#6B6055' }
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

interface Overview {
  users: Record<string, unknown>[]
  listings: Record<string, unknown>[]
  bookings: Record<string, unknown>[]
  services: Record<string, unknown>[]
  serviceRequests: Record<string, unknown>[]
  counts: { users: number; listings: number; bookings: number; services: number; serviceRequests: number }
}

type TabKey = 'users' | 'listings' | 'bookings' | 'services' | 'serviceRequests'

// entity slug used by DELETE /api/local/admin/:entity/:id
const ENTITY_SLUG: Record<TabKey, string> = {
  users: 'users',
  listings: 'listings',
  bookings: 'bookings',
  services: 'services',
  serviceRequests: 'service-requests',
}

interface Column {
  key: string
  label: string
  render?: (v: unknown, row: Record<string, unknown>) => React.ReactNode
}

const money = (v: unknown) => (typeof v === 'number' || (typeof v === 'string' && v !== '') ? `$${Number(v).toFixed(0)}` : '—')
const yn = (v: unknown) => (v ? '✓' : '✗')
const statusBadge = (v: unknown) => {
  const s = String(v ?? '')
  const map: Record<string, { bg: string; fg: string }> = {
    confirmed: { bg: '#0f5132', fg: '#fff' },
    pending: { bg: COLORS.tan, fg: COLORS.burgundy },
    rejected: { bg: 'rgba(91,15,22,0.10)', fg: COLORS.burgundy },
    cancelled: { bg: 'rgba(42,34,32,0.10)', fg: COLORS.muted },
  }
  const c = map[s] || { bg: COLORS.tan, fg: COLORS.ink }
  return <span style={{ background: c.bg, color: c.fg, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }}>{s || '—'}</span>
}

const COLUMNS: Record<TabKey, Column[]> = {
  users: [
    { key: 'email', label: 'Email' },
    { key: 'full_name', label: 'Name' },
    { key: 'role', label: 'Role', render: (v) => <span style={{ fontWeight: 700, color: v === 'admin' ? COLORS.burgundy : v === 'host' ? '#0f5132' : COLORS.ink }}>{String(v)}</span> },
    { key: 'provider', label: 'Provider' },
    { key: 'email_verified', label: 'Verified', render: yn },
  ],
  listings: [
    { key: 'title', label: 'Title' },
    { key: 'location', label: 'Location' },
    { key: 'price_per_night', label: 'Price', render: (v) => `${money(v)}/night` },
    { key: 'host_email', label: 'Host' },
  ],
  bookings: [
    { key: 'reservation_code', label: 'Code' },
    { key: 'listing_title', label: 'Listing' },
    { key: 'guest_email', label: 'Guest' },
    { key: 'status', label: 'Status', render: statusBadge },
    { key: 'check_in', label: 'Dates', render: (_v, r) => `${r.check_in ?? '—'} → ${r.check_out ?? '—'}` },
    { key: 'total_price', label: 'Total', render: money },
  ],
  services: [
    { key: 'title', label: 'Service' },
    { key: 'category', label: 'Category' },
    { key: 'price', label: 'Price', render: money },
    { key: 'host_email', label: 'Host' },
  ],
  serviceRequests: [
    { key: 'request_code', label: 'Code' },
    { key: 'service_title', label: 'Service' },
    { key: 'requester_email', label: 'Subscriber' },
    { key: 'status', label: 'Status', render: statusBadge },
  ],
}

const TAB_LABEL: Record<TabKey, string> = {
  users: 'Users',
  listings: 'Listings',
  bookings: 'Reservations',
  services: 'Services',
  serviceRequests: 'Subscriptions',
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null)
  const [email, setEmail] = useState<string>('')
  const [data, setData] = useState<Overview | null>(null)
  const [tab, setTab] = useState<TabKey>('users')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)

  const load = useCallback(async (t: string) => {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/local/admin/overview`, { headers: { Authorization: `Bearer ${t}` } })
      if (res.status === 401 || res.status === 403) { window.location.href = '/login'; return }
      const d = await res.json()
      if (!res.ok) { setError(d?.error || 'Failed to load admin data'); return }
      setData(d)
    } catch {
      setError('Network error loading admin data.')
    }
  }, [])

  useEffect(() => {
    let t: string | null = null
    let role: string | undefined
    try {
      t = localStorage.getItem('qk_token')
      const raw = localStorage.getItem('qk_user')
      if (raw) { const u = JSON.parse(raw); role = u?.role; setEmail(u?.email || 'admin') }
    } catch {}
    if (!t || role !== 'admin') { window.location.href = '/login'; return }
    setToken(t); setChecked(true)
    load(t)
  }, [load])

  async function del(slug: string, id: string, label: string) {
    if (!token) return
    if (!window.confirm(`Delete this ${label}?\nThis is permanent and cannot be undone.`)) return
    setBusyId(id)
    try {
      const res = await fetch(`${API_URL}/api/local/admin/${slug}/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d?.error || 'Delete failed'); setBusyId(null); return }
      await load(token)
    } catch {
      setError('Network error during delete.')
    } finally {
      setBusyId(null)
    }
  }

  function logout() {
    try { localStorage.removeItem('qk_token'); localStorage.removeItem('qk_user') } catch {}
    window.location.href = '/login'
  }

  const rows = useMemo(() => (data ? (data[tab] as Record<string, unknown>[]) : []), [data, tab])
  const columns = COLUMNS[tab]

  if (!checked) return null

  return (
    <main style={{ minHeight: '100vh', background: COLORS.cream, color: COLORS.ink, fontFamily: FONT, padding: '32px 18px 64px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/logo.png" alt="QuickIn" style={{ height: 38 }} />
            <div>
              <h1 style={{ margin: 0, fontSize: 24, color: COLORS.burgundy }}>Admin Dashboard</h1>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: COLORS.muted }}>Signed in as {email} · full control</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => token && load(token)} style={ghostBtn}>Refresh</button>
            <button onClick={logout} style={ghostBtn}>Log out</button>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: 'rgba(91,15,22,0.08)', border: `1px solid rgba(91,15,22,0.2)`, color: COLORS.burgundy, fontWeight: 600, fontSize: 14 }}>{error}</div>
        )}

        {/* Count cards (double as tab selectors) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 22 }}>
          {(Object.keys(TAB_LABEL) as TabKey[]).map((k) => {
            const active = tab === k
            return (
              <button key={k} onClick={() => setTab(k)} style={{
                textAlign: 'left', cursor: 'pointer', appearance: 'none', fontFamily: FONT,
                background: active ? COLORS.burgundy : '#fff', color: active ? '#fff' : COLORS.ink,
                border: `1px solid ${active ? COLORS.burgundy : COLORS.tan}`, borderRadius: 16, padding: '14px 16px',
              }}>
                <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.8 }}>{TAB_LABEL[k]}</span>
                <span style={{ display: 'block', fontSize: 26, fontWeight: 800, marginTop: 2 }}>{data ? (data.counts as Record<string, number>)[k] ?? 0 : '—'}</span>
              </button>
            )
          })}
        </div>

        {/* Active table */}
        <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${COLORS.tan}`, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${COLORS.tan}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 16, color: COLORS.burgundy }}>{TAB_LABEL[tab]} ({rows.length})</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr>
                  {columns.map((c) => <th key={c.key} style={th}>{c.label}</th>)}
                  <th style={{ ...th, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={columns.length + 1} style={{ padding: 24, textAlign: 'center', color: COLORS.muted }}>Nothing here.</td></tr>
                )}
                {rows.map((row) => {
                  const id = String(row.id)
                  return (
                    <tr key={id} style={{ borderTop: `1px solid ${COLORS.cream}` }}>
                      {columns.map((c) => (
                        <td key={c.key} style={td}>{c.render ? c.render(row[c.key], row) : String(row[c.key] ?? '—')}</td>
                      ))}
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button
                          onClick={() => del(ENTITY_SLUG[tab], id, TAB_LABEL[tab].replace(/s$/, '').toLowerCase())}
                          disabled={busyId === id}
                          style={{ appearance: 'none', border: `1px solid ${COLORS.burgundy}`, background: busyId === id ? COLORS.tan : '#fff', color: COLORS.burgundy, fontWeight: 700, fontSize: 12.5, fontFamily: FONT, borderRadius: 999, padding: '6px 14px', cursor: busyId === id ? 'default' : 'pointer' }}
                        >
                          {busyId === id ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p style={{ marginTop: 14, fontSize: 12.5, color: COLORS.muted }}>
          Deleting a user also removes the places they host (and those bookings). Reservations show each listing’s booked dates (availability).
        </p>
      </div>
    </main>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '11px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: COLORS.muted, background: COLORS.cream, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '11px 16px', color: COLORS.ink, verticalAlign: 'middle', whiteSpace: 'nowrap' }
const ghostBtn: React.CSSProperties = { appearance: 'none', border: `1px solid ${COLORS.burgundy}`, background: '#fff', color: COLORS.burgundy, fontWeight: 600, fontSize: 14, fontFamily: FONT, borderRadius: 999, padding: '8px 18px', cursor: 'pointer' }
