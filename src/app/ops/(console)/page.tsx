'use client'

// QuickIn — operations console (local-stack admin).
// Runs a full admin dashboard against the real (Neon) data — overview stats, users,
// listings (with publish/hide/delete), bookings, host applications and ID
// verifications.
//
// Access control (A1/A4): the (console)/layout.tsx server gate has already proven a
// valid staff session before this renders, and every request below rides the httpOnly
// qk_staff cookie. The tab strip is filtered to the modules this operator holds, and
// the matching API route re-checks the same permission — so hiding a tab is a
// convenience, not the boundary.
//
// This replaced a shared admin key typed into a prompt and kept in
// localStorage['qk_ops_key'], which gave anyone holding the string full delete rights
// with no attribution.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOpsSession, OpsHeader } from './ops-session'

// Boutique palette.
const BURGUNDY = '#5B0F16'
const CREAM = '#F6F1E6'
const TAN = '#EFE6D8'
const INK = '#2A2220'
const MUTED = '#6B6055'
const GREEN = '#2E7D5B'

// Shown when the API returns 403 — the tab was visible but the permission was
// revoked mid-session, so the server (correctly) refused.
const NO_ACCESS = 'Your access to this section has been removed.'

// Each TabId is also a STAFF_MODULES key, so a tab maps 1:1 to the permission that
// guards its API route — no lookup table needed.
type TabId = 'overview' | 'users' | 'listings' | 'bookings' | 'applications' | 'verifications'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'listings', label: 'Listings' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'applications', label: 'Applications' },
  { id: 'verifications', label: 'Verifications' },
]

type AdminStats = {
  users: number
  hosts: number
  verified: number
  listings: number
  published: number
  bookings: number
  pending_bookings: number
  confirmed_bookings: number
  paid_bookings: number
  pending_applications: number
  pending_verifications: number
  gross_paid: number
}

type AdminUser = {
  id: string
  email: string
  full_name: string | null
  is_host: boolean
  verification_status: string
  email_verified: boolean
  created_at: string
  listing_count: number
  booking_count: number
}

type AdminListing = {
  id: string
  title: string
  location: string | null
  currency: string
  price_per_night: number
  is_published: boolean
  host_id: string | null
  host_name: string | null
  created_at: string
  booking_count: number
  image: string | null
}

type AdminBooking = {
  id: string
  reservation_code: string
  status: string
  payment_status: string
  total_price: number
  currency: string
  check_in: string
  check_out: string
  guest_name: string | null
  guest_email: string | null
  listing_title: string | null
  created_at: string
}

type HostApplication = {
  id: string
  user_id?: string | null
  email?: string | null
  full_name?: string | null
  national_id?: string | null
  phone?: string | null
  address?: string | null
  company?: string | null
  notes?: string | null
  status?: string | null
  submitted_at?: string | null
}

type Verification = {
  id: string
  user_id?: string | null
  email?: string | null
  full_name?: string | null
  id_number?: string | null
  status?: string | null
  image_data?: string | null
  back_image_data?: string | null
  selfie_image_data?: string | null
  submitted_at?: string | null
}

function fmtDate(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString()
}

function fmtDay(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString()
}

function fmtMoney(value: number, currency: string): string {
  const n = Number(value) || 0
  const formatted = n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return `${currency || 'USD'} ${formatted}`
}

