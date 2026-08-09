'use client'

// The frame every /ops screen renders inside: a slim top bar and one sidebar.
//
// This replaced TWO navigation bars — a header strip of nine buttons plus a
// separate tab row that only existed on the dashboard. Between them, half the
// console was reachable only from the dashboard and half only from the header, so
// getting from Verifications to Resorts meant going "up" first. One sidebar,
// present on every screen, means anywhere reaches anywhere in a single click.
//
// The top bar is deliberately almost empty: the logo (home), the alert bell and
// sign out. Everything that navigates lives in the sidebar; everything in the top
// bar is an action.
//
// CHROME IS TAN, CONTENT IS CREAM, CARDS ARE WHITE — in that order, darkest to
// lightest. The rail was white first, which broke the ladder twice over: white is
// what cardStyle uses, so the navigation spoke the same language as the panels it
// framed; and with the cream page sitting between two whites, the brightest thing
// on screen was the menu rather than the work. Tan also runs the top bar, so the
// two now read as one L-shaped frame instead of two pieces of furniture meeting at
// a corner. If you are tempted to lighten this rail, lighten the content instead.
//
// Styling is inline objects in the boutique palette, matching the rest of /ops
// (see ops-ui.tsx for why). That costs us CSS's `:hover` and media queries, so
// hover/focus are tracked in state and the breakpoint is read with matchMedia.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { COLORS, FONT } from '../ops-theme'
import { useOpsSession } from './ops-session'
import type { StaffModule } from '@/lib/local/staff'

/** Group headings, a shade darker than COLORS.muted: muted was tuned against white
 *  and sits at roughly 4.6:1 on tan — passing, but too faint to hold the groups
 *  apart once the rail stopped being the brightest thing on the page. */
const GROUP_LABEL = '#5A5047'

/** Width of the sidebar rail on a desktop viewport. */
const SIDEBAR_W = 248
/** Below this the sidebar becomes an off-canvas drawer behind a menu button. */
const MOBILE_MAX = 900

type NavItem = {
  href: string
  label: string
  /** The permission that reveals it. The page and its API re-check independently,
   *  so hiding an item is convenience, not the security boundary. */
  module: StaffModule
  /** `/ops` is a prefix of every other route, so Overview must match exactly. */
  exact?: boolean
}

type NavGroup = { title: string; items: NavItem[] }

/**
 * The console's whole map, in the order an operator works through it: what needs
 * doing today, then who it concerns, then what it added up to, then settings.
 *
 * A group whose every item is hidden disappears with it — a moderator holding only
 * `users` sees one heading, not five empty ones.
 */
