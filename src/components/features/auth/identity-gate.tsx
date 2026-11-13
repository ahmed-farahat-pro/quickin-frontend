'use client'

// Holds an account that still owes its phone + identity document on the
// "Complete your account" page.
//
// Only a first Google sign-in can get here (the email signup form collects both
// before the account exists), and the backend reports it as
// `identity_complete: false` on /api/auth/me. Mounted once in the root layout,
// so every page is covered without each one reading the session itself: the
// pages stay statically renderable, and the check costs one request per full
// page load. The server enforces the same rule on bookings regardless.
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { locales } from '@/i18n/config'
import {
  COMPLETE_ACCOUNT_PATH,
  isIdentityGateExempt,
  needsAccountCompletion,
} from '@/lib/local/signup-identity-ui-core'

/** The signed-in user as /api/auth/me returns it, or null. */
type Me = Record<string, unknown> | null

let mePromise: Promise<Me> | null = null

function fetchMe(): Promise<Me> {
  return fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d && typeof d === 'object' && d.user && typeof d.user === 'object' ? d.user : null))
    .catch(() => null)
}

/**
 * The signed-in user, read once per page load and shared by every caller (the
 * gate, the reserve panel's rejected-ID notice). `undefined` while loading.
 * Pass `fresh` after an action that changes the identity state.
 */
export function loadMe(fresh = false): Promise<Me> {
  if (fresh || !mePromise) mePromise = fetchMe()
  return mePromise
}

export function useMe(): Me | undefined {
  const [me, setMe] = useState<Me | undefined>(undefined)
  useEffect(() => {
    let live = true
    loadMe().then((u) => { if (live) setMe(u) })
    return () => { live = false }
  }, [])
  return me
}

export function IdentityGate() {
  const pathname = usePathname()
  const router = useRouter()
  const [owes, setOwes] = useState(false)

  useEffect(() => {
    let live = true
    // Re-read only while the account is known to owe something — once it is
    // complete (or signed out) the cached answer stands for the page load.
    loadMe(owes).then((u) => {
      if (!live) return
      const needs = needsAccountCompletion(u)
      setOwes(needs)
      if (needs && !isIdentityGateExempt(pathname || '/', locales)) {
        router.replace(COMPLETE_ACCOUNT_PATH)
      }
    })
    return () => { live = false }
    // `owes` is read, not tracked: the pathname change is what re-runs this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router])

  return null
}
