'use client'

// Client-side half of the /ops session (A4 hide, A5 auto-logout).
//
// Holds the staff identity the server layout resolved, exposes `can()` so pages can
// hide modules the operator isn't allowed to use, and runs the idle timer.
//
// The timer is a convenience, NOT the security boundary: the server rejects an idle
// session on the next request regardless (see resolveStaffSession). Without it the UI
// would simply sit on a dead session until the operator clicked something.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { StaffModule, StaffRole } from '@/lib/local/staff'

export type OpsSession = {
  staffId: string
  email: string
  fullName: string
  role: StaffRole
  modules: StaffModule[]
  legacy: boolean
}

type Ctx = {
  session: OpsSession
  /** Mirror of staffCan() on the server: super admin passes everything. */
  can: (module: StaffModule) => boolean
  signOut: () => void
}

const OpsSessionContext = createContext<Ctx | null>(null)

export function useOpsSession(): Ctx {
  const ctx = useContext(OpsSessionContext)
  if (!ctx) throw new Error('useOpsSession must be used inside OpsSessionProvider')
  return ctx
}

/** Activity that counts as "not idle". Pointer/keyboard only — scroll fires far too
 *  often and visibilitychange would keep a backgrounded tab alive forever. */
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'click'] as const

export function OpsSessionProvider({
  session,
  idleMs,
  children,
}: {
  session: OpsSession
  idleMs: number
  children: React.ReactNode
}) {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const signOut = useCallback(
    (reason?: 'idle') => {
      // Clear the cookie server-side and revoke the session row, then leave the
      // console. Navigate even if the call fails — the server gate is the authority.
      fetch('/api/local/staff/logout', { method: 'POST', credentials: 'same-origin' })
        .catch(() => {})
        .finally(() => {
          window.location.href = reason ? `/ops/login?reason=${reason}` : '/ops/login'
        })
    },
    []
  )

  useEffect(() => {
    if (!idleMs || idleMs <= 0) return

    const reset = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => signOut('idle'), idleMs)
    }

    reset()
    for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, reset, { passive: true })
    return () => {
      if (timer.current) clearTimeout(timer.current)
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, reset)
    }
  }, [idleMs, signOut])

  const value = useMemo<Ctx>(
    () => ({
      session,
      can: (module: StaffModule) =>
        session.role === 'super_admin' || session.modules.includes(module),
      signOut: () => signOut(),
    }),
    [session, signOut]
  )

  return <OpsSessionContext.Provider value={value}>{children}</OpsSessionContext.Provider>
}

/** Console pages beyond the tabbed dashboard, each gated by its own module.
 *  'staff' is super-admin-only, which staffCan() already enforces — so listing it
 *  here needs no extra role check. */
const NAV: Array<{ href: string; label: string; module: StaffModule }> = [
  { href: '/ops/users', label: 'Users', module: 'users' },
  { href: '/ops/activity', label: 'Activity', module: 'overview' },
  { href: '/ops/reports', label: 'Reports', module: 'reports' },
  { href: '/ops/analytics', label: 'Analytics', module: 'analytics' },
  { href: '/ops/payments', label: 'Payments', module: 'payments' },
  { href: '/ops/resorts', label: 'Resorts', module: 'resorts' },
  { href: '/ops/audit', label: 'Audit', module: 'audit' },
  { href: '/ops/staff', label: 'Staff', module: 'staff' },
]

/**
 * The alert count, polled in the header so it follows the operator across every /ops
 * screen rather than only existing on the dashboard.
 *
 * Deliberately quiet about failure: a bell that can't reach the server shows nothing
 * rather than a zero, because "0 alerts" and "I don't know" must not look the same.
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

/** Shared header strip for the console pages: logo, who's signed in, sign out. */
export function OpsHeader({ title }: { title: string }) {
  const { session, can, signOut } = useOpsSession()
  const router = useRouter()
  const alertCount = useAlertCount()

  return (
    <header
      style={{
        background: 'linear-gradient(180deg, #EFE6D8 0%, #F6F1E6 100%)',
        borderBottom: '1px solid rgba(91,15,22,0.10)',
        padding: '16px 24px',
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="QuickIn" height={36} style={{ height: 36, width: 'auto', display: 'block' }} />
          <span style={{ color: '#5B0F16', fontWeight: 700, fontSize: 14 }}>{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
          <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
            <div style={{ fontWeight: 700, color: '#2A2220' }}>{session.fullName || session.email}</div>
            <div style={{ color: '#6B6055', fontSize: 12 }}>
              {session.role === 'super_admin' ? 'Super admin' : 'Moderator'}
              {session.legacy ? ' · legacy' : ''}
            </div>
          </div>
          {/* Module-gated nav. Each entry is hidden unless the operator holds the
              module — the page and its API re-check independently, so this is
              convenience, not the boundary. */}
          {can('overview') && (
            <button
              type="button"
              onClick={() => router.push('/ops/alerts')}
              title={alertCount == null ? 'Alerts' : `${alertCount} waiting`}
              style={{
                position: 'relative',
                padding: '8px 12px',
                borderRadius: 12,
                border: '1px solid rgba(91,15,22,0.25)',
                background: alertCount ? '#5B0F16' : 'transparent',
                color: alertCount ? '#F6F1E6' : '#5B0F16',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {alertCount ? `\u2022 ${alertCount}` : '\u2022'} Alerts
            </button>
          )}
          {NAV.filter((n) => can(n.module)).map((n) => (
            <button
              key={n.href}
              type="button"
              onClick={() => router.push(n.href)}
              style={{
                padding: '8px 14px',
                borderRadius: 12,
                border: '1px solid rgba(91,15,22,0.25)',
                background: 'transparent',
                color: '#5B0F16',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {n.label}
            </button>
          ))}
          <button
            type="button"
            onClick={signOut}
            style={{
              padding: '8px 14px',
              borderRadius: 12,
              border: 'none',
              background: '#5B0F16',
              color: '#F6F1E6',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
