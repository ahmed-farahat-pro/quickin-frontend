'use client'

// Full admin panel. The hardcoded admin (username "admin") logs in via the normal
// login form; on success they're routed here. Loads EVERYTHING from
// /api/local/admin/overview and gives full control: reveal passwords (eye toggle),
// change roles, and delete any row — all with branded (non-native) confirm + toast.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_URL } from '@/lib/api'
import { EyeIcon, EyeOffIcon } from '@/app/_components/password-eye'

const COLORS = { burgundy: '#5B0F16', cream: '#F6F1E6', page: '#E4DECF', tan: '#EFE6D8', ink: '#2A2220', muted: '#6B6055', gold: '#B07A2A' }
const GRAD_BURGUNDY = 'linear-gradient(135deg,#5B0F16,#8a2530)'
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

interface Overview {
  users: Record<string, unknown>[]
  listings: Record<string, unknown>[]
  bookings: Record<string, unknown>[]
  services: Record<string, unknown>[]
  serviceRequests: Record<string, unknown>[]
  counts: Record<string, number>
}

type TabKey = 'users' | 'listings' | 'bookings' | 'services' | 'serviceRequests'

const ENTITY_SLUG: Record<TabKey, string> = {
  users: 'users', listings: 'listings', bookings: 'bookings', services: 'services', serviceRequests: 'service-requests',
}
const TAB_LABEL: Record<TabKey, string> = {
  users: 'Users', listings: 'Listings', bookings: 'Reservations', services: 'Services', serviceRequests: 'Subscriptions',
}

interface Column { key: string; label: string; render?: (v: unknown, row: Record<string, unknown>) => React.ReactNode }

const money = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : `EGP ${Number(v).toFixed(0)}`)
const yn = (v: unknown) => (v ? '✓' : '✗')

// Booking lifecycle: the raw status values the backend stores + how we present
// them. "confirmed" reads as "Booked"; "completed" as "Stay ended".
const BOOKING_STATUSES = ['pending', 'confirmed', 'completed', 'rejected', 'cancelled'] as const
type BookingStatus = (typeof BOOKING_STATUSES)[number]
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', confirmed: 'Booked', completed: 'Stay ended', rejected: 'Rejected', cancelled: 'Cancelled',
}
const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  confirmed: { bg: '#0f5132', fg: '#fff' }, completed: { bg: 'rgba(15,81,50,0.12)', fg: '#0f5132' },
  pending: { bg: COLORS.tan, fg: COLORS.burgundy }, rejected: { bg: 'rgba(91,15,22,0.10)', fg: COLORS.burgundy },
  cancelled: { bg: 'rgba(42,34,32,0.10)', fg: COLORS.muted },
}
const statusBadge = (v: unknown) => {
  const s = String(v ?? '')
  const c = STATUS_COLOR[s] || { bg: COLORS.tan, fg: COLORS.ink }
  const label = STATUS_LABEL[s] || (s || '—')
  return <span style={{ background: c.bg, color: c.fg, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>{label}</span>
}

// Listing visibility badge: green "Active" when published (shows in
// search/explore), muted grey "Inactive" when not (hidden but not deleted).
const publishedBadge = (v: unknown) => {
  const on = !!v
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap',
      background: on ? '#0f5132' : 'rgba(42,34,32,0.10)', color: on ? '#fff' : COLORS.muted,
    }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: on ? '#fff' : COLORS.muted }} />
      {on ? 'Active' : 'Inactive'}
    </span>
  )
}

// Gold ★ rating + "(N)" review count for the listings table.
const ratingCell = (_v: unknown, r: Record<string, unknown>) => {
  const count = Number(r.review_count ?? 0)
  const avg = Number(r.rating ?? 0)
  if (!count) return <span style={{ color: COLORS.muted, fontSize: 12.5 }}>No reviews</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, fontWeight: 700, color: COLORS.ink, fontSize: 13 }}>
      <span style={{ color: COLORS.gold }} aria-hidden="true">★</span>
      <span>{avg.toFixed(1)}</span>
      <span style={{ color: COLORS.muted, fontWeight: 600 }}>({count})</span>
    </span>
  )
}