const NAV: NavGroup[] = [
  {
    title: 'Dashboard',
    items: [{ href: '/ops', label: 'Overview', module: 'overview', exact: true }],
  },
  {
    title: 'Operations',
    items: [
      { href: '/ops/listings', label: 'Listings', module: 'listings' },
      { href: '/ops/bookings', label: 'Bookings', module: 'bookings' },
      { href: '/ops/payments', label: 'Payments & disputes', module: 'payments' },
      { href: '/ops/reports', label: 'Reports', module: 'reports' },
      { href: '/ops/disputes', label: 'Guest disputes', module: 'disputes' },
      { href: '/ops/alerts', label: 'Alerts', module: 'overview' },
    ],
  },
  {
    title: 'People',
    items: [
      { href: '/ops/users', label: 'Users', module: 'users' },
      { href: '/ops/moderation', label: 'Moderation', module: 'moderation' },
      { href: '/ops/applications', label: 'Host applications', module: 'applications' },
      { href: '/ops/verifications', label: 'ID verifications', module: 'verifications' },
    ],
  },
  {
    title: 'Insights',
    items: [
      { href: '/ops/analytics', label: 'Analytics', module: 'analytics' },
      { href: '/ops/activity', label: 'Activity', module: 'overview' },
      { href: '/ops/audit', label: 'Audit log', module: 'audit' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { href: '/ops/pricing', label: 'Pricing & commission', module: 'pricing' },
      { href: '/ops/resorts', label: 'Resorts', module: 'resorts' },
      { href: '/ops/staff', label: 'Staff & permissions', module: 'staff' },
    ],
  },
]

// ---- Icons ------------------------------------------------------------------
// Inline so the console stays dependency-free and the glyphs inherit currentColor.

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function BellIcon() {
  return (
    <svg {...iconProps}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

/** A door with an arrow leaving it — the universal "sign out". */
function SignOutIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg {...iconProps}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      {...iconProps}
      width={14}
      height={14}
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// ---- Alert count ------------------------------------------------------------

/**
 * The number on the bell, polled here so it follows the operator across every /ops
 * screen rather than only existing on the dashboard.
 *
 * Deliberately quiet about failure: a bell that can't reach the server shows
 * nothing rather than a zero, because "0 alerts" and "I don't know" must not look
 * the same.
 */
function useAlertCount(): number | null {
  const [total, setTotal] = useState<number | null>(null)
  useEffect(() => {
    let stop = false
    const tick = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const res = await fetch('/api/local/admin/alerts', { credentials: 'same-origin', cache: 'no-store' })
        if (!res.ok) return
        const body = await res.json()
        if (!stop) setTotal(Number(body?.total ?? 0))
      } catch { /* leave the previous value; never show a wrong zero */ }
    }
    void tick()
    const t = setInterval(() => void tick(), 60_000)
    return () => { stop = true; clearInterval(t) }
  }, [])
  return total
}

/** True while the viewport is narrower than the drawer breakpoint. Starts false so
 *  the server and the first client render agree, then corrects on mount. */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`)
    const sync = () => setMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return mobile
}

// ---- Shell ------------------------------------------------------------------

export function OpsShell({ children }: { children: React.ReactNode }) {
  const { session, can, signOut } = useOpsSession()
  const pathname = usePathname()
  const alertCount = useAlertCount()
  const isMobile = useIsMobile()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  // Groups start open — with fifteen destinations in total, hiding them behind a
  // click would cost more than it saves. Collapsing is for operators who want a
  // shorter rail, so the choice is theirs and not the default.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  // Only the groups with something in them for this operator.
  const groups = useMemo(
    () =>
      NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(i.module)) })).filter(
        (g) => g.items.length > 0
      ),
    [can]
  )

  const isCurrent = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)

  // Escape closes the drawer, the one dismissal every overlay is expected to have.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const toggleGroup = (title: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })

  const sidebar = (
    <nav
      aria-label="Console sections"
      style={{
        width: SIDEBAR_W,
        flexShrink: 0,
        // Tan, not white — see CHROME above. White is the card colour, and a white
        // rail made the navigation the brightest surface on the page.
        background: COLORS.tan,
        borderRight: '1px solid rgba(91,15,22,0.10)',
        display: 'flex',
        flexDirection: 'column',
        // Desktop: stick under the top bar and scroll on its own, so a long page
        // never scrolls the navigation out of reach.
        ...(isMobile
          ? { height: '100%' }
          : { position: 'sticky', top: 60, height: 'calc(100vh - 60px)' }),
      }}
    >
      {/* No minHeight: 0 needed here, though `flex: 1` in a column usually wants it —
          a flex item's automatic minimum size is already zero once it is a scroll
          container in that axis, which overflowY makes it. The footer below stays
          pinned on a short viewport and this list scrolls under it. */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px' }}>
        {groups.map((group) => {
          const open = !collapsed.has(group.title)
          return (
            <div key={group.title} style={{ marginBottom: 6 }}>
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                aria-expanded={open}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '8px 10px',
                  border: 'none',
                  background: 'transparent',
                  color: GROUP_LABEL,
                  fontFamily: FONT,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {group.title}
                <ChevronIcon open={open} />
              </button>
              {open ? (
                <div style={{ display: 'grid', gap: 2 }}>
                  {group.items.map((item) => {
                    const current = isCurrent(item)
                    const hot = hovered === item.href
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={current ? 'page' : undefined}
                        onMouseEnter={() => setHovered(item.href)}
                        onMouseLeave={() => setHovered((h) => (h === item.href ? null : h))}
                        onFocus={() => setHovered(item.href)}
                        onBlur={() => setHovered((h) => (h === item.href ? null : h))}
                        // Put the drawer away on the click that navigates. Doing it
                        // in an effect keyed on the pathname would not fire when the
                        // operator taps the section they are already on, leaving the
                        // overlay covering the page they just asked to see.
                        onClick={() => setDrawerOpen(false)}
                        style={{
                          display: 'block',
                          padding: '9px 12px',
                          borderRadius: 10,
                          textDecoration: 'none',
                          fontSize: 13.5,
                          fontWeight: current ? 700 : 600,
                          color: current ? COLORS.cream : COLORS.ink,
                          background: current
                            ? COLORS.burgundy
                            : hot
                              ? 'rgba(91,15,22,0.11)'
                              : 'transparent',
                          transition: 'background .15s, color .15s',
                        }}
                      >
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* Who is signed in. It used to sit in the header; down here it stays visible
          without competing with the three actions in the top bar. */}
      <div style={{ borderTop: '1px solid rgba(91,15,22,0.10)', padding: '12px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink, overflowWrap: 'anywhere' }}>
          {session.fullName || session.email}
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 2 }}>
          {session.role === 'super_admin' ? 'Super admin' : 'Moderator'}
          {session.legacy ? ' · legacy' : ''}
        </div>
      </div>
    </nav>
  )

  return (
    <div style={{ minHeight: '100vh', background: COLORS.cream, fontFamily: FONT }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          height: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 16px',
          // Flat, and the same tan as the rail: the old gradient faded to cream at
          // its lower edge, so bar and rail met in a visible step.
          background: COLORS.tan,
          borderBottom: '1px solid rgba(91,15,22,0.10)',
        }}
      >
        {isMobile ? (
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={drawerOpen}
            style={iconBtn(false)}
          >
            <MenuIcon />
          </button>
        ) : null}

        {/* The logo is home. It was previously inert, which is the one thing every
            operator tries first when they want to get back to the dashboard. */}
        <Link href="/ops" aria-label="QuickIn operations — dashboard" style={{ display: 'flex', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="QuickIn" height={34} style={{ height: 34, width: 'auto', display: 'block' }} />
        </Link>

        <div style={{ flex: 1 }} />

        {can('overview') ? (
          <Link
            href="/ops/alerts"
            aria-label={alertCount == null ? 'Alerts' : `Alerts — ${alertCount} waiting`}
            title={alertCount == null ? 'Alerts' : `${alertCount} waiting`}
            style={{ ...iconBtn(pathname === '/ops/alerts'), position: 'relative', textDecoration: 'none' }}
          >
            <BellIcon />
            {alertCount ? (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  minWidth: 17,
                  height: 17,
                  padding: '0 4px',
                  borderRadius: 999,
                  background: COLORS.burgundy,
                  color: COLORS.cream,
                  fontSize: 10.5,
                  fontWeight: 800,
                  lineHeight: '17px',
                  textAlign: 'center',
                }}
              >
                {alertCount > 99 ? '99+' : alertCount}
              </span>
            ) : null}
          </Link>
        ) : null}

        <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out" style={iconBtn(false)}>
          <SignOutIcon />
        </button>
      </header>

      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {isMobile ? null : sidebar}
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      </div>

      {/* Mobile drawer. Rendered only when open so its links stay out of the tab
          order while it is closed. */}
      {isMobile && drawerOpen ? (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 40,
              background: 'rgba(42,34,32,0.45)',
            }}
          />
          <div style={{ position: 'fixed', top: 60, bottom: 0, left: 0, zIndex: 41, display: 'flex' }}>
            {sidebar}
          </div>
        </>
      ) : null}
    </div>
  )
}

/** The three top-bar controls are icon-only, so they share one shape. */
function iconBtn(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    height: 38,
    flexShrink: 0,
    borderRadius: 11,
    border: `1px solid ${active ? COLORS.burgundy : 'rgba(91,15,22,0.22)'}`,
    background: active ? COLORS.burgundy : 'transparent',
    color: active ? COLORS.cream : COLORS.burgundy,
    cursor: 'pointer',
    padding: 0,
  }
}
