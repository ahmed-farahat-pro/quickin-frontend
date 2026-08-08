'use client'

// QuickIn — operations console (local-stack admin).
// Runs a full admin dashboard against the real (Neon) data — overview stats,
// listings (with publish/hide/delete), bookings, host applications and ID
// verifications.
//
// ONE COMPONENT, FIVE ROUTES. These five sections used to be client-side tabs on
// /ops, which meant none of them had a URL: an operator could not link a colleague
// to the verification queue, could not bookmark it, and the back button took them
// out of the console entirely. Each is now a real route (/ops/listings, /ops/bookings,
// …) rendering this component with a fixed `section`, so the sidebar can link
// straight to it. The sections still share one component because they share the
// resort-review modal, the document viewer and a dozen action handlers.
//
// Access control (A1/A4): the (console)/layout.tsx server gate has already proven a
// valid staff session before this renders, and every request below rides the httpOnly
// qk_staff cookie. The sidebar shows only the modules this operator holds, and the
// matching API route re-checks the same permission — so hiding a link is a
// convenience, not the boundary. Reaching a section's URL without its module gets a
// no-access card here and a 403 from the API.
//
// This replaced a shared admin key typed into a prompt and kept in
// localStorage['qk_ops_key'], which gave anyone holding the string full delete rights
// with no attribution.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useOpsSession } from './ops-session'
import { useLivePoll, agoLabel } from './use-live-stats'
import { adminGetQuiet, money } from './ops-ui'
import { OverviewMetrics } from './overview-trend'
import { OpsSectionSkeleton } from './ops-skeleton'
import { alertsFor, alertTotal, waitingLabel } from '@/lib/local/activity-core'
import type { StaffModule } from '@/lib/local/staff'

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

// Each SectionId is also a STAFF_MODULES key, so a section maps 1:1 to the
// permission that guards its API route — no lookup table needed.
export type SectionId = 'overview' | 'listings' | 'bookings' | 'applications' | 'verifications'

/** Heading shown above each section, and the wording of its no-access card. */
const SECTION_TITLES: Record<SectionId, string> = {
  overview: 'Overview',
  listings: 'Listings',
  bookings: 'Bookings',
  applications: 'Host applications',
  verifications: 'ID verifications',
}

/** Exported for overview-trend.tsx, which reads the same payload to fill its tiles.
 *  Type-only import there, so this does not create a runtime cycle. */
export type AdminStats = {
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
  commission_paid: number
  commission_pending: number
  bookings_today: number
  pending_listings: number
  disputed_payments: number
  pending_payments: number
  pending_resort_submissions: number
  open_reports: number
  oldest_verification: string | null
  oldest_application: string | null
  oldest_listing: string | null
  oldest_report: string | null
  oldest_payment: string | null
}


type AdminListing = {
  id: string
  title: string
  location: string | null
  region: string | null
  approval_status: string
  /** Set when the host typed their own resort via "Other" — needs review before
   *  this listing can be approved. */
  resort_name: string | null
  resort: string | null
  currency: string
  price_per_night: number
  is_published: boolean
  host_id: string | null
  host_name: string | null
  created_at: string
  booking_count: number
  image: string | null
  /** Whether the host attached proof of ownership. The document itself is opened
   *  through the audited endpoint — see openDocument. */
  has_ownership_doc?: boolean
}