// Reveal/hide a stored password with an eye toggle.
function PasswordCell({ value }: { value: unknown }) {
  const [show, setShow] = useState(false)
  const pw = value ? String(value) : ''
  if (!pw) return <span style={{ color: COLORS.muted }} title="Hashed only — not recoverable">—</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <code style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, color: COLORS.ink, minWidth: 80 }}>
        {show ? pw : '•'.repeat(Math.min(pw.length, 10))}
      </code>
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: COLORS.muted, padding: 2, display: 'inline-flex' }}>
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </span>
  )
}

const COLUMNS: Record<TabKey, Column[]> = {
  users: [
    { key: 'email', label: 'Email' },
    { key: 'full_name', label: 'Name' },
    { key: 'role', label: 'Role', render: (v) => <span style={{ fontWeight: 700, color: v === 'admin' ? COLORS.burgundy : v === 'host' ? '#0f5132' : COLORS.ink }}>{String(v)}</span> },
    { key: 'password_plain', label: 'Password', render: (v) => <PasswordCell value={v} /> },
    { key: 'email_verified', label: 'Verified', render: yn },
  ],
  listings: [
    { key: 'title', label: 'Title' }, { key: 'location', label: 'Location' },
    { key: 'price_per_night', label: 'Price', render: (v) => `${money(v)}/night` }, { key: 'host_email', label: 'Host' },
    { key: 'rating', label: 'Reviews', render: ratingCell },
    { key: 'is_published', label: 'Status', render: publishedBadge },
  ],
  bookings: [
    { key: 'reservation_code', label: 'Code' }, { key: 'listing_title', label: 'Listing' }, { key: 'guest_email', label: 'Guest' },
    { key: 'status', label: 'Status', render: statusBadge },
    { key: 'check_in', label: 'Dates', render: (_v, r) => `${r.check_in ?? '—'} → ${r.check_out ?? '—'}` },
    { key: 'total_price', label: 'Total', render: money },
  ],
  services: [
    { key: 'title', label: 'Service' }, { key: 'category', label: 'Category' }, { key: 'price', label: 'Price', render: money }, { key: 'host_email', label: 'Host' },
  ],
  serviceRequests: [
    { key: 'request_code', label: 'Code' }, { key: 'service_title', label: 'Service' }, { key: 'requester_email', label: 'Subscriber' }, { key: 'status', label: 'Status', render: statusBadge },
  ],
}

