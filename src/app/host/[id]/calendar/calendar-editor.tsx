'use client'

// The host calendar: one month at a time on a phone, two side by side on a
// laptop, each day showing what that night costs and whether it is still
// sellable. Selection is "tap start, tap end" everywhere (rules and tests in
// calendar-selection-core.ts):
//
//   • tap a day, then another → the range between them is selected;
//   • tap the first day again → keep just that day;
//   • tap a selected day      → remove it;
//   • laptop extras: click-and-drag sweeps a range in or out, ⌘/Ctrl-click
//     toggles one day.
//
// Months page with the arrows, a swipe on touch, PageUp/PageDown, or the month
// title, which opens a picker for the whole horizon. The editor sits in a panel
// beside the calendar on a laptop and in a bottom sheet on a phone — same
// content, same actions.
//
// The prices shown are the host's RAW rates — the numbers they type and we pay
// them — with the guest-inclusive figure alongside. Booked days are inert. After
// every save the days come back from the server rather than being patched
// locally, so a day priced by the weekend rate or the base can never drift out
// of sync with the ladder that produced it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  MAX_DATES_PER_REQUEST,
  MAX_MONTHS_AHEAD,
  applySweep,
  checkDayPrice,
  dayPriceMessage,
  isDayEditable,
  monthDays,
  monthGrid,
  monthStart,
  selectionStats,
  sweepMode,
  toggleMonthSelection,
} from '@/lib/local/date-pricing-core'
import type { DayStatus, PriceSource, SweepMode } from '@/lib/local/date-pricing-core'
import {
  clampMonthOffset,
  priceSpan,
  rangeDays,
  runPosition,
  selectionRuns,
  swipeDirection,
  tapDay,
} from '@/lib/local/calendar-selection-core'

const COLORS = {
  burgundy: '#5B0F16',
  band: 'rgba(91,15,22,0.12)',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  line: 'rgba(91,15,22,0.12)',
  custom: '#8A5A00',
  danger: '#b3261e',
}
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'
const SERIF = '"Playfair Display", Georgia, serif'
const WIDE = '(min-width: 1024px)'

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

function lastDayOf(first: string): string {
  return monthDays(first).at(-1) as string
}

/** Two months side by side on a laptop, one on a phone. Starts false so the
 *  server render and the first client render agree. */
