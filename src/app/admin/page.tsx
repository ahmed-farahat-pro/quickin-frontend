'use client'

// Full admin panel. The hardcoded admin (username "admin") logs in via the normal
// login form; on success they're routed here. Loads EVERYTHING from
// /api/local/admin/overview and gives full control: reveal passwords (eye toggle),
// change roles, and delete any row — all with branded (non-native) confirm + toast.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  API_URL,
  listVerifications,
  setVerification,
  listReports,
  resolveReport,
  listPendingListings,
  moderateListing,
  type AdminVerification,
  type AdminReport,
  type AdminPendingListing,
} from '@/lib/api'
import { EyeIcon, EyeOffIcon } from '@/app/_components/password-eye'
import { useLanguage } from '@/lib/i18n/language-provider'

const COLORS = { burgundy: '#5B0F16', cream: '#F6F1E6', page: '#E4DECF', tan: '#EFE6D8', ink: '#2A2220', muted: '#6B6055', gold: '#B07A2A' }
const GRAD_BURGUNDY = 'linear-gradient(135deg,#5B0F16,#8a2530)'
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

// One saved push token (FCM / APNs). Populated once a user opens the mobile app
// with notifications allowed on a real device. `platform` is ios | android | web.
interface DeviceToken {
  id: string
  token: string
  platform: string | null
  created_at: string | null
  user_email: string | null
  user_name: string | null
  user_role: string | null
}

