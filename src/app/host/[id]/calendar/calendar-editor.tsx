'use client'

// The host calendar: months of days, each showing what that night costs and
// whether it is still sellable, with an Airbnb-style selection on top —
//
//   • tap a day to add or remove it from the selection,
//   • press and drag across days to sweep a range in or out,
//   • the action bar at the bottom then prices, resets, blocks or opens
//     everything selected in one request.
//
// The prices shown are the host's RAW rates — the numbers they type and we pay
// them — with the guest-inclusive figure alongside, exactly like the price
// fields on the edit form. Booked days are inert: they can't be selected, so the
// action bar can never be pointed at a night a guest already holds.
//
// The server is the source of truth for what a day costs. After every save we
// take the calendar back from the response rather than patching state locally,
// so a day whose price came from the weekend rate or the base can never drift
// out of sync with the ladder that produced it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  MAX_DATES_PER_REQUEST,
  MAX_MONTHS_AHEAD,
  addDays,
  applySweep,
  checkDayPrice,
  chunkWindows,
  dayPriceMessage,
  expandRange,
  isDayEditable,
  monthDays,
  monthGrid,
  monthStart,
  selectionStats,
  sweepMode,
  toggleMonthSelection,
} from '@/lib/local/date-pricing-core'
import type { DayStatus, PriceSource, SweepMode } from '@/lib/local/date-pricing-core'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  line: 'rgba(91,15,22,0.10)',
  custom: '#8A5A00',
  danger: '#b3261e',
}
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

interface CalendarDay {
  date: string
  price: number
  guest_price?: number
  source: PriceSource
  status: DayStatus
  note?: string | null
}

interface CalendarPayload {
  listing_id: string
  currency: string
  commission_rate: number
  base_price: number
  start: string
  end: string
  days: CalendarDay[]
}

/** How many months to paint. The host pages forward, never past the horizon the
 *  API will accept anyway. */
const MONTHS_VISIBLE = 12