type AdminBooking = {
  id: string
  reservation_code: string
  status: string
  payment_status: string
  /** Commission-inclusive — what the guest was charged. */
  total_price: number
  /** The host's raw price. They are paid this in full; the commission is on top. */
  host_payout: number
  /** total_price − host_payout, at the rate this booking was taken at. */
  commission: number
  /** That rate, as a fraction. A snapshot, so an old booking keeps its old margin. */
  commission_rate: number
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
  // Which documents exist. The bytes are NOT here — each one is fetched on demand
  // from the audited /api/local/admin/documents endpoint. See openDocument below.
  has_front?: boolean
  has_back?: boolean
  has_selfie?: boolean
  submitted_at?: string | null
  reviewed_at?: string | null
  reviewed_by?: string | null
  notes?: string | null
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

/** A stored commission fraction (0.1) as the percentage an operator set (10%). */
function fmtPercent(rate: number | null | undefined): string {
  const n = Number(rate)
  if (!Number.isFinite(n)) return ''
  // Two decimals of a percent is the precision bookings.commission_rate stores.
  return `${Math.round(n * 10_000) / 100}%`
}

export function OpsDashboard({ section }: { section: SectionId }) {
  const { session, can } = useOpsSession()

  // The route decides the section; `tab` is kept as the local name because a dozen
  // handlers below report errors against "the current section".
  const tab = section
  const allowed = can(section)

  // Per-section data.
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [listings, setListings] = useState<AdminListing[]>([])
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [apps, setApps] = useState<HostApplication[]>([])
  const [verifs, setVerifs] = useState<Verification[]>([])
  // E2: the queue is a work list, so it defaults to pending — but a decided case must
  // stay reachable, otherwise it can never be reopened.
  const [verifFilter, setVerifFilter] = useState<'pending' | 'verified' | 'rejected' | 'all'>('pending')

  // Per-section loading / error.
  const [loading, setLoading] = useState<Record<SectionId, boolean>>({
    overview: false,
    listings: false,
    bookings: false,
    applications: false,
    verifications: false,
  })
  const [errors, setErrors] = useState<Record<SectionId, string | null>>({
    overview: null,
    listings: null,
    bookings: null,
    applications: null,
    verifications: null,
  })
  const [loaded, setLoaded] = useState<Record<SectionId, boolean>>({
    overview: false,
    listings: false,
    bookings: false,
    applications: false,
    verifications: false,
  })

  // F3: the Overview polls. Everything else in /ops is still fetch-once — a dashboard
  // is the one screen where a stale number is actively misleading.
  const live = useLivePoll<AdminStats>(
    () => adminGetQuiet<{ stats?: AdminStats }>('stats').then((r) =>
      typeof r === 'string' || r == null ? r : (r.stats ?? null)),
    30_000,
    null,
  )
  useEffect(() => { if (live.data) setStats(live.data) }, [live.data])
  // Re-render once a second purely so "updated 12s ago" counts up.
  const [nowTick, setNowTick] = useState(() => 0)
  useEffect(() => {
    if (section !== 'overview') return
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [section])

  const [busyId, setBusyId] = useState<string | null>(null)
  // Resort review: set while approving a listing whose resort is free text.
  // `mode` mirrors the API — add it to the catalog, match an existing one, or keep
  // the host's wording. `name` starts as what the host typed so a typo can simply
  // be corrected in place.
  const [resortReview, setResortReview] = useState<
    { listing: AdminListing; mode: 'new' | 'match' | 'keep'; name: string; region: string; matchId: string } | null
  >(null)
  const [resortCatalog, setResortCatalog] = useState<Array<{ id: string; name: string; region: string }>>([])

  // App download links (admin-editable; surfaced by the web "download the app" bar).
  const [appIos, setAppIos] = useState('')
  const [appAndroid, setAppAndroid] = useState('')
  const [linksLoaded, setLinksLoaded] = useState(false)
  const [savingLinks, setSavingLinks] = useState(false)
  const [linksMsg, setLinksMsg] = useState<string | null>(null)

  const setSectionLoading = (id: SectionId, v: boolean) =>
    setLoading((prev) => ({ ...prev, [id]: v }))
  const setSectionError = (id: SectionId, v: string | null) =>
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
    async (id: SectionId) => {
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
          const json = await adminGet<{ verifications?: Verification[] }>(`verifications?status=${verifFilter}`)
          if (json === 'forbidden') return setSectionError(id, NO_ACCESS)
          if (!json) {
            setSectionError(id, 'Could not load verifications. Please retry.')
            return
          }
          setVerifs(Array.isArray(json.verifications) ? json.verifications : [])
        }
      } finally {
        // Mark the section loaded on EVERY exit path, including the error returns
        // above. The lazy-fetch effect below runs whenever `loading` changes and
        // re-fires while `!loaded[tab]`, so a section that errored out used to
        // refetch forever — one failed request became an endless stream of them.
        setLoaded((prev) => (prev[id] ? prev : { ...prev, [id]: true }))
        setSectionLoading(id, false)
      }
    },
    [adminGet, verifFilter],
  )

  // Lazy-fetch this section on first open. Skipped without the module — the API
  // would only answer 403, and asking is how you end up with a screen full of
  // "access removed" for something the operator never tried to open.
  useEffect(() => {
    if (allowed && !loaded[tab] && !loading[tab]) void loadSection(tab)
  }, [allowed, tab, loaded, loading, loadSection])

  // A different verification filter is a different result set — drop the loaded flag
  // so the effect above refetches instead of showing the previous filter's rows.
  useEffect(() => {
    setLoaded((prev) => (prev.verifications ? { ...prev, verifications: false } : prev))
  }, [verifFilter])


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

  // ---- listing approval ----

  /** Approve a listing. If its resort is free text, review that first. */
  const approveListing = async (l: AdminListing) => {
    if (l.resort_name) {
      const cat = await adminGet<{ resorts: Array<{ id: string; name: string; region: string }> }>('resorts')
      if (cat && cat !== 'forbidden') setResortCatalog(cat.resorts ?? [])
      setResortReview({
        listing: l,
        mode: 'new',
        // Prefilled with the host's spelling — the admin corrects it or accepts it.
        name: l.resort_name,
        region: l.region ?? '',
        matchId: '',
      })
      return
    }
    setBusyId(l.id)
    const ok = await post('listings', { id: l.id, action: 'approve' })
    setBusyId(null)
    if (ok) void loadSection('listings')
  }

  const rejectListing = async (l: AdminListing) => {
    const note = window.prompt('Optional note for the host (why rejected):') ?? null
    setBusyId(l.id)
    const ok = await post('listings', { id: l.id, action: 'reject', note })
    setBusyId(null)
    if (ok) void loadSection('listings')
  }

  /** Submit the resort decision and the approval together. */
  const submitResortReview = async () => {
    if (!resortReview) return
    const r = resortReview
    setBusyId(r.listing.id)
    const ok = await post('listings', {
      id: r.listing.id,
      action: 'approve',
      resort:
        r.mode === 'match'
          ? { mode: 'match', resort_id: r.matchId }
          : r.mode === 'new'
            ? { mode: 'new', name: r.name, region: r.region }
            : { mode: 'keep' },
    })
    setBusyId(null)
    if (ok) {
      setResortReview(null)
      void loadSection('listings')
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

  const decideVerif = async (id: string, action: 'verify' | 'reject' | 'pending') => {
    let note: string | null = null
    if (action === 'reject') {
      note = window.prompt('Optional note (why rejected):') ?? null
    }
    setBusyId(id)
    const ok = await post('verifications', { id, action, note })
    setBusyId(null)
    if (!ok) return
    // On a filtered view the row no longer matches, so drop it; on 'all' it still
    // belongs but with a new status, so refetch rather than lie about it.
    if (verifFilter === 'all') setLoaded((p) => ({ ...p, verifications: false }))
    else setVerifs((prev) => prev.filter((v) => v.id !== id))
  }

  /**
   * Fetch one document from the audited endpoint and open it.
   *
   * Deliberately fetch -> blob -> object URL rather than <img src={apiUrl}>: an <img>
   * turns 403 (no `documents` module) and 404 (nothing on file) into the same broken
   * -image icon, and the operator needs to know which. Every call writes an audit row.
   */
  const openDocument = async (kind: string, id: string) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/local/admin/documents/${kind}/${id}`, { credentials: 'same-origin' })
      if (res.status === 403) return void window.alert('Your account does not have the Documents permission.')
      if (res.status === 404) return void window.alert('No document on file.')
      if (res.status === 415) return void window.alert('That document is stored in a format we cannot display.')
      if (!res.ok) return void window.alert('Could not open the document.')
      // A document stored as a link comes back as JSON instead of bytes.
      if (res.headers.get('content-type')?.includes('application/json')) {
        const body = await res.json()
        if (body?.url) window.open(body.url, '_blank', 'noopener,noreferrer')
        return
      }
      const url = URL.createObjectURL(await res.blob())
      window.open(url, '_blank', 'noopener,noreferrer')
      // The tab has the blob by now; releasing it frees the decoded image from memory.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      window.alert('Could not open the document.')
    } finally {
      setBusyId(null)
    }
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
  // Used by the app-download-links panel above the tabs.
  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${TAN}`,
    borderRadius: 12,
    padding: '9px 12px',
    fontSize: 14,
    color: INK,
    background: '#fff',
    outline: 'none',
  }
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
  /** Money columns: right-aligned with tabular figures, so the digits line up and a
   *  column of amounts can be scanned for the odd one out. */
  const numTdStyle: React.CSSProperties = {
    ...tdStyle,
    textAlign: 'right',
    whiteSpace: 'nowrap',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
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

  const statusBadge = (status: string): React.ReactNode => {
    const s = (status || '').toLowerCase()
    if (s === 'confirmed') return badge('Confirmed', '#E2F0E9', GREEN)
    if (s === 'pending') return badge('Pending', '#FBF1DD', '#8A6D1F')
    if (s === 'cancelled' || s === 'canceled') return badge('Cancelled', TAN, MUTED)
    if (s === 'rejected' || s === 'declined') return badge('Rejected', '#F6E0E2', BURGUNDY)
    return badge(status || '—', TAN, MUTED)
  }

  const sectionLoading = loading[tab]
  const sectionError = errors[tab]

  // Reached this section's URL without holding its module — either by typing it, by
  // following an old bookmark, or because a super admin revoked the permission while
  // the operator was signed in. The sidebar hides the link; this catches the rest.
  if (!allowed) {
    const noModulesAtAll = session.role !== 'super_admin' && session.modules.length === 0
    return (
      <main style={pageStyle}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 20px' }}>
          <div style={{ ...cardStyle, textAlign: 'center', padding: '44px 24px' }}>
            <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: INK }}>
              {noModulesAtAll ? 'No modules assigned' : `No access to ${SECTION_TITLES[section]}`}
            </p>
            <p style={{ margin: 0, fontSize: 14, color: MUTED }}>
              {noModulesAtAll
                ? 'Your account has no sections enabled yet. Ask a super admin to grant access.'
                : 'Ask a super admin to grant you this section. Everything you can open is in the sidebar.'}
            </p>
          </div>
        </div>
      </main>
    )
  }

  // ---- dashboard ----
  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 20px 64px' }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ color: BURGUNDY, fontSize: 26, fontWeight: 700, margin: 0 }}>
              {SECTION_TITLES[section]}
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

        {/* The section's own fetch, which runs AFTER this page has already arrived —
            the route skeleton covered the server wait, not this one. `!loaded[tab]`
            keeps it to the first load: a Refresh re-runs the same fetch, and
            replacing rows the operator is reading with placeholders would be worse
            than leaving them up while the new ones arrive. */}
        {sectionLoading && !loaded[tab] ? <OpsSectionSkeleton section={tab} /> : null}

        {/* ===================== OVERVIEW ===================== */}
        {tab === 'overview' && loaded.overview ? (
          stats ? (
          <>
            {/* The alert queues, derived once and read twice: by the slim banner at
                the very top and by the full cards further down. Only the queues this
                operator can actually act on — a moderator without the payments module
                is not shown a dispute they cannot open. */}
            {(() => {
              const alerts = alertsFor(stats as unknown as Record<string, number>, {
                modules: [], isSuperAdmin: true,
              }).filter((a) => can(a.module as never))
              const oldest: Record<string, string | null> = {
                pending_verifications: stats.oldest_verification,
                pending_applications: stats.oldest_application,
                pending_listings: stats.oldest_listing,
                pending_payments: stats.oldest_payment,
                open_reports: stats.oldest_report,
              }
              const liveLabel = live.expired
                ? 'Session ended — reload to resume live updates'
                : `Live · updated ${agoLabel(live.updatedAt, nowTick || Date.now())}`

              /* The queue cards now sit third, below the graph and the money — so a
                 one-line strip stays pinned at the top. Without it the only
                 actionable thing on the page would be below the fold on a laptop,
                 and this console's whole job is telling an operator what to do next.
                 It links to /ops/alerts rather than scrolling, since that page is
                 the same list with filters. */
              const banner =
                alerts.length === 0 ? (
                  <div
                    style={{
                      ...cardStyle, marginBottom: 14, padding: '10px 16px',
                      color: GREEN, fontSize: 13.5, fontWeight: 700,
                    }}
                  >
                    Nothing is waiting. Every queue is clear.
                  </div>
                ) : (
                  <Link
                    href="/ops/alerts"
                    style={{
                      ...cardStyle, marginBottom: 14, padding: '10px 16px',
                      borderLeft: `4px solid ${BURGUNDY}`, textDecoration: 'none',
                      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    }}
                  >
                    <strong style={{ fontSize: 13.5, color: BURGUNDY }}>
                      {alertTotal(alerts)} {alertTotal(alerts) === 1 ? 'item needs' : 'items need'} attention
                    </strong>
                    <span style={{ fontSize: 12.5, color: MUTED }}>
                      {alerts.map((a) => a.label).join(' · ')}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 12.5, color: BURGUNDY, fontWeight: 700 }}>
                      Open →
                    </span>
                  </Link>
                )

              const queue =
                alerts.length === 0 ? null : (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 14, color: BURGUNDY }}>
                        Needs attention ({alertTotal(alerts)})
                      </strong>
                      <span style={{ fontSize: 12, color: live.expired ? '#B3261E' : MUTED }}>
                        {liveLabel}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                      {alerts.map((a) => (
                        <a
                          key={a.key}
                          href={a.href}
                          style={{
                            ...cardStyle, padding: '14px 16px', textDecoration: 'none',
                            borderLeft: `4px solid ${BURGUNDY}`, display: 'block',
                          }}
                        >
                          <div style={{ fontSize: 24, fontWeight: 800, color: BURGUNDY, lineHeight: 1.1 }}>{a.count}</div>
                          <div style={{ fontSize: 12.5, color: INK, marginTop: 4, fontWeight: 600 }}>{a.label}</div>
                          {oldest[a.key] ? (
                            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                              oldest waiting {waitingLabel(oldest[a.key], nowTick || Date.now())}
                            </div>
                          ) : null}
                        </a>
                      ))}
                    </div>
                  </div>
                )

              return (
                <>
                  {banner}
                  {/* 1 — the counts, and the graph they drive. */}
                  <OverviewMetrics stats={stats} />
                  {/* 2 — money. */}
                  <MoneySection stats={stats} can={can} />
                  {/* 3 — the queues in full. */}
                  {queue}
                </>
              )
            })()}
          </>
          ) : (
            <p style={{ color: MUTED, fontSize: 14 }}>No stats available.</p>
          )
        ) : null}

        {/* 4 — App download links, surfaced by the mobile "download the app" bar.
            A settings form is the least urgent thing on the page, so it sits last;
            it lives on the Overview because `overview` is the module that gates it. */}
        {section === 'overview' && allowed && (
          <section style={{ ...cardStyle, marginTop: 4 }}>
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


        {/* ===================== USERS ===================== */}
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
                      {l.approval_status === 'pending'
                        ? badge('Awaiting approval', TAN, BURGUNDY)
                        : l.approval_status === 'rejected'
                          ? badge('Rejected', '#F6E0E2', BURGUNDY)
                          : l.is_published
                            ? badge('Published', '#E2F0E9', GREEN)
                            : badge('Hidden', TAN, MUTED)}
                      {/* Free text needs a decision before this listing can go live. */}
                      {l.resort_name ? badge('Resort: review needed', '#F6E0E2', BURGUNDY) : null}
                    </div>
                    <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
                      {l.host_name ? `Host: ${l.host_name}` : 'Host: —'}
                      {l.location ? ` · ${l.location}` : ''}
                      {l.resort ? ` · ${l.resort}` : ''}
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
                    {l.approval_status === 'pending' ? (
                      <>
                        {/* Approving is a judgement about a document, so the document
                            has to be reachable — it is no longer inlined in the list
                            payload. Each open is audited. */}
                        {l.has_ownership_doc ? (
                          <button
                            style={outlineBtn}
                            disabled={busyId === l.id}
                            title="Opening this is recorded in the staff audit log"
                            onClick={() => openDocument('ownership', l.id)}
                          >
                            Ownership doc
                          </button>
                        ) : null}
                        <button
                          style={approveBtn}
                          disabled={busyId === l.id}
                          onClick={() => approveListing(l)}
                        >
                          {busyId === l.id ? 'Working…' : 'Approve'}
                        </button>
                        <button
                          style={outlineBtn}
                          disabled={busyId === l.id}
                          onClick={() => rejectListing(l)}
                        >
                          Reject
                        </button>
                      </>
                    ) : null}
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
            <>
              {/* The three money columns are the same sum read three ways, so the
                  totals belong on the same screen: what came in, what goes out to
                  hosts, and what stays. Summed over what is LOADED (the newest 300),
                  which is said plainly rather than passed off as an all-time figure —
                  the dashboard tiles are the all-time answer. */}
              {(() => {
                const paid = bookings.filter((b) => (b.payment_status || '').toLowerCase() === 'paid')
                const sum = (rows: AdminBooking[], pick: (b: AdminBooking) => number) =>
                  rows.reduce((n, b) => n + (Number(pick(b)) || 0), 0)
                const currency = bookings[0]?.currency || 'EGP'
                const cells: Array<{ label: string; value: number; hint: string }> = [
                  { label: 'Guests paid', value: sum(paid, (b) => b.total_price), hint: `${paid.length} paid` },
                  { label: 'Host payouts', value: sum(paid, (b) => b.host_payout), hint: 'owed in full' },
                  { label: 'Commission', value: sum(paid, (b) => b.commission), hint: 'QuickIn keeps' },
                ]
                return (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                      gap: 12,
                      marginBottom: 16,
                    }}
                  >
                    {cells.map((c) => (
                      <div key={c.label} style={{ ...cardStyle, padding: '14px 16px' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: BURGUNDY, lineHeight: 1.15 }}>
                          {fmtMoney(c.value, currency)}
                        </div>
                        <div style={{ fontSize: 12.5, color: INK, marginTop: 4, fontWeight: 600 }}>{c.label}</div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                          {c.hint} · of the {bookings.length} shown
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
              <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Code</th>
                      <th style={thStyle}>Guest</th>
                      <th style={thStyle}>Listing</th>
                      <th style={thStyle}>Dates</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Payment</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Guest paid</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Host payout</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Commission</th>
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
                        <td style={numTdStyle}>{fmtMoney(b.total_price, b.currency)}</td>
                        <td style={{ ...numTdStyle, color: MUTED, fontWeight: 500 }}>
                          {fmtMoney(b.host_payout, b.currency)}
                        </td>
                        <td style={{ ...numTdStyle, color: BURGUNDY }}>
                          {fmtMoney(b.commission, b.currency)}
                          {/* The rate that produced it. Bookings keep the rate they
                              were taken at, so two rows can legitimately differ. */}
                          <div style={{ fontSize: 11, color: MUTED, fontWeight: 500 }}>
                            {fmtPercent(b.commission_rate)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
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
          <>
            {/* Filter chips — a decided case must stay reachable so it can be reopened. */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {(['pending', 'verified', 'rejected', 'all'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setVerifFilter(f)}
                  style={{
                    ...btnBase,
                    background: verifFilter === f ? BURGUNDY : 'transparent',
                    color: verifFilter === f ? CREAM : INK,
                    border: `1px solid ${verifFilter === f ? BURGUNDY : TAN}`,
                    textTransform: 'capitalize',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
            {verifs.length === 0 ? (
              <p style={{ color: MUTED, fontSize: 14 }}>
                No {verifFilter === 'all' ? '' : verifFilter} verifications.
              </p>
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
                  {/* Documents are opened one at a time through the audited endpoint —
                      never rendered inline. This queue used to ship every pending
                      submission's three ID photos to anyone who opened the tab. */}
                  {v.has_front || v.has_back || v.has_selfie ? (
                    <div style={{ marginBottom: 14 }}>
                      <p
                        style={{
                          margin: '0 0 8px',
                          fontSize: 12,
                          lineHeight: 1.6,
                          color: INK,
                          background: '#FDF0DC',
                          padding: '8px 10px',
                          borderRadius: 10,
                        }}
                      >
                        Opening a document reveals this person&apos;s identity papers and is
                        recorded in the staff audit log.
                      </p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {([
                          ['id_front', 'View front', v.has_front],
                          ['id_back', 'View back', v.has_back],
                          ['id_selfie', 'View selfie', v.has_selfie],
                        ] as Array<[string, string, boolean | undefined]>).map(([kind, label, present]) =>
                          present ? (
                            <button
                              key={kind}
                              style={outlineBtn}
                              disabled={busyId === v.id}
                              onClick={() => openDocument(kind, v.id)}
                            >
                              {label}
                            </button>
                          ) : null,
                        )}
                      </div>
                    </div>
                  ) : (
                    <p style={{ margin: '0 0 14px', fontSize: 13, color: MUTED }}>No documents on file.</p>
                  )}
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
                    {/* E2's third state: put a decided case back in the queue. Hidden
                        on a row that is already pending, where it would be a no-op. */}
                    {v.status && v.status !== 'pending' ? (
                      <button
                        style={outlineBtn}
                        disabled={busyId === v.id}
                        onClick={() => decideVerif(v.id, 'pending')}
                      >
                        Reopen
                      </button>
                    ) : null}
                  </div>
                  {v.reviewed_at ? (
                    <p style={{ margin: '10px 0 0', fontSize: 12, color: MUTED }}>
                      {v.status === 'verified' ? 'Verified' : 'Rejected'} {fmtDate(v.reviewed_at)}
                      {v.reviewed_by ? ` by ${v.reviewed_by.replace(/^staff:/, 'staff ').slice(0, 20)}` : ''}
                      {v.notes ? ` — ${v.notes}` : ''}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            )}
          </>
        ) : null}
      </div>

      {/* ---- Resort review, shown while approving a listing whose resort is free text ---- */}
      {resortReview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Review resort before approving"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(42,34,32,0.45)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '5vh 16px', overflowY: 'auto', zIndex: 60,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setResortReview(null) }}
        >
          <div style={{ ...cardStyle, width: '100%', maxWidth: 520 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: BURGUNDY }}>
              This listing&apos;s resort needs review
            </h2>
            <p style={{ margin: '6px 0 14px', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
              The host chose <strong>Other</strong> and typed{' '}
              <strong style={{ color: INK }}>&ldquo;{resortReview.listing.resort_name}&rdquo;</strong>, which
              isn&apos;t in the catalog. Decide what it means before approving.
            </p>

            {/* Three ways out, as radio-style choices. */}
            <div style={{ display: 'grid', gap: 8 }}>
              {([
                ['new', 'Add it as a new resort'],
                ['match', 'Match an existing resort'],
                ['keep', 'Keep the host\u2019s wording for now'],
              ] as const).map(([mode, label]) => (
                <label
                  key={mode}
                  style={{
                    display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 12px',
                    borderRadius: 12, cursor: 'pointer',
                    border: `1px solid ${resortReview.mode === mode ? BURGUNDY : TAN}`,
                    background: resortReview.mode === mode ? 'rgba(91,15,22,0.04)' : '#fff',
                  }}
                >
                  <input
                    type="radio"
                    name="resort-mode"
                    checked={resortReview.mode === mode}
                    onChange={() => setResortReview({ ...resortReview, mode })}
                    style={{ marginTop: 2, accentColor: BURGUNDY }}
                  />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{label}</span>
                </label>
              ))}
            </div>

            {resortReview.mode === 'new' && (
              <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                <div>
                  <label style={labelStyle} htmlFor="rr-name">Resort name</label>
                  <input
                    id="rr-name"
                    value={resortReview.name}
                    onChange={(e) => setResortReview({ ...resortReview, name: e.target.value })}
                    style={inputStyle}
                    autoFocus
                  />
                  <p style={{ margin: '5px 0 0', fontSize: 12, color: MUTED }}>
                    Prefilled with what the host typed — correct the spelling, or accept it as is.
                  </p>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="rr-region">Region</label>
                  <select
                    id="rr-region"
                    value={resortReview.region}
                    onChange={(e) => setResortReview({ ...resortReview, region: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Pick a region…</option>
                    {[...new Set(resortCatalog.map((r) => r.region))].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {resortReview.mode === 'match' && (
              <div style={{ marginTop: 12 }}>
                <label style={labelStyle} htmlFor="rr-match">Existing resort</label>
                <select
                  id="rr-match"
                  value={resortReview.matchId}
                  onChange={(e) => setResortReview({ ...resortReview, matchId: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">Pick a resort…</option>
                  {resortCatalog.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} · {r.region}</option>
                  ))}
                </select>
                <p style={{ margin: '5px 0 0', fontSize: 12, color: MUTED }}>
                  For when the host simply didn&apos;t spot it in the list.
                </p>
              </div>
            )}

            <p style={{ margin: '12px 0 0', fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
              {resortReview.mode === 'keep'
                ? 'The typed name stays on the listing and stays in the Resorts queue.'
                : 'Only this listing is relinked. Other listings using the same wording stay in the Resorts queue — but the spelling is remembered, so future hosts typing it link automatically.'}
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setResortReview(null)} style={outlineBtn}>Cancel</button>
              <button
                onClick={submitResortReview}
                disabled={
                  busyId === resortReview.listing.id ||
                  (resortReview.mode === 'new' && (!resortReview.name.trim() || !resortReview.region)) ||
                  (resortReview.mode === 'match' && !resortReview.matchId)
                }
                style={{
                  ...approveBtn,
                  opacity:
                    busyId === resortReview.listing.id ||
                    (resortReview.mode === 'new' && (!resortReview.name.trim() || !resortReview.region)) ||
                    (resortReview.mode === 'match' && !resortReview.matchId)
                      ? 0.5 : 1,
                }}
              >
                {busyId === resortReview.listing.id ? 'Approving…' : 'Save & approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

/**
 * The money row: commission earned, commission expected, host payouts.
 *
 * Extracted from OpsDashboard's body when the Overview was reordered — it is 80
 * lines of tiles and the section around it now has three siblings to keep straight,
 * so leaving it inline made the ordering impossible to read at a glance.
 *
 * Money used to lead the Overview, and the reasoning still holds: what QuickIn has
 * earned is the question this console gets asked most, and it was once a single
 * unlabelled "Gross paid" sitting eleventh in a grid of user counts. It now sits
 * below the growth graph, which answers the second-most-asked question.
 */
function MoneySection({
  stats,
  can,
}: {
  stats: AdminStats
  can: (module: StaffModule) => boolean
}) {
  const tiles = [
    {
      label: 'Commission earned',
      value: money(stats.commission_paid),
      hint: `QuickIn's cut of ${stats.paid_bookings} paid bookings`,
      accent: true,
    },
    {
      label: 'Commission expected',
      value: money(stats.commission_pending),
      hint: 'on live bookings not yet paid',
      accent: false,
    },
    {
      label: 'Host payouts (paid)',
      value: money(stats.gross_paid),
      // gross_paid is SUM(total_price) — the host's raw price, which they receive in
      // full. It is NOT what guests handed over; add the commission for that. Saying
      // so beats a bare "Gross paid".
      hint: 'their price in full, before the markup',
      accent: false,
    },
  ]

  return (
    <section style={{ marginBottom: 20 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: BURGUNDY }}>Money</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        {tiles.map((s) => (
          <div
            key={s.label}
            style={{
              background: s.accent ? BURGUNDY : '#fff',
              border: `1px solid ${s.accent ? BURGUNDY : TAN}`,
              borderRadius: 18,
              padding: '16px 18px',
              boxShadow: '0 1px 3px rgba(42,34,32,0.06)',
            }}
          >
            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
                lineHeight: 1.15,
                color: s.accent ? CREAM : BURGUNDY,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {s.value}
            </div>
            <div style={{ fontSize: 12.5, marginTop: 6, fontWeight: 600, color: s.accent ? CREAM : INK }}>
              {s.label}
            </div>
            <div
              style={{
                fontSize: 11,
                marginTop: 2,
                color: s.accent ? CREAM : MUTED,
                opacity: s.accent ? 0.8 : 1,
              }}
            >
              {s.hint}
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 11.5, color: MUTED }}>
        Each booking is counted at the commission rate it was taken at, so changing the rate in{' '}
        {can('pricing') ? <Link href="/ops/pricing" style={{ color: BURGUNDY }}>Pricing</Link> : 'Pricing'}{' '}
        never restates what has already been earned. Refunded bookings drop out.
      </p>
    </section>
  )
}