interface Overview {
  users: Record<string, unknown>[]
  listings: Record<string, unknown>[]
  bookings: Record<string, unknown>[]
  services: Record<string, unknown>[]
  serviceRequests: Record<string, unknown>[]
  deviceTokens: DeviceToken[]
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

// Small role pill (user / host / admin) — reused beside a device token's owner.
const rolePill = (role: unknown) => {
  const r = String(role ?? 'user')
  const tone = r === 'admin' ? { bg: 'rgba(91,15,22,0.10)', fg: COLORS.burgundy } : r === 'host' ? { bg: 'rgba(15,81,50,0.12)', fg: '#0f5132' } : { bg: COLORS.tan, fg: COLORS.ink }
  return <span style={{ background: tone.bg, color: tone.fg, fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{r}</span>
}

// Platform badge for a push token (ios / android / web). Unknown values fall
// back to a neutral tan chip.
const PLATFORM_COLOR: Record<string, { bg: string; fg: string }> = {
  ios: { bg: 'rgba(42,34,32,0.10)', fg: COLORS.ink },
  android: { bg: 'rgba(15,81,50,0.12)', fg: '#0f5132' },
  web: { bg: 'rgba(176,122,42,0.16)', fg: COLORS.gold },
}
const platformBadge = (platform: unknown) => {
  const p = String(platform ?? '').toLowerCase()
  const tone = PLATFORM_COLOR[p] || { bg: COLORS.tan, fg: COLORS.muted }
  const label = p === 'ios' ? 'iOS' : p ? p.charAt(0).toUpperCase() + p.slice(1) : '—'
  return <span style={{ background: tone.bg, color: tone.fg, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>{label}</span>
}

// Format a stored timestamp as "Jun 14, 2026". Falls back to "—" when absent /
// unparseable.
const formatDate = (v: unknown) => {
  if (!v) return '—'
  const d = new Date(String(v))
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

// A push token shown truncated (they're long) with a copy-to-clipboard button.
// Reports success/failure up via `onCopied` so it reuses the page's toast.
function TokenCell({ value, onCopied }: { value: string; onCopied: (ok: boolean) => void }) {
  const [copied, setCopied] = useState(false)
  const head = value.slice(0, 12)
  const tail = value.length > 22 ? value.slice(-6) : ''
  const display = tail ? `${head}…${tail}` : value
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      onCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      onCopied(false)
    }
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <code title={value} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, color: COLORS.ink, background: COLORS.cream, border: `1px solid ${COLORS.tan}`, borderRadius: 8, padding: '3px 8px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {display}
      </code>
      <button type="button" onClick={copy} className="qk-press" aria-label="Copy token"
        title={copied ? 'Copied' : 'Copy full token'}
        style={{ appearance: 'none', border: `1px solid ${copied ? '#0f5132' : COLORS.tan}`, background: '#fff', color: copied ? '#0f5132' : COLORS.muted, cursor: 'pointer', padding: '4px 8px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, fontFamily: FONT }}>
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        )}
        {copied ? 'Copied' : 'Copy'}
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
  const { t } = useLanguage()
  const [token, setToken] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [data, setData] = useState<Overview | null>(null)
  const [tab, setTab] = useState<TabKey>('users')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [reviewsModal, setReviewsModal] = useState<ReviewsModal | null>(null)

  // Trust & safety triage: pending verifications + open reports. null = not yet
  // loaded. `docModal` holds an ID / ownership image shown full-size on demand.
  const [verifications, setVerifications] = useState<AdminVerification[] | null>(null)
  const [reports, setReports] = useState<AdminReport[] | null>(null)
  const [docModal, setDocModal] = useState<string | null>(null)

  // Listing moderation queue: listings awaiting approval. null = not yet loaded.
  const [pendingListings, setPendingListings] = useState<
    AdminPendingListing[] | null
  >(null)

  // "Send a notification" broadcast composer state.
  const [notifTitle, setNotifTitle] = useState('')
  const [notifBody, setNotifBody] = useState('')
  const [notifLink, setNotifLink] = useState('')
  const [notifAudience, setNotifAudience] = useState<'all' | 'guests' | 'hosts'>('all')
  const [notifPush, setNotifPush] = useState(true)
  const [notifEmail, setNotifEmail] = useState(false)
  const [notifSending, setNotifSending] = useState(false)
  // Inline confirmation under the composer (in addition to the toast).
  const [notifResult, setNotifResult] = useState<{ recipients: number; emailed: number } | null>(null)

  // Auto-dismiss toasts.
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(timer)
  }, [toast])

  const load = useCallback(async (tok: string) => {
    try {
      const res = await fetch(`${API_URL}/api/local/admin/overview`, { headers: { Authorization: `Bearer ${tok}` } })
      if (res.status === 401 || res.status === 403) { window.location.href = '/login'; return }
      const d = await res.json()
      if (!res.ok) { setToast({ message: d?.error || 'Failed to load', kind: 'error' }); return }
      setData(d)
    } catch { setToast({ message: 'Network error loading admin data.', kind: 'error' }) }
    // Trust & safety queues — fetched alongside the overview (own endpoints).
    listVerifications(tok).then(setVerifications)
    listReports(tok, 'open').then(setReports)
    // Listing moderation queue (pending listings).
    listPendingListings(tok).then(setPendingListings)
  }, [])

  useEffect(() => {
    let tok: string | null = null, role: string | undefined
    try {
      tok = localStorage.getItem('qk_token')
      const raw = localStorage.getItem('qk_user')
      if (raw) { const u = JSON.parse(raw); role = u?.role; setEmail(u?.email || 'admin') }
    } catch {}
    if (!tok || role !== 'admin') { window.location.href = '/login'; return }
    setToken(tok); setChecked(true); load(tok)
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

  // Approve / reject a pending identity verification, then drop the row.
  async function decideVerification(userId: string, action: 'approve' | 'reject') {
    if (!token) return
    setBusyId(userId)
    try {
      await setVerification(token, userId, action)
      setVerifications((prev) => (prev ? prev.filter((v) => v.id !== userId) : prev))
      setToast({
        message: action === 'approve' ? t('admin.verifyApproved') : t('admin.verifyRejected'),
        kind: 'success',
      })
    } catch {
      setToast({ message: t('admin.actionFailed'), kind: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  // Approve / reject a pending listing, then drop the row. Approve publishes it;
  // reject keeps it unpublished. Refreshes the overview so the Listings table
  // reflects the new published state.
  async function decideListing(listingId: string, action: 'approve' | 'reject') {
    if (!token) return
    setBusyId(listingId)
    try {
      await moderateListing(token, listingId, action)
      setPendingListings((prev) =>
        prev ? prev.filter((l) => l.id !== listingId) : prev
      )
      setToast({
        message:
          action === 'approve'
            ? t('admin.listingApproved')
            : t('admin.listingRejected'),
        kind: 'success',
      })
      // Keep the main Listings table's published state in sync.
      await load(token)
    } catch {
      setToast({ message: t('admin.actionFailed'), kind: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  // Resolve / dismiss an open report, then drop the row.
  async function decideReport(reportId: string, action: 'resolve' | 'dismiss') {
    if (!token) return
    setBusyId(reportId)
    try {
      await resolveReport(token, reportId, action)
      setReports((prev) => (prev ? prev.filter((r) => r.id !== reportId) : prev))
      setToast({
        message: action === 'resolve' ? t('admin.reportResolved') : t('admin.reportDismissed'),
        kind: 'success',
      })
    } catch {
      setToast({ message: t('admin.actionFailed'), kind: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  // Broadcast an announcement to every targeted user. Writes an in-app
  // notification per recipient + (optionally) FCM push and email. Title is
  // required; link/body are optional.
  async function sendNotification() {
    if (!token) return
    const title = notifTitle.trim()
    if (!title) { setToast({ message: 'Add a title before firing.', kind: 'error' }); return }
    setNotifSending(true)
    setNotifResult(null)
    try {
      const body = notifBody.trim()
      const link = notifLink.trim()
      const res = await fetch(`${API_URL}/api/local/admin/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title,
          body: body || undefined,
          link: link || undefined,
          audience: notifAudience,
          push: notifPush,
          email: notifEmail,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setToast({ message: d?.error || 'Failed to send notification', kind: 'error' }); return }
      const recipients = Number(d?.recipients ?? 0)
      const emailed = Number(d?.emailed ?? 0)
      setNotifResult({ recipients, emailed })
      setToast({ message: `Sent to ${recipients} recipient${recipients === 1 ? '' : 's'}`, kind: 'success' })
      // Clear the composer on success (keep audience/push/email preferences).
      setNotifTitle(''); setNotifBody(''); setNotifLink('')
    } catch { setToast({ message: 'Network error sending notification.', kind: 'error' }) } finally { setNotifSending(false) }
  }

  function logout() {
    try { localStorage.removeItem('qk_token'); localStorage.removeItem('qk_user') } catch {}
    window.location.href = '/login'
  }

  const rows = useMemo(() => (data ? (data[tab] as Record<string, unknown>[]) : []), [data, tab])
  const columns = COLUMNS[tab]
  // Saved push tokens (FCM / APNs) — rendered in their own section, not a tab.
  const deviceTokens = useMemo<DeviceToken[]>(() => (data?.deviceTokens ?? []), [data])
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

        {/* Broadcast composer — fire an in-app notification (+ push / email) to
            every targeted user. */}
        <div className="qk-card" style={{ background: '#fff', borderRadius: 22, border: `1px solid ${COLORS.tan}`, overflow: 'hidden', boxShadow: '0 8px 22px rgba(42,34,32,0.08)', marginBottom: 22 }}>
          <div style={{ background: GRAD_BURGUNDY, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 12, background: 'rgba(246,241,230,0.14)', border: '1px solid rgba(246,241,230,0.35)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </span>
            <div>
              <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: COLORS.gold, fontWeight: 700 }}>Broadcast</p>
              <h2 style={{ margin: '2px 0 0', fontSize: 18, color: '#fff' }}>Send a notification</h2>
            </div>
          </div>
          <div style={{ padding: '18px 22px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label htmlFor="notif-title" style={notifLabel}>Title <span style={{ color: COLORS.burgundy }}>*</span></label>
                <input id="notif-title" type="text" value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} maxLength={120}
                  placeholder="e.g. New beachfront stays just dropped" disabled={notifSending} style={notifInput} />
              </div>
              <div>
                <label htmlFor="notif-body" style={notifLabel}>Message</label>
                <textarea id="notif-body" value={notifBody} onChange={(e) => setNotifBody(e.target.value)} rows={3} maxLength={500}
                  placeholder="What do you want everyone to know? (optional)" disabled={notifSending} style={{ ...notifInput, resize: 'vertical', minHeight: 72 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
                <div>
                  <label htmlFor="notif-link" style={notifLabel}>Link <span style={{ color: COLORS.muted, fontWeight: 500 }}>(optional)</span></label>
                  <input id="notif-link" type="text" value={notifLink} onChange={(e) => setNotifLink(e.target.value)}
                    placeholder="/explore or https://…" disabled={notifSending} style={notifInput} />
                </div>
                <div>
                  <label htmlFor="notif-audience" style={notifLabel}>Audience</label>
                  <select id="notif-audience" value={notifAudience} onChange={(e) => setNotifAudience(e.target.value as 'all' | 'guests' | 'hosts')}
                    disabled={notifSending} style={{ ...notifInput, appearance: 'auto', cursor: notifSending ? 'default' : 'pointer' }}>
                    <option value="all">All users</option>
                    <option value="guests">Guests</option>
                    <option value="hosts">Hosts</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: COLORS.ink, cursor: notifSending ? 'default' : 'pointer' }}>
                  <input type="checkbox" checked={notifPush} onChange={(e) => setNotifPush(e.target.checked)} disabled={notifSending} style={{ accentColor: COLORS.burgundy, width: 17, height: 17, cursor: notifSending ? 'default' : 'pointer' }} />
                  Send push
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: COLORS.ink, cursor: notifSending ? 'default' : 'pointer' }}>
                  <input type="checkbox" checked={notifEmail} onChange={(e) => setNotifEmail(e.target.checked)} disabled={notifSending} style={{ accentColor: COLORS.burgundy, width: 17, height: 17, cursor: notifSending ? 'default' : 'pointer' }} />
                  Also email
                </label>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
                <button type="button" onClick={sendNotification} disabled={notifSending || !notifTitle.trim()} className="qk-press"
                  style={{ appearance: 'none', border: 'none', fontFamily: FONT, fontWeight: 800, fontSize: 15, color: '#fff', borderRadius: 14, padding: '12px 24px',
                    background: (notifSending || !notifTitle.trim()) ? 'rgba(91,15,22,0.45)' : GRAD_BURGUNDY,
                    boxShadow: (notifSending || !notifTitle.trim()) ? 'none' : '0 12px 28px rgba(91,15,22,0.28)',
                    cursor: (notifSending || !notifTitle.trim()) ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
                  </svg>
                  {notifSending ? 'Firing…' : 'Fire notification'}
                </button>
                {notifResult && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 700, color: '#0f5132', background: 'rgba(15,81,50,0.12)', borderRadius: 999, padding: '7px 14px' }}>
                    <span aria-hidden="true">✓</span>
                    Sent to {notifResult.recipients} recipient{notifResult.recipients === 1 ? '' : 's'}{notifResult.emailed > 0 ? ` · ${notifResult.emailed} emailed` : ''}
                  </span>
                )}
              </div>
            </div>
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
          {/* Device tokens — a read-only count (not a table tab); the full list
              renders in its own section below. */}
          <div style={{
            textAlign: 'left', fontFamily: FONT, background: '#fff', color: COLORS.ink,
            border: `1px solid ${COLORS.tan}`, borderRadius: 18, padding: '14px 16px',
            boxShadow: '0 8px 22px rgba(42,34,32,0.08)',
          }}>
            <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.8 }}>Device tokens</span>
            <span style={{ display: 'block', fontSize: 28, fontWeight: 800, marginTop: 2, color: COLORS.gold }}>{data ? data.counts.deviceTokens ?? 0 : '—'}</span>
          </div>
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

        {/* Device tokens — the saved push (FCM / APNs) registrations. Read-only
            list with copy + delete; no inline editing. */}
        <div className="qk-card" style={{ background: '#fff', borderRadius: 22, border: `1px solid ${COLORS.tan}`, overflow: 'hidden', boxShadow: '0 8px 22px rgba(42,34,32,0.08)', marginTop: 22 }}>
          <div style={{ background: GRAD_BURGUNDY, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 12, background: 'rgba(246,241,230,0.14)', border: '1px solid rgba(246,241,230,0.35)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><path d="M12 18h.01" />
              </svg>
            </span>
            <div>
              <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: COLORS.gold, fontWeight: 700 }}>Push</p>
              <h2 style={{ margin: '2px 0 0', fontSize: 18, color: '#fff' }}>Device tokens ({deviceTokens.length})</h2>
            </div>
          </div>
          {deviceTokens.length === 0 ? (
            <div style={{ padding: '34px 24px', textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 26, background: COLORS.cream, border: `1px solid ${COLORS.tan}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={COLORS.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><path d="M12 18h.01" />
                </svg>
              </div>
              <p style={{ margin: '0 auto', maxWidth: 460, fontSize: 14, lineHeight: 1.55, color: COLORS.muted }}>
                No devices have registered for push yet — they appear here once a user opens the app (with notifications allowed) on a real device.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr>
                    <th style={th}>Owner</th>
                    <th style={th}>Platform</th>
                    <th style={th}>Token</th>
                    <th style={th}>Registered</th>
                    <th style={{ ...th, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deviceTokens.map((dt) => {
                    const id = String(dt.id)
                    return (
                      <tr key={id} className="qk-row" style={{ borderTop: `1px solid ${COLORS.cream}` }}>
                        <td style={td}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
                              <span style={{ fontWeight: 700, color: COLORS.ink }}>{dt.user_email || '—'}</span>
                              {dt.user_name && <span style={{ fontSize: 12, color: COLORS.muted }}>{dt.user_name}</span>}
                            </span>
                            {rolePill(dt.user_role)}
                          </span>
                        </td>
                        <td style={td}>{platformBadge(dt.platform)}</td>
                        <td style={td}><TokenCell value={dt.token} onCopied={(ok) => setToast(ok ? { message: 'Token copied', kind: 'success' } : { message: 'Couldn’t copy to clipboard', kind: 'error' })} /></td>
                        <td style={td}>{formatDate(dt.created_at)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <button
                            onClick={() => setConfirm({ title: 'Delete this device token?', message: 'The device stops receiving push until it re-registers. This cannot be undone.', onConfirm: () => doDelete('device-tokens', id, 'device token') })}
                            disabled={busyId === id}
                            style={{ appearance: 'none', border: `1px solid ${COLORS.burgundy}`, background: busyId === id ? COLORS.tan : '#fff', color: COLORS.burgundy, fontWeight: 700, fontSize: 12.5, fontFamily: FONT, borderRadius: 999, padding: '6px 14px', cursor: busyId === id ? 'default' : 'pointer' }}>
                            {busyId === id ? '…' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Listing moderation: pending listings awaiting approval. Each row
            shows the title, host (name + email), the ownership document thumbnail
            (click to enlarge) + Approve / Reject. */}
        <div className="qk-card" style={{ background: '#fff', borderRadius: 22, border: `1px solid ${COLORS.tan}`, overflow: 'hidden', boxShadow: '0 8px 22px rgba(42,34,32,0.08)', marginTop: 22 }}>
          <div style={{ background: GRAD_BURGUNDY, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 12, background: 'rgba(246,241,230,0.14)', border: '1px solid rgba(246,241,230,0.35)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9.5 12 4l9 5.5" /><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" /><path d="m9 14 2 2 4-4" />
              </svg>
            </span>
            <div>
              <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: COLORS.gold, fontWeight: 700 }}>Moderation</p>
              <h2 style={{ margin: '2px 0 0', fontSize: 18, color: '#fff' }}>{t('admin.pendingListings')} ({pendingListings?.length ?? 0})</h2>
            </div>
          </div>
          {pendingListings && pendingListings.length === 0 ? (
            <div style={{ padding: '34px 24px', textAlign: 'center', color: COLORS.muted, fontSize: 14 }}>
              {t('admin.pendingListingsEmpty')}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr>
                    <th style={th}>{t('approval.ownershipDoc')}</th>
                    <th style={th}>{t('admin.listing')}</th>
                    <th style={th}>{t('admin.host')}</th>
                    <th style={{ ...th, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(pendingListings ?? []).map((l) => {
                    const id = String(l.id)
                    return (
                      <tr key={id} className="qk-row" style={{ borderTop: `1px solid ${COLORS.cream}` }}>
                        <td style={td}>
                          {l.ownership_doc ? (
                            <button type="button" onClick={() => setDocModal(l.ownership_doc)} title={t('admin.viewDoc')}
                              style={{ appearance: 'none', border: `1px solid ${COLORS.tan}`, background: '#fff', padding: 0, borderRadius: 10, cursor: 'pointer', display: 'inline-flex', overflow: 'hidden' }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={l.ownership_doc} alt={t('approval.ownershipDoc')} style={{ width: 64, height: 44, objectFit: 'cover', display: 'block' }} />
                            </button>
                          ) : (
                            <span style={{ color: COLORS.muted }} title={t('admin.noOwnershipDoc')}>—</span>
                          )}
                        </td>
                        <td style={{ ...td, whiteSpace: 'normal', maxWidth: 280 }}>
                          <span style={{ fontWeight: 700, color: COLORS.ink }}>{l.title || '—'}</span>
                          {l.location && <span style={{ display: 'block', marginTop: 3, fontSize: 12.5, color: COLORS.muted }}>{l.location}</span>}
                          <span style={{ display: 'block', marginTop: 3, fontSize: 12.5, color: COLORS.burgundy, fontWeight: 700 }}>{money(l.price_per_night)}/night</span>
                        </td>
                        <td style={td}>
                          <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
                            <span style={{ fontWeight: 700, color: COLORS.ink }}>{l.host_name || '—'}</span>
                            {l.host_email && <span style={{ fontSize: 12, color: COLORS.muted }}>{l.host_email}</span>}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => decideListing(id, 'approve')} disabled={busyId === id} className="qk-press"
                              style={{ appearance: 'none', border: 'none', background: busyId === id ? COLORS.tan : '#0f5132', color: '#fff', fontWeight: 700, fontSize: 12.5, fontFamily: FONT, borderRadius: 999, padding: '6px 14px', cursor: busyId === id ? 'default' : 'pointer' }}>
                              {busyId === id ? '…' : t('admin.approve')}
                            </button>
                            <button type="button" onClick={() => decideListing(id, 'reject')} disabled={busyId === id}
                              style={{ appearance: 'none', border: `1px solid ${COLORS.burgundy}`, background: busyId === id ? COLORS.tan : '#fff', color: COLORS.burgundy, fontWeight: 700, fontSize: 12.5, fontFamily: FONT, borderRadius: 999, padding: '6px 14px', cursor: busyId === id ? 'default' : 'pointer' }}>
                              {busyId === id ? '…' : t('admin.reject')}
                            </button>
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Trust & safety: pending identity verifications. Each row shows the
            submitted ID thumbnail (click to enlarge) + Approve / Reject. */}
        <div className="qk-card" style={{ background: '#fff', borderRadius: 22, border: `1px solid ${COLORS.tan}`, overflow: 'hidden', boxShadow: '0 8px 22px rgba(42,34,32,0.08)', marginTop: 22 }}>
          <div style={{ background: GRAD_BURGUNDY, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 12, background: 'rgba(246,241,230,0.14)', border: '1px solid rgba(246,241,230,0.35)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12l2 2 4-4" /><path d="M12 3a12 12 0 0 0 8 3 12 12 0 0 1-8 15 12 12 0 0 1-8-15 12 12 0 0 0 8-3z" />
              </svg>
            </span>
            <div>
              <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: COLORS.gold, fontWeight: 700 }}>Trust &amp; safety</p>
              <h2 style={{ margin: '2px 0 0', fontSize: 18, color: '#fff' }}>{t('admin.verifications')} ({verifications?.length ?? 0})</h2>
            </div>
          </div>
          {verifications && verifications.length === 0 ? (
            <div style={{ padding: '34px 24px', textAlign: 'center', color: COLORS.muted, fontSize: 14 }}>
              {t('admin.verificationsEmpty')}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr>
                    <th style={th}>ID</th>
                    <th style={th}>Name</th>
                    <th style={th}>Email</th>
                    <th style={th}>Role</th>
                    <th style={{ ...th, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(verifications ?? []).map((v) => {
                    const id = String(v.id)
                    return (
                      <tr key={id} className="qk-row" style={{ borderTop: `1px solid ${COLORS.cream}` }}>
                        <td style={td}>
                          {v.verification_doc ? (
                            <button type="button" onClick={() => setDocModal(v.verification_doc)} title={t('admin.viewDoc')}
                              style={{ appearance: 'none', border: `1px solid ${COLORS.tan}`, background: '#fff', padding: 0, borderRadius: 10, cursor: 'pointer', display: 'inline-flex', overflow: 'hidden' }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={v.verification_doc} alt="ID" style={{ width: 64, height: 44, objectFit: 'cover', display: 'block' }} />
                            </button>
                          ) : (
                            <span style={{ color: COLORS.muted }}>—</span>
                          )}
                        </td>
                        <td style={td}><span style={{ fontWeight: 700, color: COLORS.ink }}>{v.full_name || '—'}</span></td>
                        <td style={td}>{v.email || '—'}</td>
                        <td style={td}>{rolePill(v.role)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => decideVerification(id, 'approve')} disabled={busyId === id} className="qk-press"
                              style={{ appearance: 'none', border: 'none', background: busyId === id ? COLORS.tan : '#0f5132', color: '#fff', fontWeight: 700, fontSize: 12.5, fontFamily: FONT, borderRadius: 999, padding: '6px 14px', cursor: busyId === id ? 'default' : 'pointer' }}>
                              {busyId === id ? '…' : t('admin.approve')}
                            </button>
                            <button type="button" onClick={() => decideVerification(id, 'reject')} disabled={busyId === id}
                              style={{ appearance: 'none', border: `1px solid ${COLORS.burgundy}`, background: busyId === id ? COLORS.tan : '#fff', color: COLORS.burgundy, fontWeight: 700, fontSize: 12.5, fontFamily: FONT, borderRadius: 999, padding: '6px 14px', cursor: busyId === id ? 'default' : 'pointer' }}>
                              {busyId === id ? '…' : t('admin.reject')}
                            </button>
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Trust & safety: open reports. Each row shows reason / details /
            reporter + target, with Resolve / Dismiss. */}
        <div className="qk-card" style={{ background: '#fff', borderRadius: 22, border: `1px solid ${COLORS.tan}`, overflow: 'hidden', boxShadow: '0 8px 22px rgba(42,34,32,0.08)', marginTop: 22 }}>
          <div style={{ background: GRAD_BURGUNDY, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 12, background: 'rgba(246,241,230,0.14)', border: '1px solid rgba(246,241,230,0.35)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
              </svg>
            </span>
            <div>
              <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: COLORS.gold, fontWeight: 700 }}>Trust &amp; safety</p>
              <h2 style={{ margin: '2px 0 0', fontSize: 18, color: '#fff' }}>{t('admin.reports')} ({reports?.length ?? 0})</h2>
            </div>
          </div>
          {reports && reports.length === 0 ? (
            <div style={{ padding: '34px 24px', textAlign: 'center', color: COLORS.muted, fontSize: 14 }}>
              {t('admin.reportsEmpty')}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr>
                    <th style={th}>{t('admin.reason')}</th>
                    <th style={th}>{t('admin.target')}</th>
                    <th style={th}>{t('admin.reporter')}</th>
                    <th style={th}>Date</th>
                    <th style={{ ...th, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(reports ?? []).map((r) => {
                    const id = String(r.id)
                    return (
                      <tr key={id} className="qk-row" style={{ borderTop: `1px solid ${COLORS.cream}` }}>
                        <td style={{ ...td, whiteSpace: 'normal', maxWidth: 340 }}>
                          <span style={{ fontWeight: 700, color: COLORS.ink }}>{r.reason || '—'}</span>
                          {r.details && <span style={{ display: 'block', marginTop: 3, fontSize: 12.5, color: COLORS.muted, lineHeight: 1.45 }}>{r.details}</span>}
                        </td>
                        <td style={td}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ background: COLORS.tan, color: COLORS.burgundy, fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, textTransform: 'capitalize' }}>{r.target_type}</span>
                            <code style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: COLORS.muted }}>{String(r.target_id).slice(0, 8)}</code>
                          </span>
                        </td>
                        <td style={td}>{r.reporter_name || '—'}</td>
                        <td style={td}>{formatDate(r.created_at)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => decideReport(id, 'resolve')} disabled={busyId === id} className="qk-press"
                              style={{ appearance: 'none', border: 'none', background: busyId === id ? COLORS.tan : '#0f5132', color: '#fff', fontWeight: 700, fontSize: 12.5, fontFamily: FONT, borderRadius: 999, padding: '6px 14px', cursor: busyId === id ? 'default' : 'pointer' }}>
                              {busyId === id ? '…' : t('admin.resolve')}
                            </button>
                            <button type="button" onClick={() => decideReport(id, 'dismiss')} disabled={busyId === id}
                              style={{ appearance: 'none', border: `1px solid ${COLORS.burgundy}`, background: busyId === id ? COLORS.tan : '#fff', color: COLORS.burgundy, fontWeight: 700, fontSize: 12.5, fontFamily: FONT, borderRadius: 999, padding: '6px 14px', cursor: busyId === id ? 'default' : 'pointer' }}>
                              {busyId === id ? '…' : t('admin.dismiss')}
                            </button>
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ID document viewer — opened from a verification thumbnail. */}
      {docModal && (
        <div role="dialog" aria-modal="true" onClick={() => setDocModal(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(20,12,10,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', maxWidth: '90vw', maxHeight: '85vh' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={docModal} alt={t('admin.viewDoc')} style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.5)', display: 'block' }} />
            <button type="button" onClick={() => setDocModal(null)} aria-label="Close" className="qk-press"
              style={{ position: 'absolute', top: 10, right: 10, appearance: 'none', border: 'none', background: 'rgba(20,12,10,0.6)', color: '#fff', fontWeight: 700, fontSize: 18, lineHeight: 1, borderRadius: 999, width: 36, height: 36, cursor: 'pointer' }}>×</button>
          </div>
        </div>
      )}

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
const notifLabel: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: COLORS.muted, marginBottom: 6 }
const notifInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: `1px solid ${COLORS.tan}`, background: COLORS.cream, color: COLORS.ink, fontSize: 14.5, fontFamily: FONT, borderRadius: 14, padding: '11px 14px', outline: 'none' }