export function CalendarEditor({
  listingId,
  today,
  currency,
  initial,
}: {
  listingId: string
  /** Today in the listing's timezone, decided on the server — the client clock
   *  may be days off, and "you can't price the past" has to agree with the API. */
  today: string
  currency: string
  initial: CalendarPayload | null
}) {
  const t = useTranslations('hostPage.calendar')

  const [days, setDays] = useState<Record<string, CalendarDay>>(() => {
    const map: Record<string, CalendarDay> = {}
    for (const d of initial?.days ?? []) map[d.date] = d
    return map
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [priceInput, setPriceInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // What the server rendered. Fixed for the life of the component — it decides
  // where the background prefetch starts, so it must not move as windows arrive.
  const prefetchedThrough = initial?.end ?? today
  const commissionRate = initial?.commission_rate ?? 0

  // Drag state lives in a REF, with a state copy only for painting.
  //
  // `anchor` is the day the press started on; `mode` is decided at press time
  // from that day's current state, so a sweep either only adds or only removes —
  // dragging over a day twice must not flip it back and forth.
  //
  // The ref is what `endDrag` reads. Holding the sweep in state alone loses a
  // fast tap: pointerdown and pointerup can land in the same frame, and the
  // pointerup listener would still be the closure from the render before the
  // press, which sees no sweep at all and drops the day on the floor.
  const drag = useRef<{ anchor: string; mode: SweepMode; preview: Set<string> } | null>(null)
  const [dragView, setDragView] = useState<{ mode: SweepMode; days: Set<string> } | null>(null)

  const months = useMemo(
    () => Array.from({ length: MONTHS_VISIBLE }, (_, i) => monthStart(today, i)),
    [today]
  )

  const fmtMoney = useCallback(
    (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n),
    []
  )

  /** A day the host may act on. The past and booked nights are inert. */
  const isEditable = useCallback((date: string) => isDayEditable(date, days[date], today), [days, today])

  // ---- Loading -------------------------------------------------------------

  /** Pull a window from the API and merge it in. Called for months the host
   *  scrolls to that the first paint didn't cover. */
  const loadWindow = useCallback(
    async (start: string, end: string) => {
      try {
        const res = await fetch(
          `/api/local/listings/${listingId}/calendar?start=${start}&end=${end}`,
          { credentials: 'include', cache: 'no-store' }
        )
        if (!res.ok) return
        const payload = (await res.json()) as CalendarPayload
        setDays((prev) => {
          const next = { ...prev }
          for (const d of payload.days) next[d.date] = d
          return next
        })
      } catch {
        // A window that fails to load simply shows its days as unpriced; the
        // host can scroll away and back. Not worth an error banner.
      }
    },
    [listingId]
  )

  // Fetch the months beyond what the server rendered, in API-sized chunks.
  useEffect(() => {
    // The server already painted the first months; fetch from there to the end
    // of the visible year. chunkWindows returns [] when there is nothing left,
    // so a fully-prefetched calendar issues no requests at all.
    const last = monthDays(monthStart(today, MONTHS_VISIBLE - 1)).at(-1) as string
    const windows = chunkWindows(addDays(prefetchedThrough, 1), last, 120)
    let cancelled = false
    ;(async () => {
      for (const w of windows) {
        if (cancelled) return
        await loadWindow(w.start, w.end)
      }
    })()
    return () => {
      cancelled = true
    }
    // prefetchedThrough is the SERVER's window and never changes, so this runs
    // once; depending on the merged-in days would restart it on every window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, loadWindow])

  // ---- Selection -----------------------------------------------------------

  const beginDrag = useCallback(
    (date: string) => {
      if (!isEditable(date)) return
      const mode = sweepMode(selected, date)
      const preview = new Set([date])
      drag.current = { anchor: date, mode, preview }
      setDragView({ mode, days: preview })
    },
    [isEditable, selected]
  )

  const extendDrag = useCallback(
    (date: string) => {
      const d = drag.current
      if (!d) return
      const [from, to] = d.anchor <= date ? [d.anchor, date] : [date, d.anchor]
      let span: string[] = []
      try {
        span = expandRange(from, to)
      } catch {
        // Past the per-request cap. Keep the sweep where it was rather than
        // showing a selection the save would refuse.
        return
      }
      const preview = new Set(span.filter(isEditable))
      d.preview = preview
      setDragView({ mode: d.mode, days: preview })
    },
    [isEditable]
  )

  const endDrag = useCallback(() => {
    const d = drag.current
    drag.current = null
    setDragView(null)
    if (!d) return
    setSelected((prev) => applySweep(prev, d.preview, d.mode))
    setError(null)
  }, [])

  // A pointer released outside the grid still ends the sweep — otherwise the
  // next hover would keep painting a selection the host thought they'd finished.
  useEffect(() => {
    const up = () => endDrag()
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [endDrag])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setPriceInput('')
    setError(null)
  }, [])

  /** Select every remaining night of a month — the "whole of December" gesture,
   *  which is tedious to drag and is most of why hosts open this page. */
  const selectMonth = useCallback(
    (first: string) => {
      const editable = monthDays(first).filter(isEditable)
      setSelected((prev) => toggleMonthSelection(prev, editable))
      setError(null)
    },
    [isEditable]
  )

  // ---- Saving --------------------------------------------------------------

  const selectedDates = useMemo(() => [...selected].sort(), [selected])

  const save = useCallback(
    async (change: { price?: number | null; blocked?: boolean }) => {
      if (selectedDates.length === 0) return
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        const res = await fetch(`/api/local/listings/${listingId}/calendar`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dates: selectedDates, ...change }),
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(typeof payload.error === 'string' ? payload.error : t('errors.saveFailed'))
          return
        }
        // Take the days back from the server rather than patching locally: a
        // reset day's new price comes from the weekend/month/base ladder, which
        // only the server can evaluate.
        setDays((prev) => {
          const next = { ...prev }
          for (const d of payload.calendar?.days ?? []) next[d.date] = d
          return next
        })
        const skipped: { date: string }[] = payload.skipped ?? []
        setNotice(
          skipped.length > 0
            ? t('savedWithSkips', { count: payload.updated ?? 0, skipped: skipped.length })
            : t('saved', { count: payload.updated ?? 0 })
        )
        clearSelection()
      } catch {
        setError(t('errors.saveFailed'))
      } finally {
        setBusy(false)
      }
    },
    [selectedDates, listingId, t, clearSelection]
  )

  const applyPrice = useCallback(() => {
    const checked = checkDayPrice(priceInput)
    if (!checked.ok) {
      setError(dayPriceMessage(checked.problem))
      return
    }
    if (checked.value === null) {
      // An empty box with the "Set price" button is an unfinished thought, not a
      // reset — resetting has its own button, which says so.
      setError(t('errors.priceRequired'))
      return
    }
    void save({ price: checked.value })
  }, [priceInput, save, t])

  // What the action bar can offer: if nothing selected is blocked, "Open" is
  // meaningless, and vice versa.
  const stats = useMemo(() => selectionStats(selectedDates, days), [selectedDates, days])

  const guestPreview = useMemo(() => {
    const checked = checkDayPrice(priceInput)
    if (!checked.ok || checked.value === null || commissionRate <= 0) return null
    // Mirrors withCommission(): mark up, then round UP to the nearest 10.
    const settled = Math.round(checked.value * (1 + commissionRate) * 100) / 100
    return Math.ceil(settled / 10) * 10
  }, [priceInput, commissionRate])

  // ---- Render --------------------------------------------------------------

  const weekdayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })
    // 2023-01-01 was a Sunday — a fixed anchor so the header can't shift with
    // the current date.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2023, 0, 1 + i))))
  }, [])

  /** What a day should LOOK like right now: mid-sweep, the days under the
   *  pointer preview the outcome; everything else shows its committed state. */
  const isShown = (date: string) => {
    if (dragView?.days.has(date)) return dragView.mode === 'add'
    return selected.has(date)
  }

  return (
    <div style={{ fontFamily: FONT, color: COLORS.ink }}>
      <Legend t={t} />

      <div
        style={{ display: 'grid', gap: 28, touchAction: 'pan-y' }}
        // Selecting text while sweeping across days looks broken and steals the
        // pointer events the grid needs.
        onDragStart={(e) => e.preventDefault()}
        // The sweep is driven by hit-testing what is under the pointer, not by
        // each cell's own enter event. On touch, the pointer stays bound to the
        // element that was pressed for the whole gesture, so the cells being
        // dragged over never get an enter event at all and the drag collapses
        // into a single-day tap. elementFromPoint has no such blind spot, and it
        // is the same code path for mouse and finger.
        onPointerMove={(e) => {
          if (!drag.current) return
          const under = document.elementFromPoint(e.clientX, e.clientY)
          const cell = under?.closest('[data-date]')
          const date = cell?.getAttribute('data-date')
          if (date) extendDrag(date)
        }}
      >
        {months.map((first) => {
          const label = new Intl.DateTimeFormat('en-US', {
            month: 'long', year: 'numeric', timeZone: 'UTC',
          }).format(new Date(`${first}T00:00:00Z`))
          return (
            <section key={first}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, margin: '0 0 10px' }}>
                <h2 style={{ margin: 0, fontFamily: '"Playfair Display", Georgia, serif', fontSize: 19, fontWeight: 700, color: COLORS.burgundy }}>
                  {label}
                </h2>
                <button
                  type="button"
                  onClick={() => selectMonth(first)}
                  style={{
                    background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer',
                    color: COLORS.burgundy, fontFamily: FONT, fontSize: 13, fontWeight: 600,
                  }}
                >
                  {t('selectMonth')}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                {weekdayNames.map((w) => (
                  <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {w}
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {monthGrid(first).map((date, i) =>
                  date === null ? (
                    <div key={`pad-${i}`} />
                  ) : (
                    <DayCell
                      key={date}
                      date={date}
                      day={days[date]}
                      selected={isShown(date)}
                      editable={isEditable(date)}
                      past={date < today}
                      currency={currency}
                      fmtMoney={fmtMoney}
                      onPointerDown={beginDrag}
                    />
                  )
                )}
              </div>
            </section>
          )
        })}
      </div>

      {/* Action bar — fixed, so the host never has to scroll back up after
          sweeping across three months to find the price box. */}
      {selectedDates.length > 0 && (
        <div
          role="region"
          aria-label={t('actionBar')}
          style={{
            position: 'sticky', bottom: 0, zIndex: 20, marginTop: 24,
            background: '#fff', border: `1px solid ${COLORS.line}`, borderRadius: 16,
            boxShadow: '0 -6px 24px rgba(42,34,32,0.10)', padding: '14px 16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14.5 }}>
              {t('nightsSelected', { count: stats.total })}
            </strong>
            <button
              type="button"
              onClick={clearSelection}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.muted, fontFamily: FONT, fontSize: 13, fontWeight: 600 }}
            >
              {t('clear')}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 10 }}>
            <div style={{ flex: '1 1 190px', minWidth: 160 }}>
              <label htmlFor="qk-day-price" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COLORS.muted, margin: '0 0 4px' }}>
                {t('priceLabel', { currency })}
              </label>
              <input
                id="qk-day-price"
                inputMode="decimal"
                value={priceInput}
                onChange={(e) => { setPriceInput(e.target.value); setError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') applyPrice() }}
                placeholder={t('pricePlaceholder')}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                  border: `1px solid ${COLORS.line}`, borderRadius: 10,
                  fontFamily: FONT, fontSize: 15, background: COLORS.cream, color: COLORS.ink,
                }}
              />
              {guestPreview !== null && (
                <p style={{ margin: '5px 0 0', fontSize: 12, color: COLORS.muted }}>
                  {t('guestsPay', { amount: fmtMoney(guestPreview), currency })}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 20 }}>
              <Action primary disabled={busy} onClick={applyPrice} label={busy ? t('saving') : t('setPrice')} />
              {stats.custom > 0 && (
                <Action disabled={busy} onClick={() => void save({ price: null })} label={t('resetPrice')} />
              )}
              {stats.blocked < stats.total && (
                <Action disabled={busy} onClick={() => void save({ blocked: true })} label={t('block')} />
              )}
              {stats.blocked > 0 && (
                <Action disabled={busy} onClick={() => void save({ blocked: false })} label={t('unblock')} />
              )}
            </div>
          </div>

          {error && <p style={{ margin: '10px 0 0', fontSize: 13.5, fontWeight: 600, color: COLORS.danger }}>{error}</p>}
        </div>
      )}

      {notice && !error && (
        <p aria-live="polite" style={{ margin: '16px 0 0', fontSize: 13.5, fontWeight: 600, color: COLORS.burgundy }}>
          {notice}
        </p>
      )}
      <p style={{ margin: '18px 0 0', fontSize: 12.5, color: COLORS.muted, lineHeight: 1.5 }}>
        {t('limits', { max: MAX_DATES_PER_REQUEST, months: MAX_MONTHS_AHEAD })}
      </p>
    </div>
  )
}