export default function OpsPage() {
  const { can, signOut } = useOpsSession()

  // A4 (hide): only the modules this operator holds. The server enforces the same
  // thing on every request, so this is presentation.
  const visibleTabs = useMemo(() => TABS.filter((t) => can(t.id)), [can])
  const [tab, setTab] = useState<TabId>(() => visibleTabs[0]?.id ?? 'overview')

  // If permissions changed under us (the super admin edited them mid-session), the
  // current tab may no longer be allowed — fall back to the first one that is.
  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0].id)
    }
  }, [visibleTabs, tab])

  // Per-section data.
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [listings, setListings] = useState<AdminListing[]>([])
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [apps, setApps] = useState<HostApplication[]>([])
  const [verifs, setVerifs] = useState<Verification[]>([])

  // Per-section loading / error.
  const [loading, setLoading] = useState<Record<TabId, boolean>>({
    overview: false,
    users: false,
    listings: false,
    bookings: false,
    applications: false,
    verifications: false,
  })
  const [errors, setErrors] = useState<Record<TabId, string | null>>({
    overview: null,
    users: null,
    listings: null,
    bookings: null,
    applications: null,
    verifications: null,
  })
  const [loaded, setLoaded] = useState<Record<TabId, boolean>>({
    overview: false,
    users: false,
    listings: false,
    bookings: false,
    applications: false,
    verifications: false,
  })

  const [busyId, setBusyId] = useState<string | null>(null)

  // App download links (admin-editable; surfaced by the web "download the app" bar).
  const [appIos, setAppIos] = useState('')
  const [appAndroid, setAppAndroid] = useState('')
  const [linksLoaded, setLinksLoaded] = useState(false)
  const [savingLinks, setSavingLinks] = useState(false)
  const [linksMsg, setLinksMsg] = useState<string | null>(null)

  const setSectionLoading = (id: TabId, v: boolean) =>
    setLoading((prev) => ({ ...prev, [id]: v }))
  const setSectionError = (id: TabId, v: string | null) =>
    setErrors((prev) => ({ ...prev, [id]: v }))

  /** A 401 means the session died (expired, idle, revoked, or the account was
   *  deactivated) — leave the console rather than showing a half-broken screen. */
  const sessionEnded = useCallback(() => {
    window.location.href = '/ops/login?reason=expired'
  }, [])

  // Generic GET against an admin endpoint. Auth is the httpOnly qk_staff cookie, so
  // there is no secret for this page to hold, store, or leak.
  const adminGet = useCallback(
    async <T,>(path: string): Promise<T | 'forbidden' | null> => {
      try {
        const res = await fetch(`/api/local/admin/${path}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        if (res.status === 401) {
          sessionEnded()
          return null
        }
        if (res.status === 403) return 'forbidden'
        if (!res.ok) return null
        return (await res.json()) as T
      } catch {
        return null
      }
    },
    [sessionEnded],
  )

  const loadSection = useCallback(
    async (id: TabId) => {
      setSectionLoading(id, true)
      setSectionError(id, null)
      try {
        if (id === 'overview') {
          const json = await adminGet<{ stats?: AdminStats }>('stats')
          if (json === 'forbidden') return setSectionError(id, NO_ACCESS)
          if (!json || !json.stats) {
            setSectionError(id, 'Could not load stats. Please retry.')
            return
          }
          setStats(json.stats)
        } else if (id === 'users') {
          const json = await adminGet<{ users?: AdminUser[] }>('users')
          if (json === 'forbidden') return setSectionError(id, NO_ACCESS)
          if (!json) {
            setSectionError(id, 'Could not load users. Please retry.')
            return
          }
          setUsers(Array.isArray(json.users) ? json.users : [])
        } else if (id === 'listings') {
          const json = await adminGet<{ listings?: AdminListing[] }>('listings')
          if (json === 'forbidden') return setSectionError(id, NO_ACCESS)
          if (!json) {
            setSectionError(id, 'Could not load listings. Please retry.')
            return
          }
          setListings(Array.isArray(json.listings) ? json.listings : [])
        } else if (id === 'bookings') {
          const json = await adminGet<{ bookings?: AdminBooking[] }>('bookings')
          if (json === 'forbidden') return setSectionError(id, NO_ACCESS)
          if (!json) {
            setSectionError(id, 'Could not load bookings. Please retry.')
            return
          }
          setBookings(Array.isArray(json.bookings) ? json.bookings : [])
        } else if (id === 'applications') {
          const json = await adminGet<{ applications?: HostApplication[] }>('host-applications')
          if (json === 'forbidden') return setSectionError(id, NO_ACCESS)
          if (!json) {
            setSectionError(id, 'Could not load applications. Please retry.')
            return
          }
          setApps(Array.isArray(json.applications) ? json.applications : [])
        } else if (id === 'verifications') {
          const json = await adminGet<{ verifications?: Verification[] }>('verifications')
          if (json === 'forbidden') return setSectionError(id, NO_ACCESS)
          if (!json) {
            setSectionError(id, 'Could not load verifications. Please retry.')
            return
          }
          setVerifs(Array.isArray(json.verifications) ? json.verifications : [])
        }
        setLoaded((prev) => ({ ...prev, [id]: true }))
      } finally {
        setSectionLoading(id, false)
      }
    },
    [adminGet],
  )

  // Lazy-fetch the active tab on first open.
  useEffect(() => {
    if (!loaded[tab] && !loading[tab]) void loadSection(tab)
  }, [tab, loaded, loading, loadSection])


  // Load the app download links once. They sit on the console shell above the tabs,
  // so they follow the 'overview' module rather than having a tab of their own.
  useEffect(() => {
    if (linksLoaded || !can('overview')) return
    let cancelled = false
    void (async () => {
      const json = await adminGet<{ ios?: string | null; android?: string | null }>('app-links')
      if (cancelled || !json || json === 'forbidden') return
      setAppIos(json.ios ?? '')
      setAppAndroid(json.android ?? '')
      setLinksLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [linksLoaded, adminGet, can])

  const refresh = () => {
    void loadSection(tab)
  }

  // POST to an admin endpoint (cookie-authenticated). Returns true on success.
  const post = async (path: string, body: Record<string, unknown>): Promise<boolean> => {
    try {
      const res = await fetch(`/api/local/admin/${path}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 401) {
        sessionEnded()
        return false
      }
      if (res.status === 403) {
        // The module was revoked mid-session; surface it rather than failing silently.
        setSectionError(tab, NO_ACCESS)
        return false
      }
      return res.ok
    } catch {
      return false
    }
  }

  const saveLinks = async () => {
    setSavingLinks(true)
    setLinksMsg(null)
    const ok = await post('app-links', { ios: appIos.trim(), android: appAndroid.trim() })
    setSavingLinks(false)
    setLinksMsg(ok ? 'Saved — the phone download bar updates on the next page load.' : 'Could not save. Please retry.')
  }

  // ---- users actions ----
  const activateUser = async (u: AdminUser) => {
    setBusyId(u.id)
    const ok = await post('users', { id: u.id, action: 'activate' })
    setBusyId(null)
    if (ok) {
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, email_verified: true } : x)),
      )
    } else {
      setSectionError('users', 'Could not activate the user. Please retry.')
    }
  }

  const deleteUser = async (u: AdminUser) => {
    if (!window.confirm(`Permanently delete ${u.email}? This removes their account, listings and bookings and cannot be undone.`)) return
    setBusyId(u.id)
    const ok = await post('users', { id: u.id, action: 'delete' })
    setBusyId(null)
    if (ok) {
      setUsers((prev) => prev.filter((x) => x.id !== u.id))
    } else {
      setSectionError('users', 'Could not delete the user. Please retry.')
    }
  }

  // ---- listings actions ----
  const togglePublish = async (l: AdminListing) => {
    setBusyId(l.id)
    const action = l.is_published ? 'unpublish' : 'publish'
    const ok = await post('listings', { id: l.id, action })
    setBusyId(null)
    if (ok) {
      setListings((prev) =>
        prev.map((x) => (x.id === l.id ? { ...x, is_published: !l.is_published } : x)),
      )
    } else {
      setSectionError('listings', 'Could not update the listing. Please retry.')
    }
  }

  const deleteListing = async (l: AdminListing) => {
    if (!window.confirm(`Delete listing "${l.title}"? This cannot be undone.`)) return
    setBusyId(l.id)
    const ok = await post('listings', { id: l.id, action: 'delete' })
    setBusyId(null)
    if (ok) {
      setListings((prev) => prev.filter((x) => x.id !== l.id))
    } else {
      setSectionError('listings', 'Could not delete the listing. Please retry.')
    }
  }

  // ---- applications / verifications actions ----
  const decideApp = async (id: string, action: 'approve' | 'reject') => {
    let note: string | null = null
    if (action === 'reject') {
      note = window.prompt('Optional note for the applicant (why declined):') ?? null
    }
    setBusyId(id)
    const ok = await post('host-applications', { id, action, note })
    setBusyId(null)
    if (ok) setApps((prev) => prev.filter((a) => a.id !== id))
  }

  const decideVerif = async (id: string, action: 'verify' | 'reject') => {
    let note: string | null = null
    if (action === 'reject') {
      note = window.prompt('Optional note (why rejected):') ?? null
    }
    setBusyId(id)
    const ok = await post('verifications', { id, action, note })
    setBusyId(null)
    if (ok) setVerifs((prev) => prev.filter((v) => v.id !== id))
  }

  // ---- styles ----
  const pageStyle: React.CSSProperties = {
    background: CREAM,
    minHeight: '100vh',
    color: INK,
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  }
  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: `1px solid ${TAN}`,
    borderRadius: 18,
    padding: 18,
    boxShadow: '0 1px 3px rgba(42,34,32,0.06)',
  }
  const btnBase: React.CSSProperties = {
    border: 'none',
    borderRadius: 12,
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  }
  const approveBtn: React.CSSProperties = { ...btnBase, background: GREEN, color: '#fff' }
  const outlineBtn: React.CSSProperties = {
    ...btnBase,
    background: 'transparent',
    color: BURGUNDY,
    border: `1px solid ${BURGUNDY}`,
  }
  const dangerBtn: React.CSSProperties = {
    ...btnBase,
    background: 'transparent',
    color: BURGUNDY,
    border: `1px solid ${BURGUNDY}`,
  }
  const labelStyle: React.CSSProperties = { fontSize: 12, color: MUTED, marginBottom: 2 }
  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    fontSize: 12,
    color: MUTED,
    fontWeight: 600,
    padding: '8px 12px',
    borderBottom: `1px solid ${TAN}`,
    whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = {
    fontSize: 13,
    padding: '10px 12px',
    borderBottom: `1px solid ${TAN}`,
    verticalAlign: 'middle',
  }

  const badge = (text: string, bg: string, color: string): React.ReactNode => (
    <span
      style={{
        display: 'inline-block',
        background: bg,
        color,
        borderRadius: 999,
        padding: '2px 10px',
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )

  const verificationBadge = (status: string): React.ReactNode => {
    const s = (status || 'none').toLowerCase()
    if (s === 'verified' || s === 'approved') return badge('Verified', '#E2F0E9', GREEN)
    if (s === 'pending') return badge('Pending', '#FBF1DD', '#8A6D1F')
    return badge('None', TAN, MUTED)
  }

  const statusBadge = (status: string): React.ReactNode => {
    const s = (status || '').toLowerCase()
    if (s === 'confirmed') return badge('Confirmed', '#E2F0E9', GREEN)
    if (s === 'pending') return badge('Pending', '#FBF1DD', '#8A6D1F')
    if (s === 'cancelled' || s === 'canceled') return badge('Cancelled', TAN, MUTED)
    if (s === 'rejected' || s === 'declined') return badge('Rejected', '#F6E0E2', BURGUNDY)
    return badge(status || '—', TAN, MUTED)
  }

  // A moderator with no modules at all can sign in but has nothing to show.
  if (visibleTabs.length === 0) {
    return (
      <main style={pageStyle}>
        <OpsHeader title="Operations" />
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 20px' }}>
          <div style={{ ...cardStyle, textAlign: 'center', padding: '44px 24px' }}>
            <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: INK }}>
              No modules assigned
            </p>
            <p style={{ margin: 0, fontSize: 14, color: MUTED }}>
              Your account has no sections enabled yet. Ask a super admin to grant access.
            </p>
          </div>
        </div>
      </main>
    )
  }

  const sectionLoading = loading[tab]
  const sectionError = errors[tab]

  // ---- dashboard ----
  return (
    <main style={pageStyle}>
      <OpsHeader title="Operations" />
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 20px 64px' }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div>
            <h1 style={{ color: BURGUNDY, fontSize: 26, fontWeight: 700, margin: 0 }}>
              QuickIn — operations
            </h1>
            <p style={{ color: MUTED, fontSize: 13, margin: '4px 0 0' }}>
              This console reads and writes <strong>live data</strong>. Actions take effect
              immediately.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={refresh} style={outlineBtn} disabled={sectionLoading}>
              {sectionLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </header>

        {can('overview') && (
          {/* App download links — surfaced by the mobile "download the app" bar. */}
          <section style={{ ...cardStyle, marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: BURGUNDY }}>App download links</h2>
            <p style={{ margin: '4px 0 14px', fontSize: 13, color: MUTED }}>
              Shown on phones as a “Get the app” bar. Leave a field empty to show “coming soon” for that platform.
            </p>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={labelStyle}>Google Play (Android) URL</label>
                <input
                  value={appAndroid}
                  onChange={(e) => setAppAndroid(e.target.value)}
                  placeholder="https://play.google.com/store/apps/details?id=…"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>App Store (iOS) URL</label>
                <input
                  value={appIos}
                  onChange={(e) => setAppIos(e.target.value)}
                  placeholder="https://apps.apple.com/app/… (leave empty until iOS is live)"
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={saveLinks} disabled={savingLinks} style={approveBtn}>
                {savingLinks ? 'Saving…' : 'Save links'}
              </button>
              {linksMsg ? <span style={{ fontSize: 13, color: MUTED }}>{linksMsg}</span> : null}
            </div>
          </section>
        )}

        {/* Tabs — only the modules this operator holds (A4). */}
        <nav
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            borderBottom: `1px solid ${TAN}`,
            paddingBottom: 12,
            marginBottom: 24,
          }}
        >
          {visibleTabs.map((t) => {
            const active = t.id === tab
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  ...btnBase,
                  background: active ? BURGUNDY : 'transparent',
                  color: active ? '#fff' : INK,
                  border: active ? `1px solid ${BURGUNDY}` : `1px solid ${TAN}`,
                }}
              >
                {t.label}
              </button>
            )
          })}
        </nav>

        {sectionError ? (
          <p
            style={{
              color: BURGUNDY,
              background: TAN,
              border: `1px solid ${BURGUNDY}`,
              borderRadius: 12,
              padding: '8px 14px',
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {sectionError}
          </p>
        ) : null}

        {sectionLoading && !loaded[tab] ? (
          <p style={{ color: MUTED, fontSize: 14, marginTop: 8 }}>Loading live data…</p>
        ) : null}

        {/* ===================== OVERVIEW ===================== */}
        {tab === 'overview' && loaded.overview ? (
          stats ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: 14,
              }}
            >
              {[
                { label: 'Users', value: stats.users },
                { label: 'Hosts', value: stats.hosts },
                { label: 'Verified', value: stats.verified },
                { label: 'Listings', value: stats.listings },
                { label: 'Published', value: stats.published },
                { label: 'Bookings', value: stats.bookings },
                { label: 'Pending bookings', value: stats.pending_bookings },
                { label: 'Paid', value: stats.paid_bookings },
                {
                  label: 'Gross paid',
                  value: (Number(stats.gross_paid) || 0).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  }),
                },
                { label: 'Pending applications', value: stats.pending_applications },
                { label: 'Pending IDs', value: stats.pending_verifications },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    background: TAN,
                    border: `1px solid ${TAN}`,
                    borderRadius: 18,
                    padding: '18px 18px 16px',
                    boxShadow: '0 1px 3px rgba(42,34,32,0.06)',
                  }}
                >
                  <div style={{ fontSize: 30, fontWeight: 800, color: BURGUNDY, lineHeight: 1.1 }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 6, fontWeight: 600 }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: MUTED, fontSize: 14 }}>No stats available.</p>
          )
        ) : null}

        {/* ===================== USERS ===================== */}
        {tab === 'users' && loaded.users ? (
          users.length === 0 ? (
            <p style={{ color: MUTED, fontSize: 14 }}>No users.</p>
          ) : (
            <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Role</th>
                    <th style={thStyle}>Email status</th>
                    <th style={thStyle}>Verification</th>
                    <th style={thStyle}>Listings</th>
                    <th style={thStyle}>Bookings</th>
                    <th style={thStyle}>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{u.full_name || '—'}</td>
                      <td style={tdStyle}>{u.email}</td>
                      <td style={tdStyle}>
                        {u.is_host
                          ? badge('Host', BURGUNDY, '#fff')
                          : badge('Guest', TAN, MUTED)}
                      </td>
                      <td style={tdStyle}>
                        <div
                          style={{
                            display: 'flex',
                            gap: 10,
                            alignItems: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          {u.email_verified
                            ? badge('Verified', '#E2F0E9', GREEN)
                            : badge('Unverified', '#FBF1DD', '#8A6D1F')}
                          {!u.email_verified ? (
                            <button
                              style={approveBtn}
                              disabled={busyId === u.id}
                              onClick={() => activateUser(u)}
                            >
                              {busyId === u.id ? 'Working…' : 'Activate'}
                            </button>
                          ) : null}
                          <button
                            style={dangerBtn}
                            disabled={busyId === u.id}
                            onClick={() => deleteUser(u)}
                          >
                            {busyId === u.id ? 'Working…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                      <td style={tdStyle}>{verificationBadge(u.verification_status)}</td>
                      <td style={tdStyle}>{u.listing_count}</td>
                      <td style={tdStyle}>{u.booking_count}</td>
                      <td style={{ ...tdStyle, color: MUTED, whiteSpace: 'nowrap' }}>
                        {fmtDay(u.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {/* ===================== LISTINGS ===================== */}
        {tab === 'listings' && loaded.listings ? (
          listings.length === 0 ? (
            <p style={{ color: MUTED, fontSize: 14 }}>No listings.</p>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {listings.map((l) => (
                <div
                  key={l.id}
                  style={{
                    ...cardStyle,
                    display: 'flex',
                    gap: 16,
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                  }}
                >
                  {l.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.image}
                      alt={l.title}
                      style={{
                        width: 120,
                        height: 90,
                        objectFit: 'cover',
                        borderRadius: 12,
                        border: `1px solid ${TAN}`,
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 120,
                        height: 90,
                        borderRadius: 12,
                        background: TAN,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: MUTED,
                        fontSize: 11,
                      }}
                    >
                      No image
                    </div>
                  )}
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ fontSize: 16, fontWeight: 700, color: INK }}>{l.title}</span>
                      {l.is_published
                        ? badge('Published', '#E2F0E9', GREEN)
                        : badge('Hidden', TAN, MUTED)}
                    </div>
                    <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
                      {l.host_name ? `Host: ${l.host_name}` : 'Host: —'}
                      {l.location ? ` · ${l.location}` : ''}
                    </div>
                    <div style={{ fontSize: 14, marginTop: 6, color: INK }}>
                      {fmtMoney(l.price_per_night, l.currency)}{' '}
                      <span style={{ color: MUTED, fontSize: 12 }}>/ night</span>
                      <span style={{ color: MUTED, fontSize: 12 }}>
                        {' '}
                        · {l.booking_count} booking{l.booking_count === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      flexShrink: 0,
                      alignItems: 'center',
                    }}
                  >
                    <button
                      style={outlineBtn}
                      disabled={busyId === l.id}
                      onClick={() => togglePublish(l)}
                    >
                      {busyId === l.id ? 'Working…' : l.is_published ? 'Hide' : 'Show'}
                    </button>
                    <button
                      style={dangerBtn}
                      disabled={busyId === l.id}
                      onClick={() => deleteListing(l)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}

        {/* ===================== BOOKINGS ===================== */}
        {tab === 'bookings' && loaded.bookings ? (
          bookings.length === 0 ? (
            <p style={{ color: MUTED, fontSize: 14 }}>No bookings.</p>
          ) : (
            <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Code</th>
                    <th style={thStyle}>Guest</th>
                    <th style={thStyle}>Listing</th>
                    <th style={thStyle}>Dates</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Payment</th>
                    <th style={thStyle}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id}>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {b.reservation_code}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{b.guest_name || '—'}</div>
                        {b.guest_email ? (
                          <div style={{ color: MUTED, fontSize: 12 }}>{b.guest_email}</div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>{b.listing_title || '—'}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: MUTED }}>
                        {fmtDay(b.check_in)} → {fmtDay(b.check_out)}
                      </td>
                      <td style={tdStyle}>{statusBadge(b.status)}</td>
                      <td style={tdStyle}>
                        {(b.payment_status || '').toLowerCase() === 'paid'
                          ? badge('Paid', '#E2F0E9', GREEN)
                          : badge('Unpaid', TAN, MUTED)}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {fmtMoney(b.total_price, b.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {/* ===================== HOST APPLICATIONS ===================== */}
        {tab === 'applications' && loaded.applications ? (
          apps.length === 0 ? (
            <p style={{ color: MUTED, fontSize: 14 }}>No pending applications.</p>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {apps.map((a) => (
                <div key={a.id} style={cardStyle}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>
                      {a.full_name || a.email || 'Applicant'}
                    </div>
                    <div style={{ fontSize: 12, color: MUTED }}>{fmtDate(a.submitted_at)}</div>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '10px 18px',
                      margin: '14px 0',
                    }}
                  >
                    {a.email ? (
                      <div>
                        <div style={labelStyle}>Email</div>
                        <div style={{ fontSize: 14 }}>{a.email}</div>
                      </div>
                    ) : null}
                    {a.national_id ? (
                      <div>
                        <div style={labelStyle}>National ID</div>
                        <div style={{ fontSize: 14 }}>{a.national_id}</div>
                      </div>
                    ) : null}
                    {a.phone ? (
                      <div>
                        <div style={labelStyle}>Phone</div>
                        <div style={{ fontSize: 14 }}>{a.phone}</div>
                      </div>
                    ) : null}
                    {a.company ? (
                      <div>
                        <div style={labelStyle}>Company</div>
                        <div style={{ fontSize: 14 }}>{a.company}</div>
                      </div>
                    ) : null}
                    {a.address ? (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={labelStyle}>Address</div>
                        <div style={{ fontSize: 14 }}>{a.address}</div>
                      </div>
                    ) : null}
                    {a.notes ? (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={labelStyle}>Notes</div>
                        <div style={{ fontSize: 14 }}>{a.notes}</div>
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      style={approveBtn}
                      disabled={busyId === a.id}
                      onClick={() => decideApp(a.id, 'approve')}
                    >
                      {busyId === a.id ? 'Working…' : 'Approve'}
                    </button>
                    <button
                      style={outlineBtn}
                      disabled={busyId === a.id}
                      onClick={() => decideApp(a.id, 'reject')}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}

        {/* ===================== ID VERIFICATIONS ===================== */}
        {tab === 'verifications' && loaded.verifications ? (
          verifs.length === 0 ? (
            <p style={{ color: MUTED, fontSize: 14 }}>No pending verifications.</p>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {verifs.map((v) => (
                <div key={v.id} style={cardStyle}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>
                      {v.full_name || v.email || 'Applicant'}
                    </div>
                    <div style={{ fontSize: 12, color: MUTED }}>{fmtDate(v.submitted_at)}</div>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '10px 18px',
                      margin: '14px 0',
                    }}
                  >
                    {v.email ? (
                      <div>
                        <div style={labelStyle}>Email</div>
                        <div style={{ fontSize: 14 }}>{v.email}</div>
                      </div>
                    ) : null}
                    {v.id_number ? (
                      <div>
                        <div style={labelStyle}>ID number</div>
                        <div style={{ fontSize: 14 }}>{v.id_number}</div>
                      </div>
                    ) : null}
                  </div>
                  {v.image_data || v.back_image_data || v.selfie_image_data ? (
                    <div
                      style={{
                        display: 'flex',
                        gap: 12,
                        flexWrap: 'wrap',
                        marginBottom: 14,
                      }}
                    >
                      {v.image_data ? (
                        <div>
                          <div style={labelStyle}>Front</div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={v.image_data}
                            alt="ID front"
                            style={{
                              maxHeight: 160,
                              maxWidth: '100%',
                              borderRadius: 12,
                              border: `1px solid ${TAN}`,
                              display: 'block',
                            }}
                          />
                        </div>
                      ) : null}
                      {v.back_image_data ? (
                        <div>
                          <div style={labelStyle}>Back</div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={v.back_image_data}
                            alt="ID back"
                            style={{
                              maxHeight: 160,
                              maxWidth: '100%',
                              borderRadius: 12,
                              border: `1px solid ${TAN}`,
                              display: 'block',
                            }}
                          />
                        </div>
                      ) : null}
                      {v.selfie_image_data ? (
                        <div>
                          <div style={labelStyle}>Selfie</div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={v.selfie_image_data}
                            alt="Personal photo"
                            style={{
                              maxHeight: 160,
                              maxWidth: '100%',
                              borderRadius: 12,
                              border: `1px solid ${TAN}`,
                              display: 'block',
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      style={approveBtn}
                      disabled={busyId === v.id}
                      onClick={() => decideVerif(v.id, 'verify')}
                    >
                      {busyId === v.id ? 'Working…' : 'Verify'}
                    </button>
                    <button
                      style={outlineBtn}
                      disabled={busyId === v.id}
                      onClick={() => decideVerif(v.id, 'reject')}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>
    </main>
  )
}
