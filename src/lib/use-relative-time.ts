'use client'

// Shared by the header notifications bell and the listing "Questions & comments"
// section (moved out of notifications-bell.tsx so both read times the same way).
import { useMemo } from 'react'

// Relative "2 hours ago" formatter bound to the active locale. Intl handles the
// en/ar/fr/es wording natively, so this needs no translation keys.
//   < 60s → "now" · < 60m → minutes · < 24h → hours · < 7d → days
//   older → short absolute date ("14 Mar"), with the year when it isn't this one.
// Returns '' for missing/unparseable dates so we never render "Invalid Date".
export function useRelativeTime(locale: string) {
  return useMemo(() => {
    const build = (tag: string | undefined) => ({
      rtf: new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }),
      sameYear: new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short' }),
      otherYear: new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric' }),
    })
    // Fall back to the runtime default if the locale tag is somehow unusable.
    let fmt: ReturnType<typeof build>
    try { fmt = build(locale) } catch { fmt = build(undefined) }

    // `now` is passed in rather than read from Date.now() so the caller controls
    // when the clock is sampled (client-only — see the `now` state below).
    return (iso: string | null | undefined, now: number): string => {
      if (!iso || !now) return ''
      const then = Date.parse(iso)
      if (!Number.isFinite(then)) return ''
      const sec = Math.round((now - then) / 1000)
      // Negative (clock skew / future-dated) also lands here and reads as "now".
      if (sec < 60) return fmt.rtf.format(0, 'second')
      if (sec < 3600) return fmt.rtf.format(-Math.floor(sec / 60), 'minute')
      if (sec < 86400) return fmt.rtf.format(-Math.floor(sec / 3600), 'hour')
      if (sec < 604800) return fmt.rtf.format(-Math.floor(sec / 86400), 'day')
      const d = new Date(then)
      const df = d.getFullYear() === new Date(now).getFullYear() ? fmt.sameYear : fmt.otherYear
      return df.format(d)
    }
  }, [locale])
}
