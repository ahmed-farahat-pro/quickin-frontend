'use client'

// Client-side half of the /ops session (A4 hide, A5 auto-logout).
//
// Holds the staff identity the server layout resolved, exposes `can()` so pages can
// hide modules the operator isn't allowed to use, and runs the idle timer.
//
// The timer is a convenience, NOT the security boundary: the server rejects an idle
// session on the next request regardless (see resolveStaffSession). Without it the UI
// would simply sit on a dead session until the operator clicked something.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import type { StaffModule, StaffRole } from '@/lib/types'

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
  /** Mirror of opsCan() on the server: super admin passes everything. */
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

// The navigation, the alert bell and the sign-out control used to live here as
// OpsHeader, a strip every page rendered for itself. They now belong to the
// console shell (ops-shell.tsx), which the layout renders once around all of them.
// This module is back to what its name says: the session.