type Toast = { message: string; kind: 'success' | 'error' }
type Confirm = { title: string; message: string; onConfirm: () => void }
// One public review row (GET /api/local/reviews?listing_id=).
type AdminReview = { rating: number; comment: string | null; reviewer_name: string | null; created_at: string }
// State for the "view reviews" modal: which listing, plus the fetched reviews
// (null while loading).
type ReviewsModal = { listingId: string; title: string; reviews: AdminReview[] | null }

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [data, setData] = useState<Overview | null>(null)
  const [tab, setTab] = useState<TabKey>('users')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [reviewsModal, setReviewsModal] = useState<ReviewsModal | null>(null)

  // Auto-dismiss toasts.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  const load = useCallback(async (t: string) => {
    try {
      const res = await fetch(`${API_URL}/api/local/admin/overview`, { headers: { Authorization: `Bearer ${t}` } })
      if (res.status === 401 || res.status === 403) { window.location.href = '/login'; return }
      const d = await res.json()
      if (!res.ok) { setToast({ message: d?.error || 'Failed to load', kind: 'error' }); return }
      setData(d)
    } catch { setToast({ message: 'Network error loading admin data.', kind: 'error' }) }
  }, [])

  useEffect(() => {
    let t: string | null = null, role: string | undefined
    try {
      t = localStorage.getItem('qk_token')
      const raw = localStorage.getItem('qk_user')
      if (raw) { const u = JSON.parse(raw); role = u?.role; setEmail(u?.email || 'admin') }
    } catch {}
    if (!t || role !== 'admin') { window.location.href = '/login'; return }
    setToken(t); setChecked(true); load(t)
  }, [load])

  async function doDelete(slug: string, id: string, label: string) {
    setConfirm(null)
    if (!token) return
    setBusyId(id)
    try {
      const res = await fetch(`${API_URL}/api/local/admin/${slug}/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setToast({ message: d?.error || 'Delete failed', kind: 'error' }); return }
      setToast({ message: `${label} deleted`, kind: 'success' })
      await load(token)
    } catch { setToast({ message: 'Network error during delete.', kind: 'error' }) } finally { setBusyId(null) }
  }

  async function changeRole(id: string, role: string) {
    if (!token) return
    setBusyId(id)
    try {
      const res = await fetch(`${API_URL}/api/local/admin/users/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ role }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setToast({ message: d?.error || 'Role change failed', kind: 'error' }); return }
      setToast({ message: `Role changed to ${role}`, kind: 'success' })
      await load(token)
    } catch { setToast({ message: 'Network error.', kind: 'error' }) } finally { setBusyId(null) }
  }

  // Move a booking through its lifecycle (pending → confirmed/Booked →
  // completed/Stay ended, or rejected/cancelled). PATCHes the admin endpoint and
  // refreshes the table.
  async function changeBookingStatus(id: string, status: BookingStatus) {
    if (!token) return
    setBusyId(id)
    try {
      const res = await fetch(`${API_URL}/api/local/admin/bookings/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setToast({ message: d?.error || 'Status change failed', kind: 'error' }); return }
      setToast({ message: `Marked “${STATUS_LABEL[status] ?? status}”`, kind: 'success' })
      await load(token)
    } catch { setToast({ message: 'Network error.', kind: 'error' }) } finally { setBusyId(null) }
  }

  // Activate / deactivate a listing. PATCHes is_published; a deactivated listing
  // disappears from search/explore but isn't deleted. Refreshes the overview after.
  async function toggleListingPublished(id: string, next: boolean) {
    if (!token) return
    setBusyId(id)
    try {
      const res = await fetch(`${API_URL}/api/local/admin/listings/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ is_published: next }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setToast({ message: d?.error || 'Update failed', kind: 'error' }); return }
      setToast({ message: next ? 'Listing activated' : 'Listing deactivated', kind: 'success' })
      await load(token)
    } catch { setToast({ message: 'Network error.', kind: 'error' }) } finally { setBusyId(null) }
  }

  // Open the reviews modal for a listing and fetch its public reviews.
  async function openReviews(listingId: string, title: string) {
    setReviewsModal({ listingId, title, reviews: null })
    try {
      const res = await fetch(`${API_URL}/api/local/reviews?listing_id=${encodeURIComponent(listingId)}`)
      const d = await res.json().catch(() => [])
      setReviewsModal({ listingId, title, reviews: Array.isArray(d) ? (d as AdminReview[]) : [] })
    } catch {
      setReviewsModal({ listingId, title, reviews: [] })
    }
  }

  function logout() {
    try { localStorage.removeItem('qk_token'); localStorage.removeItem('qk_user') } catch {}
    window.location.href = '/login'
  }

  const rows = useMemo(() => (data ? (data[tab] as Record<string, unknown>[]) : []), [data, tab])
  const columns = COLUMNS[tab]
  if (!checked) return null
  const singular = TAB_LABEL[tab].replace(/s$/, '').toLowerCase()

  return (
    <main style={{ minHeight: '100vh', background: COLORS.page, color: COLORS.ink, fontFamily: FONT, padding: '32px 18px 64px' }}>
      <div style={{ maxWidth: 1140, margin: '0 auto' }}>
        {/* Burgundy-gradient header bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12, background: 'linear-gradient(135deg,#5B0F16,#7a1620)', borderRadius: 22, padding: '20px 24px', boxShadow: '0 16px 40px rgba(91,15,22,0.28)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/logo.png" alt="QuickIn" style={{ height: 38, filter: 'brightness(0) invert(1)' }} />
            <div>
              <h1 style={{ margin: 0, fontSize: 24, color: '#fff' }}>Admin Dashboard</h1>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: 'rgba(246,241,230,0.8)' }}>Signed in as {email} · <span style={{ color: COLORS.gold, fontWeight: 700 }}>full control</span></p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => token && load(token)} className="qk-press" style={ghostBtnLight}>Refresh</button>
            <button onClick={logout} className="qk-press" style={ghostBtnLight}>Log out</button>
          </div>
        </div>

        {/* Count cards / tab selectors */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 22 }}>
          {(Object.keys(TAB_LABEL) as TabKey[]).map((k) => {
            const active = tab === k
            return (
              <button key={k} onClick={() => setTab(k)} className="qk-tap" style={{
                textAlign: 'left', cursor: 'pointer', appearance: 'none', fontFamily: FONT,
                background: active ? GRAD_BURGUNDY : '#fff', color: active ? '#fff' : COLORS.ink,
                border: `1px solid ${active ? 'transparent' : COLORS.tan}`, borderRadius: 18, padding: '14px 16px',
                boxShadow: active ? '0 12px 28px rgba(91,15,22,0.22)' : '0 8px 22px rgba(42,34,32,0.08)',
              }}>
                <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.8 }}>{TAB_LABEL[k]}</span>
                <span style={{ display: 'block', fontSize: 28, fontWeight: 800, marginTop: 2, color: active ? '#fff' : COLORS.gold }}>{data ? data.counts[k] ?? 0 : '—'}</span>
              </button>
            )
          })}
        </div>

        <div style={{ background: '#fff', borderRadius: 22, border: `1px solid ${COLORS.tan}`, overflow: 'hidden', boxShadow: '0 8px 22px rgba(42,34,32,0.08)' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${COLORS.tan}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span aria-hidden="true" style={{ width: 4, height: 16, borderRadius: 999, background: 'linear-gradient(135deg,#B07A2A,#d8a55a)' }} />
            <h2 style={{ margin: 0, fontSize: 16, color: COLORS.burgundy }}>{TAB_LABEL[tab]} ({rows.length})</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr>
                  {columns.map((c) => <th key={c.key} style={th}>{c.label}</th>)}
                  <th style={{ ...th, textAlign: 'right' }}>{tab === 'users' ? 'Role / Action' : 'Action'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={columns.length + 1} style={{ padding: 24, textAlign: 'center', color: COLORS.muted }}>Nothing here.</td></tr>
                )}
                {rows.map((row) => {
                  const id = String(row.id)
                  return (
                    <tr key={id} className="qk-row" style={{ borderTop: `1px solid ${COLORS.cream}` }}>
                      {columns.map((c) => <td key={c.key} style={td}>{c.render ? c.render(row[c.key], row) : String(row[c.key] ?? '—')}</td>)}
                      <td style={{ ...td, textAlign: 'right' }}>
                        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                          {tab === 'users' && (
                            <select value={String(row.role)} disabled={busyId === id} onChange={(e) => changeRole(id, e.target.value)} style={selectStyle}>
                              <option value="user">user</option>
                              <option value="host">host</option>
                              <option value="admin">admin</option>
                            </select>
                          )}
                          {tab === 'bookings' && (
                            <select
                              value={BOOKING_STATUSES.includes(String(row.status) as BookingStatus) ? String(row.status) : 'pending'}
                              disabled={busyId === id}
                              onChange={(e) => changeBookingStatus(id, e.target.value as BookingStatus)}
                              style={selectStyle}
                              aria-label="Booking status"
                            >
                              {BOOKING_STATUSES.map((s) => (
                                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                              ))}
                            </select>
                          )}
                          {tab === 'listings' && (() => {
                            const published = !!row.is_published
                            return (
                              <button
                                type="button"
                                onClick={() => toggleListingPublished(id, !published)}
                                disabled={busyId === id}
                                className="qk-press"
                                aria-label={published ? 'Deactivate listing' : 'Activate listing'}
                                title={published ? 'Hide from search/explore' : 'Show in search/explore'}
                                style={
                                  published
                                    ? { appearance: 'none', border: `1px solid ${COLORS.burgundy}`, background: busyId === id ? COLORS.tan : '#fff', color: COLORS.burgundy, fontWeight: 700, fontSize: 12.5, fontFamily: FONT, borderRadius: 999, padding: '6px 14px', cursor: busyId === id ? 'default' : 'pointer' }
                                    : { appearance: 'none', border: 'none', background: busyId === id ? COLORS.tan : GRAD_BURGUNDY, color: '#fff', fontWeight: 700, fontSize: 12.5, fontFamily: FONT, borderRadius: 999, padding: '6px 14px', cursor: busyId === id ? 'default' : 'pointer', boxShadow: busyId === id ? 'none' : '0 8px 18px rgba(91,15,22,0.24)' }
                                }>
                                {busyId === id ? '…' : published ? 'Deactivate' : 'Activate'}
                              </button>
                            )
                          })()}
                          {tab === 'listings' && (
                            <button
                              type="button"
                              onClick={() => openReviews(id, String(row.title ?? 'Listing'))}
                              style={{ appearance: 'none', border: `1px solid ${COLORS.gold}`, background: '#fff', color: COLORS.gold, fontWeight: 700, fontSize: 12.5, fontFamily: FONT, borderRadius: 999, padding: '6px 14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <span aria-hidden="true">★</span> Reviews{Number(row.review_count ?? 0) > 0 ? ` (${Number(row.review_count)})` : ''}
                            </button>
                          )}
                          <button
                            onClick={() => setConfirm({ title: `Delete this ${singular}?`, message: 'This is permanent and cannot be undone.', onConfirm: () => doDelete(ENTITY_SLUG[tab], id, singular) })}
                            disabled={busyId === id}
                            style={{ appearance: 'none', border: `1px solid ${COLORS.burgundy}`, background: busyId === id ? COLORS.tan : '#fff', color: COLORS.burgundy, fontWeight: 700, fontSize: 12.5, fontFamily: FONT, borderRadius: 999, padding: '6px 14px', cursor: busyId === id ? 'default' : 'pointer' }}>
                            {busyId === id ? '…' : 'Delete'}
                          </button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p style={{ marginTop: 14, fontSize: 12.5, color: COLORS.muted }}>
          Passwords show only for accounts created in-app (prototype) and the demo accounts; older / Google sign-ins show “—”. Click the eye to reveal. Deleting a user also removes the places they host.
        </p>
      </div>

      {/* Branded confirm modal (replaces the native browser confirm) */}
      {confirm && (
        <div role="dialog" aria-modal="true" onClick={() => setConfirm(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(20,12,10,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 28, border: `1px solid rgba(42,34,32,0.06)`, boxShadow: '0 24px 60px rgba(42,34,32,0.28)', padding: 26, textAlign: 'center', fontFamily: FONT }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, background: 'rgba(91,15,22,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={COLORS.burgundy} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" />
              </svg>
            </div>
            <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: COLORS.ink }}>{confirm.title}</h2>
            <p style={{ margin: '0 0 20px', fontSize: 14.5, color: COLORS.muted, lineHeight: 1.45 }}>{confirm.message}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirm(null)} className="qk-press" style={{ flex: 1, padding: '12px', borderRadius: 14, border: `1px solid ${COLORS.tan}`, background: '#fff', color: COLORS.ink, fontWeight: 700, fontSize: 14.5, fontFamily: FONT, cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirm.onConfirm} className="qk-press" style={{ flex: 1, padding: '12px', borderRadius: 14, border: 'none', background: GRAD_BURGUNDY, color: '#fff', fontWeight: 700, fontSize: 14.5, fontFamily: FONT, cursor: 'pointer', boxShadow: '0 10px 24px rgba(91,15,22,0.28)' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Reviews viewer — opened from the listings table. */}
      {reviewsModal && (
        <div role="dialog" aria-modal="true" onClick={() => setReviewsModal(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(20,12,10,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 520, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 28, border: `1px solid rgba(42,34,32,0.06)`, boxShadow: '0 24px 60px rgba(42,34,32,0.28)', fontFamily: FONT }}>
            <div style={{ background: 'linear-gradient(135deg,#5B0F16,#7a1620)', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: COLORS.gold, fontWeight: 700 }}>Reviews</p>
                <h2 style={{ margin: '2px 0 0', fontSize: 18, color: '#fff' }}>{reviewsModal.title}</h2>
              </div>
              <button type="button" onClick={() => setReviewsModal(null)} aria-label="Close" className="qk-press"
                style={{ flex: '0 0 auto', appearance: 'none', border: '1px solid rgba(246,241,230,0.5)', background: 'rgba(246,241,230,0.12)', color: '#fff', fontWeight: 700, fontSize: 16, lineHeight: 1, borderRadius: 999, width: 32, height: 32, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '18px 22px', overflowY: 'auto' }}>
              {reviewsModal.reviews === null && (
                <p style={{ margin: 0, padding: '20px 0', textAlign: 'center', color: COLORS.muted, fontSize: 14 }}>Loading reviews…</p>
              )}
              {reviewsModal.reviews !== null && reviewsModal.reviews.length === 0 && (
                <p style={{ margin: 0, padding: '20px 0', textAlign: 'center', color: COLORS.muted, fontSize: 14 }}>No reviews yet for this listing.</p>
              )}
              {reviewsModal.reviews !== null && reviewsModal.reviews.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {reviewsModal.reviews.map((r, i) => {
                    const full = Math.max(0, Math.min(5, Math.round(Number(r.rating) || 0)))
                    return (
                      <div key={i} style={{ background: COLORS.cream, borderRadius: 16, border: '1px solid rgba(42,34,32,0.06)', padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <span aria-hidden="true" style={{ letterSpacing: 1, fontSize: 14 }}>
                            {Array.from({ length: 5 }).map((_, n) => (
                              <span key={n} style={{ color: n < full ? COLORS.gold : 'rgba(42,34,32,0.20)' }}>★</span>
                            ))}
                          </span>
                          {r.created_at && (
                            <span style={{ fontSize: 12, color: COLORS.muted }}>
                              {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                        <p style={{ margin: '8px 0 0', fontSize: 13.5, fontWeight: 700, color: COLORS.ink }}>{r.reviewer_name || 'Guest'}</p>
                        {r.comment && <p style={{ margin: '5px 0 0', fontSize: 13.5, lineHeight: 1.55, color: COLORS.ink }}>{r.comment}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Branded toast (replaces browser alerts) */}
      {toast && (
        <div style={{ position: 'fixed', top: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 1100, fontFamily: FONT,
          background: toast.kind === 'success' ? '#0f5132' : COLORS.burgundy, color: '#fff', padding: '12px 20px', borderRadius: 14,
          boxShadow: '0 10px 30px rgba(42,34,32,0.28)', fontSize: 14, fontWeight: 600, maxWidth: '90vw' }}>
          {toast.message}
        </div>
      )}
    </main>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '11px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: COLORS.muted, background: COLORS.cream, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '11px 16px', color: COLORS.ink, verticalAlign: 'middle', whiteSpace: 'nowrap' }
const ghostBtn: React.CSSProperties = { appearance: 'none', border: `1px solid ${COLORS.burgundy}`, background: '#fff', color: COLORS.burgundy, fontWeight: 600, fontSize: 14, fontFamily: FONT, borderRadius: 999, padding: '8px 18px', cursor: 'pointer' }
const ghostBtnLight: React.CSSProperties = { appearance: 'none', border: '1px solid rgba(246,241,230,0.5)', background: 'rgba(246,241,230,0.12)', color: '#fff', fontWeight: 600, fontSize: 14, fontFamily: FONT, borderRadius: 999, padding: '8px 18px', cursor: 'pointer' }
const selectStyle: React.CSSProperties = { appearance: 'auto', border: `1px solid ${COLORS.tan}`, background: '#fff', color: COLORS.ink, fontSize: 12.5, fontFamily: FONT, borderRadius: 8, padding: '5px 8px', cursor: 'pointer' }
