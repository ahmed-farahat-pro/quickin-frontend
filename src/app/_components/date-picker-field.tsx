'use client'

// A small, dependency-free date picker — a themed month-calendar popover that
// replaces the native <input type="date">. Emits/consumes the same ISO
// "YYYY-MM-DD" string the rest of the app already uses, so it's a drop-in.
//
// Boutique theme baked in (burgundy #5B0F16, cream #F6F1E6, tan #EFE6D8). Closes
// on outside-click and Escape; keyboard-reachable trigger. Kept intentionally
// light: one month view with prev/next arrows.
import { useEffect, useId, useRef, useState } from 'react'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Parse "YYYY-MM-DD" into a local Date (noon avoids any DST edge near midnight).
function parseISO(value: string): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
  return Number.isNaN(d.getTime()) ? null : d
}

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0)
}

function prettyLabel(value: string): string {
  const d = parseISO(value)
  if (!d) return ''
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export interface DatePickerFieldProps {
  value: string
  onChange: (iso: string) => void
  label?: string
  placeholder?: string
  /** Earliest selectable date as ISO; days before it are disabled. */
  min?: string
  ariaLabel?: string
  /** When true, render a compact trigger (used inside narrow cards). */
  compact?: boolean
}

export default function DatePickerField({
  value,
  onChange,
  label,
  placeholder = 'Add date',
  min,
  ariaLabel,
  compact = false,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false)
  const selected = parseISO(value)
  const minDate = min ? parseISO(min) : null
  // The month currently displayed in the popover.
  const [view, setView] = useState<Date>(() => selected || minDate || new Date())
  const rootRef = useRef<HTMLDivElement | null>(null)
  const popId = useId()

  // Re-sync the displayed month when the value changes from outside while closed.
  useEffect(() => {
    if (!open && selected) setView(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Outside-click + Escape to close.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle() {
    setView(selected || minDate || new Date())
    setOpen((v) => !v)
  }

  function pick(d: Date) {
    onChange(toISO(d))
    setOpen(false)
  }

  // Build the calendar grid for the viewed month (leading blanks + days).
  const year = view.getFullYear()
  const month = view.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = startOfDay(new Date())
  const minStart = minDate ? startOfDay(minDate) : null

  const cells: (Date | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d, 12, 0, 0))

  const display = value ? prettyLabel(value) : ''

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {label && (
        <span
          style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: COLORS.muted,
            marginBottom: 6,
          }}
        >
          {label}
        </span>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel || label || 'Choose date'}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: compact ? '10px 12px' : '11px 14px',
          fontSize: 14,
          fontFamily: FONT,
          fontWeight: display ? 600 : 400,
          color: display ? COLORS.ink : COLORS.muted,
          background: '#fff',
          border: open
            ? `1px solid ${COLORS.burgundy}`
            : '1px solid rgba(42,34,32,0.14)',
          borderRadius: compact ? 12 : 14,
          outline: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'border-color 0.15s ease',
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={COLORS.burgundy}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flex: '0 0 auto' }}
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {display || placeholder}
        </span>
      </button>

      {open && (
        <div
          id={popId}
          role="dialog"
          aria-label={ariaLabel || label || 'Choose date'}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 60,
            width: 288,
            maxWidth: 'min(288px, calc(100vw - 32px))',
            background: '#fff',
            borderRadius: 18,
            border: '1px solid rgba(42,34,32,0.08)',
            boxShadow: '0 18px 44px rgba(42,34,32,0.20)',
            padding: 16,
            fontFamily: FONT,
          }}
        >
          {/* Month header with prev / next */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <NavBtn
              label="Previous month"
              onClick={() => setView(new Date(year, month - 1, 1, 12))}
              dir="left"
            />
            <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.ink }}>
              {MONTHS[month]} {year}
            </span>
            <NavBtn
              label="Next month"
              onClick={() => setView(new Date(year, month + 1, 1, 12))}
              dir="right"
            />
          </div>

          {/* Weekday header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 2,
              marginBottom: 4,
            }}
          >
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                style={{
                  textAlign: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  color: COLORS.muted,
                  padding: '4px 0',
                }}
              >
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 2,
            }}
          >
            {cells.map((d, i) => {
              if (!d) return <div key={`b-${i}`} />
              const isSelected = selected ? sameDay(d, selected) : false
              const isToday = sameDay(d, today)
              const disabled = minStart ? startOfDay(d) < minStart : false
              return (
                <button
                  key={toISO(d)}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(d)}
                  aria-pressed={isSelected}
                  style={{
                    appearance: 'none',
                    border: isToday && !isSelected
                      ? `1px solid ${COLORS.burgundy}`
                      : '1px solid transparent',
                    borderRadius: 10,
                    height: 34,
                    fontSize: 13.5,
                    fontFamily: FONT,
                    fontWeight: isSelected ? 700 : 500,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    color: disabled
                      ? 'rgba(42,34,32,0.28)'
                      : isSelected
                        ? '#fff'
                        : COLORS.ink,
                    background: isSelected ? COLORS.burgundy : 'transparent',
                    opacity: disabled ? 0.6 : 1,
                    transition: 'background 0.12s ease, color 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!disabled && !isSelected)
                      e.currentTarget.style.background = COLORS.tan
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          {/* Footer: clear */}
          {value && (
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid rgba(42,34,32,0.08)',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                style={{
                  appearance: 'none',
                  border: 'none',
                  background: 'transparent',
                  color: COLORS.burgundy,
                  fontWeight: 700,
                  fontSize: 13,
                  fontFamily: FONT,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NavBtn({
  label,
  onClick,
  dir,
}: {
  label: string
  onClick: () => void
  dir: 'left' | 'right'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        appearance: 'none',
        width: 30,
        height: 30,
        borderRadius: 10,
        border: '1px solid rgba(42,34,32,0.10)',
        background: COLORS.cream,
        color: COLORS.burgundy,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 15,
        lineHeight: 1,
      }}
    >
      {dir === 'left' ? '‹' : '›'}
    </button>
  )
}