function useWide(): boolean {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(WIDE)
    const on = () => setWide(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

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
  const locale = useLocale()
  const wide = useWide()
  const visible = wide ? 2 : 1

  const [days, setDays] = useState<Record<string, CalendarDay>>(() => {
    const map: Record<string, CalendarDay> = {}
    for (const d of initial?.days ?? []) map[d.date] = d
    return map
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [priceInput, setPriceInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loadingMonths, setLoadingMonths] = useState<Set<string>>(new Set())
  const commissionRate = initial?.commission_rate ?? 0

  // ---- Formatting ------------------------------------------------------------

  const fmtMoney = useCallback(
    (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n),
    []
  )
  const fmtMonth = useCallback(
    (first: string, opts: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }) =>
      new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(new Date(`${first}T00:00:00Z`)),
    [locale]
  )
  const fmtDay = useCallback(
    (date: string) =>
      new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${date}T00:00:00Z`)
      ),
    [locale]
  )

  // ---- Paging ----------------------------------------------------------------

  const page = clampMonthOffset(offset, visible, MAX_MONTHS_AHEAD)
  const months = useMemo(
    () => Array.from({ length: 2 }, (_, i) => monthStart(today, page + i)),
    [today, page]
  )
  const goTo = useCallback(
    (to: number) => {
      setOffset(clampMonthOffset(to, visible, MAX_MONTHS_AHEAD))
      setPickerOpen(false)
    },
    [visible]
  )
  const canPrev = page > 0
  const canNext = page < clampMonthOffset(Infinity, visible, MAX_MONTHS_AHEAD)

  // ---- Loading ---------------------------------------------------------------

  // Months whose days we hold or are fetching. The server painted ~3 months; the
  // rest load as the host pages to them, one page ahead so the next tap of the
  // arrow already has prices on it.
  const [loadedSet] = useState(
    () =>
      new Set(
        Array.from({ length: MAX_MONTHS_AHEAD }, (_, i) => monthStart(today, i)).filter(
          (first) => initial && lastDayOf(first) <= initial.end
        )
      )
  )
  const loaded = useRef(loadedSet)

  useEffect(() => {
    const want = Array.from({ length: visible + 1 }, (_, i) => page + i)
      .filter((i) => i < MAX_MONTHS_AHEAD)
      .map((i) => monthStart(today, i))
      .filter((m) => !loaded.current.has(m))
    if (want.length === 0) return
    for (const m of want) loaded.current.add(m)
    setLoadingMonths((prev) => new Set([...prev, ...want]))
    const start = want[0] < today ? today : want[0]
    const end = lastDayOf(want[want.length - 1])
    ;(async () => {
      try {
        const res = await fetch(`/api/local/listings/${listingId}/calendar?start=${start}&end=${end}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(String(res.status))
        const payload = (await res.json()) as CalendarPayload
        setDays((prev) => {
          const next = { ...prev }
          for (const d of payload.days) next[d.date] = d
          return next
        })
      } catch {
        // Let a later visit retry; the days simply show without a price.
        for (const m of want) loaded.current.delete(m)
      } finally {
        setLoadingMonths((prev) => {
          const next = new Set(prev)
          for (const m of want) next.delete(m)
          return next
        })
      }
    })()
  }, [page, visible, today, listingId])

  // ---- Selection -------------------------------------------------------------

  const isEditable = useCallback((date: string) => isDayEditable(date, days[date], today), [days, today])

  // Laptop drag: a mouse press that moves onto another day becomes a sweep. A
  // press that doesn't move is an ordinary click, handled by onClick.
  const drag = useRef<{ from: string; mode: SweepMode; moved: boolean; preview: string[] } | null>(null)
  const [dragView, setDragView] = useState<{ mode: SweepMode; days: Set<string> } | null>(null)
  // A swipe or a drag ends with the browser firing a click on the day under the
  // pointer; that click must not also toggle the day.
  const swallowClickUntil = useRef(0)
  const touch = useRef<{ x: number; y: number; id: number } | null>(null)

  const onDayClick = useCallback(
    (date: string, e: React.MouseEvent) => {
      if (performance.now() < swallowClickUntil.current) return
      setError(null)
      setNotice(null)
      if (e.metaKey || e.ctrlKey) {
        setSelected((prev) => applySweep(prev, [date], prev.has(date) ? 'remove' : 'add'))
        setAnchor(null)
        return
      }
      const r = tapDay({ selected, anchor }, date, isEditable, MAX_DATES_PER_REQUEST)
      if (r.tooLong) {
        setError(t('errors.tooLong', { max: MAX_DATES_PER_REQUEST }))
        return
      }
      setSelected(r.selected)
      setAnchor(r.anchor)
    },
    [selected, anchor, isEditable, t]
  )

  const dayUnder = (x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest('[data-date]')?.getAttribute('data-date') ?? null

  const onGridPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return
      const date = dayUnder(e.clientX, e.clientY)
      if (!date || !isEditable(date)) return
      // Keep the browser from starting a text selection mid-sweep.
      e.preventDefault()
      drag.current = { from: date, mode: sweepMode(selected, date), moved: false, preview: [] }
    } else {
      touch.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    }
  }

  const onGridPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    const date = dayUnder(e.clientX, e.clientY)
    const d = drag.current
    if (d) {
      if (!date || (date === d.from && !d.moved)) return
      d.moved = true
      d.preview = rangeDays(d.from, date, isEditable, MAX_DATES_PER_REQUEST)
      setDragView({ mode: d.mode, days: new Set(d.preview) })
      return
    }
    // With a range half-made, show where it would end.
    if (anchor) setHover(date && isEditable(date) ? date : null)
  }

  const onGridPointerUp = (e: React.PointerEvent) => {
    const tch = touch.current
    if (tch && e.pointerId === tch.id) {
      touch.current = null
      const rtl = document.documentElement.dir === 'rtl'
      const dir = swipeDirection(e.clientX - tch.x, e.clientY - tch.y, rtl)
      if (dir) {
        swallowClickUntil.current = performance.now() + 400
        goTo(page + (dir === 'next' ? 1 : -1))
      }
    }
  }

  // The mouse may be released outside the grid; the sweep still ends.
  useEffect(() => {
    const up = () => {
      const d = drag.current
      drag.current = null
      if (!d) return
      setDragView(null)
      if (!d.moved) return
      swallowClickUntil.current = performance.now() + 400
      setSelected((prev) => applySweep(prev, d.preview, d.mode))
      setAnchor(null)
      setError(null)
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setAnchor(null)
    setHover(null)
    setPriceInput('')
    setError(null)
  }, [])

  /** "Select month" — a toggle: a month already fully selected is cleared. */
  const selectMonth = useCallback(
    (first: string) => {
      const editable = monthDays(first).filter(isEditable)
      setSelected((prev) => toggleMonthSelection(prev, editable))
      setAnchor(null)
      setError(null)
      setNotice(null)
    },
    [isEditable]
  )

  // Escape drops a half-made range first, then the whole selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pickerOpen) setPickerOpen(false)
        else if (anchor) { setAnchor(null); setHover(null) }
        else if (selected.size > 0 && !(e.target instanceof HTMLInputElement)) clearSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickerOpen, anchor, selected.size, clearSelection])

  // ---- Saving ----------------------------------------------------------------

  const selectedDates = useMemo(() => [...selected].sort(), [selected])
  const stats = useMemo(() => selectionStats(selectedDates, days), [selectedDates, days])
  const runs = useMemo(() => selectionRuns(selectedDates), [selectedDates])
  const span = useMemo(() => priceSpan(selectedDates, days), [selectedDates, days])

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
      // An empty box with "Set price" is an unfinished thought, not a reset —
      // resetting has its own button, which says so.
      setError(t('errors.priceRequired'))
      return
    }
    void save({ price: checked.value })
  }, [priceInput, save, t])

  const guestPreview = useMemo(() => {
    const checked = checkDayPrice(priceInput)
    if (!checked.ok || checked.value === null || commissionRate <= 0) return null
    // Mirrors withCommission(): mark up, then round UP to the nearest 10.
    const settled = Math.round(checked.value * (1 + commissionRate) * 100) / 100
    return Math.ceil(settled / 10) * 10
  }, [priceInput, commissionRate])

  // The success toast fades on its own; it isn't something to dismiss.
  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(id)
  }, [notice])

  // On a phone the sheet floats over the page; pad the page by its height so
  // the last week of the month can always be scrolled clear of it.
  const panelRef = useRef<HTMLDivElement>(null)
  const monthsRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const [sheetPad, setSheetPad] = useState(0)
  useEffect(() => {
    const el = panelRef.current
    if (!el || wide || selected.size === 0) {
      setSheetPad(0)
      return
    }
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight
      setSheetPad(h + 16)
      // Scroll just enough that the whole month sits above the sheet — never
      // past the month navigation, so the arrows stay on screen.
      const grid = monthsRef.current?.getBoundingClientRect()
      const nav = navRef.current?.getBoundingClientRect()
      if (!grid || !nav) return
      const hidden = grid.bottom - (window.innerHeight - h - 12)
      if (hidden > 0) window.scrollBy({ top: Math.min(hidden, Math.max(0, nav.top - 8)), behavior: 'smooth' })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [wide, selected.size])

  // ---- Render ----------------------------------------------------------------

  const weekdayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' })
    const long = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' })
    // 2023-01-01 was a Sunday — a fixed anchor so the header can't shift.
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.UTC(2023, 0, 1 + i))
      return { short: fmt.format(d), long: long.format(d) }
    })
  }, [locale])

  // What a day should LOOK like now: mid-drag, the swept days preview the
  // outcome; with a range half-made, the hovered span previews it.
  const hoverSpan = useMemo(
    () => (anchor && hover && !dragView ? new Set(rangeDays(anchor, hover, isEditable, MAX_DATES_PER_REQUEST)) : null),
    [anchor, hover, dragView, isEditable]
  )
  const shown = useMemo(() => {
    if (!dragView) return selected
    return applySweep(selected, dragView.days, dragView.mode)
  }, [selected, dragView])

  const navTitle = wide
    ? `${fmtMonth(months[0], { month: 'short', year: 'numeric' })} – ${fmtMonth(months[1], { month: 'short', year: 'numeric' })}`
    : fmtMonth(months[0])

  return (
    <div
      className="qkcal-root"
      style={{ fontFamily: FONT, color: COLORS.ink, paddingBottom: sheetPad }}
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement) return
        if (e.key === 'PageDown') { e.preventDefault(); goTo(page + 1) }
        if (e.key === 'PageUp') { e.preventDefault(); goTo(page - 1) }
      }}
    >
      <style>{CSS}</style>

      <div className="qkcal">
        <div style={{ minWidth: 0 }}>
          {/* ---- Month navigation ---- */}
          <div className="qkcal-nav" ref={navRef}>
            <NavButton label={t('prevMonth')} disabled={!canPrev} onClick={() => goTo(page - 1)} dir="prev" />
            <div style={{ position: 'relative', flex: '1 1 auto', display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                className="qkcal-title"
                aria-haspopup="dialog"
                aria-expanded={pickerOpen}
                aria-label={t('jumpToMonth')}
                onClick={() => setPickerOpen((o) => !o)}
              >
                <span>{navTitle}</span>
                <span aria-hidden style={{ fontSize: 12, opacity: 0.7, transform: pickerOpen ? 'rotate(180deg)' : undefined }}>▾</span>
              </button>
              {pickerOpen && (
                <MonthPicker
                  today={today}
                  page={page}
                  visible={visible}
                  days={days}
                  selected={selected}
                  fmtMonth={fmtMonth}
                  onPick={goTo}
                  onClose={() => setPickerOpen(false)}
                  label={t('jumpToMonth')}
                />
              )}
            </div>
            <NavButton label={t('nextMonth')} disabled={!canNext} onClick={() => goTo(page + 1)} dir="next" />
            <button type="button" className="qkcal-today" onClick={() => goTo(0)} disabled={page === 0}>
              {t('today')}
            </button>
          </div>

          <Legend t={t} />

          {/* ---- Months ---- */}
          <div
            className="qkcal-months"
            ref={monthsRef}
            onDragStart={(e) => e.preventDefault()}
            onPointerDown={onGridPointerDown}
            onPointerMove={onGridPointerMove}
            onPointerUp={onGridPointerUp}
            onPointerCancel={() => { touch.current = null }}
            onPointerLeave={() => setHover(null)}
          >
            {months.map((first, mi) => (
              <section key={first} className={mi === 1 ? 'qkcal-month qkcal-month-2' : 'qkcal-month'} aria-label={fmtMonth(first)}>
                <div className="qkcal-month-head">
                  <h2 className="qkcal-month-title">{fmtMonth(first)}</h2>
                  <button type="button" className="qkcal-link" onClick={() => selectMonth(first)}>
                    {monthDays(first).filter(isEditable).every((d) => selected.has(d)) && monthDays(first).some(isEditable)
                      ? t('unselectMonth')
                      : t('selectMonth')}
                  </button>
                </div>

                <div className="qkcal-grid" aria-hidden style={{ marginBottom: 2 }}>
                  {weekdayNames.map((w) => (
                    <div key={w.long} title={w.long} className="qkcal-wd">{w.short}</div>
                  ))}
                </div>

                <div className="qkcal-grid" data-loading={loadingMonths.has(first) || undefined}>
                  {monthGrid(first).map((date, i) =>
                    date === null ? (
                      <div key={`pad-${i}`} />
                    ) : (
                      <DayCell
                        key={date}
                        date={date}
                        day={days[date]}
                        position={runPosition(shown, date)}
                        pending={anchor === date}
                        previewed={hoverSpan?.has(date) ?? false}
                        editable={isEditable(date)}
                        past={date < today}
                        isToday={date === today}
                        currency={currency}
                        fmtMoney={fmtMoney}
                        onClick={onDayClick}
                      />
                    )
                  )}
                </div>
              </section>
            ))}
          </div>

          <p style={{ margin: '18px 0 0', fontSize: 12.5, color: COLORS.muted, lineHeight: 1.5 }}>
            {t('limits', { max: MAX_DATES_PER_REQUEST, months: MAX_MONTHS_AHEAD })}
          </p>
        </div>

        {/* ---- Editor: side panel on a laptop, bottom sheet on a phone ---- */}
        <aside
          ref={panelRef}
          className="qkcal-panel"
          data-empty={selected.size === 0}
          data-pending={anchor !== null || undefined}
          role="region"
          aria-label={t('actionBar')}
        >
          {selected.size === 0 ? (
            <div>
              <h3 style={{ margin: '0 0 8px', fontFamily: SERIF, fontSize: 19, color: COLORS.burgundy }}>{t('emptyTitle')}</h3>
              <ol style={{ margin: 0, paddingInlineStart: 18, listStyle: 'decimal', fontSize: 14, lineHeight: 1.6, color: COLORS.muted }}>
                <li>{t('howTo.start')}</li>
                <li>{t('howTo.end')}</li>
                <li>{t('howTo.price')}</li>
              </ol>
              <p style={{ margin: '12px 0 0', fontSize: 12.5, color: COLORS.muted, lineHeight: 1.5 }}>{t('howTo.desktop')}</p>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <strong style={{ fontSize: 15.5 }}>{t('nightsSelected', { count: stats.total })}</strong>
                <button type="button" className="qkcal-link" style={{ color: COLORS.muted }} onClick={clearSelection}>
                  {t('clear')}
                </button>
              </div>

              <p className="qkcal-runs">
                {runs.slice(0, 3).map((r) => (r.days === 1 ? fmtDay(r.start) : `${fmtDay(r.start)} – ${fmtDay(r.end)}`)).join(' · ')}
                {runs.length > 3 && ` · ${t('moreRanges', { count: runs.length - 3 })}`}
                {span && (
                  <>
                    <br />
                    <span>
                      {span.min === span.max
                        ? t('currently', { amount: fmtMoney(span.min), currency })
                        : t('currentlyRange', { min: fmtMoney(span.min), max: fmtMoney(span.max), currency })}
                    </span>
                  </>
                )}
              </p>

              {anchor && (
                <p className="qkcal-hint" aria-live="polite">{t('pendingHint', { date: fmtDay(anchor) })}</p>
              )}

              <div className="qkcal-editor">
              <label htmlFor="qk-day-price" className="qkcal-label">{t('priceLabel', { currency })}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="qk-day-price"
                  inputMode="numeric"
                  enterKeyHint="done"
                  autoComplete="off"
                  value={priceInput}
                  onChange={(e) => { setPriceInput(e.target.value); setError(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') applyPrice() }}
                  placeholder={span ? fmtMoney(span.min) : t('pricePlaceholder')}
                  className="qkcal-input"
                />
                <Action primary disabled={busy} onClick={applyPrice} label={busy ? t('saving') : t('setPrice')} />
              </div>
              {guestPreview !== null && (
                <p style={{ margin: '5px 0 0', fontSize: 12.5, color: COLORS.muted }}>
                  {t('guestsPay', { amount: fmtMoney(guestPreview), currency })}
                </p>
              )}

              {(stats.custom > 0 || stats.blocked < stats.total || stats.blocked > 0) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
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
              )}
              </div>

              {error && <p role="alert" style={{ margin: '10px 0 0', fontSize: 13.5, fontWeight: 600, color: COLORS.danger }}>{error}</p>}
            </div>
          )}
        </aside>
      </div>

      {notice && (
        <div role="status" aria-live="polite" className="qkcal-toast">{notice}</div>
      )}
    </div>
  )
}

// ---- Pieces -----------------------------------------------------------------

function NavButton({ label, onClick, disabled, dir }: { label: string; onClick: () => void; disabled: boolean; dir: 'prev' | 'next' }) {
  return (
    <button type="button" className="qkcal-arrow" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <svg className="qkcal-chev" width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {dir === 'prev' ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
      </svg>
    </button>
  )
}

function MonthPicker({
  today, page, visible, days, selected, fmtMonth, onPick, onClose, label,
}: {
  today: string
  page: number
  visible: number
  days: Record<string, CalendarDay>
  selected: ReadonlySet<string>
  fmtMonth: (first: string, opts?: Intl.DateTimeFormatOptions) => string
  onPick: (offset: number) => void
  onClose: () => void
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest?.('.qkcal-title')) onClose()
    }
    window.addEventListener('pointerdown', away)
    ref.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus()
    return () => window.removeEventListener('pointerdown', away)
  }, [onClose])

  // Which months carry custom prices or part of the selection — a dot each, so
  // the picker doubles as an overview of the year.
  const marks = useMemo(() => {
    const custom = new Set<string>()
    const sel = new Set<string>()
    for (const d of Object.values(days)) if (d.source === 'custom' && d.date >= today) custom.add(d.date.slice(0, 7))
    for (const d of selected) sel.add(d.slice(0, 7))
    return { custom, sel }
  }, [days, selected, today])

  const all = Array.from({ length: MAX_MONTHS_AHEAD }, (_, i) => ({ i, first: monthStart(today, i) }))
  const years = [...new Set(all.map((m) => m.first.slice(0, 4)))]

  return (
    <div ref={ref} role="dialog" aria-label={label} className="qkcal-picker">
      {years.map((y) => (
        <div key={y}>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, margin: '6px 4px' }}>{y}</div>
          <div className="qkcal-picker-grid">
            {all.filter((m) => m.first.startsWith(y)).map(({ i, first }) => {
              const onPage = i >= page && i < page + visible
              const key = first.slice(0, 7)
              return (
                <button
                  key={first}
                  type="button"
                  aria-current={onPage || undefined}
                  className="qkcal-picker-month"
                  data-on={onPage || undefined}
                  onClick={() => onPick(i)}
                >
                  {fmtMonth(first, { month: 'short' })}
                  <span className="qkcal-picker-dots" aria-hidden>
                    {marks.sel.has(key) && <i style={{ background: onPage ? '#fff' : COLORS.burgundy }} />}
                    {marks.custom.has(key) && <i style={{ background: onPage ? '#F3C66B' : COLORS.custom }} />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function Action({
  label, onClick, disabled, primary,
}: { label: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={primary ? 'qkcal-btn qkcal-btn-primary' : 'qkcal-btn'}>
      {label}
    </button>
  )
}

function compact(n: number, fmtMoney: (n: number) => string): string {
  // Six-digit nightly rates don't fit a phone-width cell; 125,000 → 125k.
  return n >= 100_000 ? `${fmtMoney(Math.round(n / 1000))}k` : fmtMoney(n)
}

function DayCell({
  date, day, position, pending, previewed, editable, past, isToday, currency, fmtMoney, onClick,
}: {
  date: string
  day: CalendarDay | undefined
  position: ReturnType<typeof runPosition>
  pending: boolean
  previewed: boolean
  editable: boolean
  past: boolean
  isToday: boolean
  currency: string
  fmtMoney: (n: number) => string
  onClick: (date: string, e: React.MouseEvent) => void
}) {
  const dayNum = Number(date.slice(8, 10))
  const booked = day?.status === 'booked'
  const blocked = day?.status === 'blocked'
  const custom = day?.source === 'custom'
  const solid = position === 'single' || position === 'start' || position === 'end'

  return (
    <div className={`qkcal-cell${position ? ` qkcal-band-${position}` : ''}`}>
      <button
        type="button"
        data-date={date}
        data-state={solid ? 'solid' : position === 'middle' ? 'band' : previewed ? 'preview' : blocked ? 'blocked' : booked || past ? 'inert' : 'open'}
        data-pending={pending || undefined}
        data-today={isToday || undefined}
        disabled={!editable}
        aria-pressed={position !== null}
        aria-label={`${date}${booked ? ' — booked' : blocked ? ' — blocked' : ''}${custom ? ' — custom price' : ''}${
          day && !past ? ` — ${fmtMoney(day.price)} ${currency}` : ''
        }`}
        onClick={(e) => onClick(date, e)}
        className="qkcal-day"
      >
        <span className="qkcal-num">{dayNum}</span>
        {day && !past && !booked && (
          <span className="qkcal-price" data-custom={custom || undefined} data-blocked={blocked || undefined}>
            {compact(day.price, fmtMoney)}
          </span>
        )}
        {booked && <span className="qkcal-tag">●</span>}
        {custom && !past && !booked && <span className="qkcal-dot" aria-hidden />}
      </button>
    </div>
  )
}

function Legend({ t }: { t: ReturnType<typeof useTranslations> }) {
  const box = (cls: string) => <span className={`qkcal-swatch ${cls}`} />
  return (
    <div className="qkcal-legend">
      <span>{box('')}{t('legend.available')}</span>
      <span><b style={{ color: COLORS.custom }}>1,500</b>{t('legend.custom')}</span>
      <span>{box('qkcal-swatch-selected')}{t('legend.selected')}</span>
      <span>{box('qkcal-swatch-blocked')}{t('legend.blocked')}</span>
      <span>{box('qkcal-swatch-booked')}{t('legend.booked')}</span>
    </div>
  )
}

// ---- Styles ------------------------------------------------------------------
// Plain CSS rather than inline styles: the layout switches at a breakpoint and
// the range band needs :dir-aware gradients, neither of which inline styles do.

const CSS = `
.qkcal { display: grid; gap: 24px; }
.qkcal-nav { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; }
.qkcal-arrow {
  width: 44px; height: 44px; flex: 0 0 44px; border-radius: 999px; display: grid; place-items: center;
  border: 1px solid ${COLORS.line}; background: #fff; color: ${COLORS.burgundy}; cursor: pointer;
  transition: background .15s, transform .1s;
}
.qkcal-arrow:hover:not(:disabled) { background: ${COLORS.tan}; }
.qkcal-arrow:active:not(:disabled) { transform: scale(.94); }
.qkcal-arrow:disabled { opacity: .35; cursor: default; }
[dir="rtl"] .qkcal-chev { transform: scaleX(-1); }
.qkcal-title {
  display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px; border-radius: 12px;
  border: none; background: transparent; cursor: pointer; color: ${COLORS.burgundy};
  font-family: ${SERIF}; font-size: 20px; font-weight: 700;
}
.qkcal-title:hover { background: rgba(91,15,22,0.06); }
.qkcal-today {
  min-height: 36px; padding: 0 12px; border-radius: 999px; border: 1px solid ${COLORS.line}; background: #fff;
  font: 600 13px ${FONT}; color: ${COLORS.ink}; cursor: pointer;
}
.qkcal-today:disabled { opacity: .45; cursor: default; }
.qkcal-picker {
  position: absolute; top: calc(100% + 6px); z-index: 50; width: min(340px, calc(100vw - 32px));
  background: #fff; border: 1px solid ${COLORS.line}; border-radius: 16px; padding: 10px;
  box-shadow: 0 12px 36px rgba(42,34,32,0.18); max-height: 70vh; overflow: auto;
}
.qkcal-picker-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.qkcal-picker-month {
  position: relative; min-height: 44px; border-radius: 10px; border: 1px solid ${COLORS.line}; background: #fff;
  font: 600 13.5px ${FONT}; color: ${COLORS.ink}; cursor: pointer;
}
.qkcal-picker-month:hover { background: ${COLORS.cream}; }
.qkcal-picker-month[data-on] { background: ${COLORS.burgundy}; border-color: ${COLORS.burgundy}; color: #fff; }
.qkcal-picker-dots { position: absolute; inset-inline: 0; bottom: 5px; display: flex; justify-content: center; gap: 3px; }
.qkcal-picker-dots i { width: 5px; height: 5px; border-radius: 99px; }

.qkcal-legend { display: flex; gap: 6px 16px; flex-wrap: wrap; margin: 0 0 16px; font-size: 12.5px; color: ${COLORS.muted}; }
.qkcal-legend > span { display: inline-flex; align-items: center; gap: 6px; }
.qkcal-swatch { width: 14px; height: 14px; border-radius: 4px; border: 1px solid ${COLORS.line}; background: #fff; display: inline-block; }
.qkcal-swatch-selected { background: ${COLORS.burgundy}; border-color: ${COLORS.burgundy}; }
.qkcal-swatch-blocked { background: repeating-linear-gradient(135deg, #fff, #fff 3px, rgba(42,34,32,0.18) 3px, rgba(42,34,32,0.18) 6px); }
.qkcal-swatch-booked { background: rgba(42,34,32,0.10); }

.qkcal-months { display: grid; gap: 28px; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
.qkcal-month-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 8px; min-height: 32px; }
.qkcal-month-title { margin: 0; font-family: ${SERIF}; font-size: 18px; font-weight: 700; color: ${COLORS.burgundy}; }
.qkcal-link {
  background: none; border: none; padding: 6px 4px; cursor: pointer; color: ${COLORS.burgundy};
  font: 600 13px ${FONT}; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: rgba(91,15,22,0.3);
}
.qkcal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); row-gap: 4px; }
.qkcal-grid[data-loading] .qkcal-day { animation: qkcal-pulse 1.2s ease-in-out infinite; }
@keyframes qkcal-pulse { 50% { opacity: .55; } }
.qkcal-wd { text-align: center; font-size: 11.5px; font-weight: 700; color: ${COLORS.muted}; padding: 4px 0; }

/* A selected run is drawn as one band behind its days; its ends are solid. */
.qkcal-cell { padding: 0 2px; }
.qkcal-band-middle { background: ${COLORS.band}; }
.qkcal-band-start { background: linear-gradient(to right, transparent 50%, ${COLORS.band} 50%); }
.qkcal-band-end { background: linear-gradient(to left, transparent 50%, ${COLORS.band} 50%); }
[dir="rtl"] .qkcal-band-start { background: linear-gradient(to left, transparent 50%, ${COLORS.band} 50%); }
[dir="rtl"] .qkcal-band-end { background: linear-gradient(to right, transparent 50%, ${COLORS.band} 50%); }
.qkcal-grid > .qkcal-cell:nth-child(7n+1).qkcal-band-middle { border-start-start-radius: 12px; border-end-start-radius: 12px; }
.qkcal-grid > .qkcal-cell:nth-child(7n).qkcal-band-middle,
.qkcal-grid > .qkcal-cell:last-child.qkcal-band-middle { border-start-end-radius: 12px; border-end-end-radius: 12px; }
.qkcal-grid > div:not(.qkcal-cell) + .qkcal-cell.qkcal-band-middle,
.qkcal-grid > .qkcal-cell:first-child.qkcal-band-middle { border-start-start-radius: 12px; border-end-start-radius: 12px; }

.qkcal-day {
  position: relative; width: 100%; aspect-ratio: 1 / 1; min-height: 46px; padding: 4px 2px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  border: 1px solid ${COLORS.line}; border-radius: 12px; background: #fff; color: ${COLORS.ink};
  font-family: ${FONT}; cursor: pointer; touch-action: pan-y; -webkit-tap-highlight-color: transparent;
  transition: background .12s, border-color .12s, transform .08s;
}
.qkcal-day:hover:not(:disabled) { border-color: ${COLORS.burgundy}; }
.qkcal-day:active:not(:disabled) { transform: scale(.95); }
.qkcal-day:focus-visible { outline: 2px solid ${COLORS.burgundy}; outline-offset: 2px; }
.qkcal-day:disabled { cursor: default; }
.qkcal-day[data-state="inert"] { background: rgba(42,34,32,0.05); color: ${COLORS.muted}; border-color: transparent; }
.qkcal-day[data-state="blocked"] { background: repeating-linear-gradient(135deg, #fff, #fff 5px, rgba(42,34,32,0.09) 5px, rgba(42,34,32,0.09) 10px); }
.qkcal-day[data-state="band"] { background: transparent; border-color: transparent; color: ${COLORS.burgundy}; }
.qkcal-day[data-state="preview"] { background: ${COLORS.band}; border: 1px dashed ${COLORS.burgundy}; }
.qkcal-day[data-state="solid"] { background: ${COLORS.burgundy}; border-color: ${COLORS.burgundy}; color: #fff; }
.qkcal-day[data-pending] { box-shadow: 0 0 0 2px #fff, 0 0 0 4px ${COLORS.burgundy}; animation: qkcal-ring 1.4s ease-in-out infinite; }
@keyframes qkcal-ring { 50% { box-shadow: 0 0 0 2px #fff, 0 0 0 6px rgba(91,15,22,0.35); } }
.qkcal-num { font-size: 13.5px; font-weight: 700; line-height: 1; }
.qkcal-day[data-today]:not([data-state="solid"]) { box-shadow: inset 0 0 0 2px rgba(91,15,22,0.45); }
.qkcal-day[data-today] .qkcal-num { color: ${COLORS.burgundy}; }
.qkcal-day[data-today][data-state="solid"] .qkcal-num { color: #fff; }
.qkcal-price { font-size: 10.5px; line-height: 1.1; font-weight: 500; color: ${COLORS.muted}; font-variant-numeric: tabular-nums; }
.qkcal-price[data-custom] { color: ${COLORS.custom}; font-weight: 800; }
.qkcal-price[data-blocked] { text-decoration: line-through; }
.qkcal-day[data-state="solid"] .qkcal-price { color: rgba(255,255,255,0.92); }
.qkcal-day[data-state="band"] .qkcal-price { color: ${COLORS.burgundy}; }
.qkcal-tag { font-size: 9px; color: ${COLORS.muted}; }
.qkcal-dot { position: absolute; top: 5px; inset-inline-end: 5px; width: 6px; height: 6px; border-radius: 99px; background: ${COLORS.custom}; }
.qkcal-day[data-state="solid"] .qkcal-dot { background: #F3C66B; }

.qkcal-panel { background: #fff; border: 1px solid ${COLORS.line}; border-radius: 18px; padding: 18px; box-shadow: 0 8px 28px rgba(42,34,32,0.08); }
.qkcal-runs { margin: 6px 0 12px; font-size: 13px; color: ${COLORS.muted}; line-height: 1.5; }
.qkcal-hint { margin: 0 0 12px; padding: 8px 10px; border-radius: 10px; background: ${COLORS.cream}; font-size: 12.5px; color: ${COLORS.ink}; line-height: 1.45; }
.qkcal-label { display: block; font-size: 12px; font-weight: 700; color: ${COLORS.muted}; margin: 0 0 4px; }
.qkcal-input {
  flex: 1 1 auto; min-width: 0; box-sizing: border-box; padding: 0 12px; height: 46px; border: 1px solid ${COLORS.line};
  border-radius: 12px; font: 600 16px ${FONT}; background: ${COLORS.cream}; color: ${COLORS.ink};
}
.qkcal-input:focus { outline: 2px solid ${COLORS.burgundy}; outline-offset: 0; }
.qkcal-btn {
  min-height: 46px; padding: 0 16px; border-radius: 12px; cursor: pointer; font: 700 14px ${FONT};
  border: 1px solid ${COLORS.line}; background: #fff; color: ${COLORS.ink}; white-space: nowrap;
}
.qkcal-btn:hover:not(:disabled) { background: ${COLORS.cream}; }
.qkcal-btn-primary { border: none; background: ${COLORS.burgundy}; color: #fff; }
.qkcal-btn-primary:hover:not(:disabled) { background: #470b11; }
.qkcal-btn:disabled { opacity: .55; cursor: default; }
.qkcal-toast {
  position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(24px + env(safe-area-inset-bottom)); z-index: 60;
  background: ${COLORS.ink}; color: #fff; padding: 12px 18px; border-radius: 12px; font-size: 14px; font-weight: 600;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2); max-width: calc(100vw - 32px);
}

@media (min-width: 1024px) {
  .qkcal { grid-template-columns: minmax(0, 1fr) 320px; align-items: start; }
  .qkcal-months { grid-template-columns: 1fr 1fr; column-gap: 32px; }
  .qkcal-panel { position: sticky; top: 24px; }
  .qkcal-day { min-height: 54px; }
}
@media (max-width: 1023px) {
  .qkcal-month-2 { display: none; }
  .qkcal-month-title { display: none; }
  .qkcal-month-head { justify-content: flex-end; margin-bottom: 2px; }
  .qkcal-panel {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; max-height: 62vh; overflow: auto;
    border-radius: 20px 20px 0 0; border-bottom: none; padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
    box-shadow: 0 -10px 30px rgba(42,34,32,0.16);
  }
  .qkcal-panel[data-empty="true"] { display: none; }
  .qkcal-panel[data-pending] .qkcal-editor, .qkcal-panel[data-pending] .qkcal-runs { display: none; }
  .qkcal-panel[data-pending] .qkcal-hint { margin: 8px 0 0; }
  .qkcal-panel::before { content: ""; display: block; width: 38px; height: 4px; border-radius: 99px; background: rgba(42,34,32,0.18); margin: -4px auto 10px; }
  .qkcal-runs { margin: 2px 0 8px; }
  .qkcal-toast { bottom: calc(16px + env(safe-area-inset-bottom)); }
}
@media (max-width: 380px) {
  .qkcal-today { display: none; }
  .qkcal-title { font-size: 18px; padding: 0 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .qkcal-day, .qkcal-arrow { transition: none; }
  .qkcal-day[data-pending], .qkcal-grid[data-loading] .qkcal-day { animation: none; }
}
`
