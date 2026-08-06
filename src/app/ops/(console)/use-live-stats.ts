'use client'

// F3 — keep the dashboard fresh without a reload.
//
// Three things this deliberately does, because /ops had no polling at all before and
// each is a way naive polling goes wrong here:
//
//  1. **Pauses when the tab is hidden.** A dashboard left open in a background tab
//     would otherwise hit Neon every 30s forever, from every operator's browser.
//  2. **Stops permanently on 401 instead of redirecting.** `adminGet` turns a 401 into
//     a hard redirect to the login page; a background poll doing that would yank an
//     operator out of whatever they were typing on another screen the moment their
//     session lapsed. The poll stops and says so instead.
//  3. **Does NOT touch the idle timer.** ops-session's auto-logout resets only on real
//     input (mousedown/keydown/touchstart/click), so polling can't keep a dead session
//     alive. That's correct — don't "fix" it by pinging on an interval.
import { useCallback, useEffect, useRef, useState } from 'react'

export interface LiveState<T> {
  data: T | null
  /** Epoch ms of the last successful fetch, for an "updated Ns ago" label. */
  updatedAt: number | null
  loading: boolean
  error: string | null
  /** True once the session lapsed — polling has stopped and won't resume. */
  expired: boolean
  refresh: () => void
}

/**
 * Poll `fetcher` on an interval. `fetcher` should resolve to the data, `'forbidden'`
 * when the module is missing, `'expired'` when the session is gone, or null on a
 * transient failure.
 */
export function useLivePoll<T>(
  fetcher: () => Promise<T | 'forbidden' | 'expired' | null>,
  intervalMs: number,
  initial: T | null = null,
): LiveState<T> {
  const [data, setData] = useState<T | null>(initial)
  const [updatedAt, setUpdatedAt] = useState<number | null>(initial ? Date.now() : null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)

  // Held in a ref so changing the fetcher identity doesn't restart the interval.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const inFlight = useRef(false)

  const tick = useCallback(async () => {
    if (inFlight.current || expired) return
    inFlight.current = true
    setLoading(true)
    try {
      const res = await fetcherRef.current()
      if (res === 'expired') {
        setExpired(true)
        setError('Your session has ended. Reload to sign in again.')
        return
      }
      if (res === 'forbidden') { setError('Your account does not have this module.'); return }
      if (res == null) { setError('Could not refresh. Retrying…'); return }
      setData(res)
      setUpdatedAt(Date.now())
      setError(null)
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [expired])

  useEffect(() => {
    if (expired) return
    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer) return
      timer = setInterval(() => { void tick() }, intervalMs)
    }
    const stop = () => {
      if (!timer) return
      clearInterval(timer)
      timer = null
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { stop(); return }
      // Coming back to the tab: refresh at once rather than waiting out the interval,
      // so what's on screen is never stale by up to a full period.
      void tick()
      start()
    }

    if (document.visibilityState !== 'hidden') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [tick, intervalMs, expired])

  return { data, updatedAt, loading, error, expired, refresh: () => void tick() }
}

/** "just now" / "12s ago" / "3m ago" — how stale what you're looking at is. */
export function agoLabel(updatedAt: number | null, now: number): string {
  if (!updatedAt) return 'never'
  const secs = Math.max(0, Math.round((now - updatedAt) / 1000))
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}