function Action({
  label, onClick, disabled, primary,
}: { label: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 14px', borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
        fontFamily: FONT, fontSize: 14, fontWeight: 700,
        border: primary ? 'none' : `1px solid ${COLORS.line}`,
        background: primary ? COLORS.burgundy : '#fff',
        color: primary ? '#fff' : COLORS.ink,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {label}
    </button>
  )
}

function DayCell({
  date, day, selected, editable, past, currency, fmtMoney, onPointerDown,
}: {
  date: string
  day: CalendarDay | undefined
  selected: boolean
  editable: boolean
  past: boolean
  currency: string
  fmtMoney: (n: number) => string
  onPointerDown: (date: string) => void
}) {
  const dayNum = Number(date.slice(8, 10))
  const booked = day?.status === 'booked'
  const blocked = day?.status === 'blocked'
  const custom = day?.source === 'custom'

  const background = selected
    ? COLORS.burgundy
    : booked || past
      ? 'rgba(42,34,32,0.05)'
      : blocked
        ? 'repeating-linear-gradient(135deg, #fff, #fff 5px, rgba(42,34,32,0.09) 5px, rgba(42,34,32,0.09) 10px)'
        : '#fff'

  return (
    <button
      type="button"
      // Pointer events rather than mouse: one code path covers touch drags on a
      // phone and mouse drags on a desktop.
      data-date={date}
      onPointerDown={(e) => {
        if (!editable) return
        // Don't let the browser start a text selection or a scroll from a press
        // that is about to become a sweep.
        e.preventDefault()
        onPointerDown(date)
      }}
      disabled={!editable}
      aria-pressed={selected}
      aria-label={`${date}${booked ? ' — booked' : blocked ? ' — blocked' : ''}${
        day ? ` — ${fmtMoney(day.price)} ${currency}` : ''
      }`}
      style={{
        aspectRatio: '1 / 1', minHeight: 58, padding: '5px 3px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
        border: `1px solid ${selected ? COLORS.burgundy : COLORS.line}`,
        borderRadius: 10, background, cursor: editable ? 'pointer' : 'default',
        fontFamily: FONT, color: selected ? '#fff' : past || booked ? COLORS.muted : COLORS.ink,
        // The sweep must not be interrupted by the browser deciding a drag is a
        // text selection or a scroll gesture.
        userSelect: 'none', touchAction: 'none',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>{dayNum}</span>
      {day && !past && (
        <span
          style={{
            fontSize: 10.5, lineHeight: 1.15, fontWeight: custom ? 700 : 500,
            color: selected ? 'rgba(255,255,255,0.92)' : custom ? COLORS.custom : COLORS.muted,
          }}
        >
          {fmtMoney(day.price)}
        </span>
      )}
      {booked && (
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: selected ? '#fff' : COLORS.muted }}>
          ●
        </span>
      )}
      {blocked && !booked && (
        <span style={{ fontSize: 9, fontWeight: 700, color: selected ? '#fff' : COLORS.muted }}>✕</span>
      )}
    </button>
  )
}

function Legend({ t }: { t: ReturnType<typeof useTranslations> }) {
  const item = (swatch: React.ReactNode, label: string) => (
    <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: COLORS.muted }}>
      {swatch}
      {label}
    </span>
  )
  const box = (style: React.CSSProperties) => (
    <span style={{ width: 14, height: 14, borderRadius: 4, border: `1px solid ${COLORS.line}`, display: 'inline-block', ...style }} />
  )
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '0 0 18px' }}>
      {item(box({ background: '#fff' }), t('legend.available'))}
      {item(<span style={{ color: COLORS.custom, fontWeight: 700, fontSize: 12.5 }}>1,500</span>, t('legend.custom'))}
      {item(
        box({ background: 'repeating-linear-gradient(135deg, #fff, #fff 4px, rgba(42,34,32,0.12) 4px, rgba(42,34,32,0.12) 8px)' }),
        t('legend.blocked')
      )}
      {item(box({ background: 'rgba(42,34,32,0.10)' }), t('legend.booked'))}
    </div>
  )
}
