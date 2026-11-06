'use client'

import * as React from 'react'
import { useLocale } from 'next-intl'
import type { DateRange, DayButton } from 'react-day-picker'
import { Calendar, CalendarDayButton } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  monthWindow,
  monthsToLoad,
  priceTone,
  unavailableDates,
  type GuestCalendarDay,
  type PriceTone,
} from '@/lib/local/booking-calendar-core'

// A boutique check-in / check-out range picker. Replaces the native <input type="date">
// across the listing booking card + explore search. Values are YYYY-MM-DD strings so it's a
// drop-in for the existing checkIn/checkOut state. Calendar is the burgundy-themed shadcn one;
// it shows 2 months on >=sm screens and 1 on mobile.
const BURGUNDY = '#5B0F16'
const INK = '#2A2220'
const MUTED = '#6B6055'
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'
// Nightly price colours, against the listing's base rate. Base nights stay quiet
// so the eye goes to the nights that differ.
const TONE: Record<PriceTone, string> = { lower: '#2E7D4F', base: MUTED, higher: BURGUNDY }

function toYmd(d?: Date): string {
  if (!d) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fromYmd(s?: string): Date | undefined {
  if (!s) return undefined
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

export interface DateRangePickerProps {
  checkIn: string
  checkOut: string
  onChange: (checkIn: string, checkOut: string) => void
  checkInLabel?: string
  checkOutLabel?: string
  placeholder?: string
  /** Earliest selectable day (defaults to today). */
  minDate?: Date
  /** Right-side hint shown in the popover footer, e.g. "3 nights". */
  nightsLabel?: (nights: number) => string
  clearLabel?: string
  doneLabel?: string
  /** When set, each day shows its nightly guest price from the listing's public
   *  calendar, and booked / blocked days can't be picked or crossed. */
  listingId?: string
  /** Formats a nightly price for a cell (currency conversion, no symbol). */
  formatNightPrice?: (amount: number) => string
  /** Footer note naming what the cell numbers are, e.g. "Nightly prices in EGP". */
  priceLegend?: string
  lowerLabel?: string
  higherLabel?: string
}

/** What each day cell needs to paint its price — via context, so the DayButton
 *  stays one stable component instead of being re-created every render. */
const NightPrices = React.createContext<{
  byDate: Map<string, GuestCalendarDay>
  base: number
  format: (amount: number) => string
} | null>(null)

function PriceDayButton({ children, ...props }: React.ComponentProps<typeof DayButton>) {
  const prices = React.useContext(NightPrices)
  const { day, modifiers } = props
  const night = prices?.byDate.get(toYmd(day.date))
  const show = !!prices && !!night && night.status === 'available' && !modifiers.disabled && !modifiers.outside
  // On a filled endpoint the price takes the cell's own (white) text colour.
  const filled = modifiers.range_start || modifiers.range_end ||
    (modifiers.selected && !modifiers.range_middle)
  const tone = show ? priceTone(night!.price, prices!.base) : 'base'
  return (
    <CalendarDayButton {...props}>
      {children}
      <span
        style={{
          fontSize: 9.5, lineHeight: 1, opacity: 1, letterSpacing: '-0.01em',
          fontWeight: tone === 'base' ? 500 : 700,
          color: filled ? 'inherit' : TONE[tone],
        }}
      >
        {show ? prices!.format(night!.price) : '\u00a0'}
      </span>
    </CalendarDayButton>
  )
}

export function DateRangePicker({
  checkIn, checkOut, onChange,
  checkInLabel = 'Check-in', checkOutLabel = 'Check-out', placeholder = 'Add date',
  minDate, nightsLabel, clearLabel = 'Clear', doneLabel = 'Done',
  listingId, formatNightPrice, priceLegend, lowerLabel = 'Lower', higherLabel = 'Higher',
}: DateRangePickerProps) {
  const locale = useLocale()
  const [open, setOpen] = React.useState(false)
  const [months, setMonths] = React.useState(1)

  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const apply = () => setMonths(mq.matches ? 2 : 1)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const today = React.useMemo(() => {
    const d = minDate ? new Date(minDate) : new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [minDate])

  const from = fromYmd(checkIn)
  const to = fromYmd(checkOut)

  // The first month on screen. Controlled, so prices can follow it; reset to the
  // chosen check-in (or today) each time the picker opens.
  const [month, setMonth] = React.useState<Date>(from || today)
  React.useEffect(() => {
    if (open) setMonth(from || today)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Nightly prices, one `YYYY-MM` month per request, kept for the life of the
  // page: paging back to a month already seen is instant.
  const [loaded, setLoaded] = React.useState<Record<string, GuestCalendarDay[]>>({})
  const [basePrice, setBasePrice] = React.useState(0)
  const requested = React.useRef<Set<string>>(new Set())

  React.useEffect(() => {
    if (!open || !listingId) return
    for (const key of monthsToLoad(month, months)) {
      const tag = `${listingId}:${key}`
      if (requested.current.has(tag)) continue
      requested.current.add(tag)
      const { start, end } = monthWindow(key)
      // No cookie: the listing's own host would otherwise get their RAW rates
      // back, and this calendar must show what a guest pays.
      fetch(`/api/local/listings/${listingId}/calendar?start=${start}&end=${end}`, { cache: 'no-store', credentials: 'omit' })
        .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
        .then((cal: { base_price?: number; days?: GuestCalendarDay[] }) => {
          if (!Array.isArray(cal?.days)) return
          setBasePrice(Number(cal.base_price) || 0)
          setLoaded((prev) => ({ ...prev, [tag]: cal.days! }))
        })
        // No prices is a plain calendar, never a broken one; the month is
        // asked for again the next time it comes on screen.
        .catch(() => requested.current.delete(tag))
    }
  }, [open, listingId, month, months])

  const byDate = React.useMemo(() => {
    const map = new Map<string, GuestCalendarDay>()
    for (const [tag, days] of Object.entries(loaded)) {
      if (!tag.startsWith(`${listingId}:`)) continue
      for (const d of days) map.set(d.date, d)
    }
    return map
  }, [loaded, listingId])

  const closedDays = React.useMemo(
    () => unavailableDates([...byDate.values()]).map((d) => fromYmd(d)!),
    [byDate]
  )
  const prices = React.useMemo(
    () => (listingId
      ? { byDate, base: basePrice, format: formatNightPrice ?? ((n: number) => Math.round(n).toLocaleString('en-US')) }
      : null),
    [listingId, byDate, basePrice, formatNightPrice]
  )
  const hasTones = React.useMemo(() => {
    const seen = new Set<PriceTone>()
    for (const d of byDate.values()) if (d.status === 'available') seen.add(priceTone(d.price, basePrice))
    return seen
  }, [byDate, basePrice])
  const range: DateRange | undefined = from ? { from, to } : undefined
  const nights = from && to ? Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000)) : 0
  const fmt = (d?: Date) => (d ? d.toLocaleDateString(locale, { month: 'short', day: 'numeric' }) : '')

  function cell(label: string, value: string) {
    return (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'start', minWidth: 0 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: value ? 600 : 400, color: value ? INK : '#a99e93', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {value || placeholder}
        </span>
      </span>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${checkInLabel} – ${checkOutLabel}`}
          style={{
            width: '100%', boxSizing: 'border-box', display: 'grid', gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center', gap: 10, padding: '8px 14px', minHeight: 52, background: '#fff',
            border: `1px solid ${open ? BURGUNDY : 'rgba(42,34,32,0.16)'}`, borderRadius: 14,
            cursor: 'pointer', fontFamily: FONT, textAlign: 'start',
            boxShadow: open ? `0 0 0 3px rgba(91,15,22,0.10)` : 'none', transition: 'border-color .15s, box-shadow .15s',
          }}
        >
          {cell(checkInLabel, fmt(from))}
          <span aria-hidden style={{ width: 1, height: 26, background: 'rgba(42,34,32,0.14)' }} />
          {cell(checkOutLabel, fmt(to))}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-auto p-0 overflow-hidden rounded-2xl border-[rgba(42,34,32,0.12)] shadow-xl">
        <NightPrices.Provider value={prices}>
          <Calendar
            mode="range"
            numberOfMonths={months}
            month={month}
            onMonthChange={setMonth}
            selected={range}
            disabled={[{ before: today }, ...closedDays]}
            // A stay can't straddle someone else's booking or a closed day.
            excludeDisabled={!!listingId}
            onSelect={(r: DateRange | undefined) => onChange(toYmd(r?.from), toYmd(r?.to))}
            {...(listingId && {
              className: '[--cell-size:--spacing(11)]',
              components: { DayButton: PriceDayButton },
            })}
          />
        </NightPrices.Provider>
        {listingId && byDate.size > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', padding: '0 14px 10px', fontFamily: FONT, fontSize: 11.5, color: MUTED }}>
            {priceLegend && <span>{priceLegend}</span>}
            {hasTones.has('lower') && <LegendDot color={TONE.lower} label={lowerLabel} />}
            {hasTones.has('higher') && <LegendDot color={TONE.higher} label={higherLabel} />}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderTop: '1px solid rgba(42,34,32,0.10)', fontFamily: FONT }}>
          <span style={{ fontSize: 13, color: MUTED }}>
            {nights > 0 ? (nightsLabel ? nightsLabel(nights) : `${nights} night${nights === 1 ? '' : 's'}`) : ''}
          </span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => onChange('', '')} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: '6px 8px' }}>{clearLabel}</button>
            <button type="button" onClick={() => setOpen(false)} style={{ background: BURGUNDY, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '8px 16px', fontFamily: FONT }}>{doneLabel}</button>
          </span>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: color }} />
      {label}
    </span>
  )
}
