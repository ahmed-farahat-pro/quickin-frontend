'use client'

// Compact currency dropdown for the primary nav. On-brand: a small pill button
// (burgundy text on a tan field) that opens a menu of EGP/USD/EUR/GBP/SAR/AED.
// Picking one calls setCurrency, which persists it and re-formats prices
// app-wide. DISPLAY only — bookings stay EGP.
import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/lib/i18n/language-provider'
import { CURRENCIES, useCurrency } from '@/lib/currency/currency-provider'

const COLORS = {
  burgundy: '#5B0F16',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

export default function CurrencySwitcher() {
  const { t, lang } = useLanguage()
  const { currency, setCurrency } = useCurrency()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
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

  const isRtl = lang === 'ar'

  return (
    <div ref={ref} style={{ position: 'relative', flex: '0 0 auto' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('money.currency')}
        style={{
          appearance: 'none',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: FONT,
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1,
          padding: '7px 12px',
          borderRadius: 999,
          color: COLORS.burgundy,
          background: COLORS.tan,
          border: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        {currency}
        <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.7 }}>
          ▾
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t('money.currency')}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            insetInlineEnd: 0,
            zIndex: 1200,
            margin: 0,
            padding: 6,
            listStyle: 'none',
            minWidth: 168,
            background: '#fff',
            borderRadius: 16,
            border: '1px solid rgba(42,34,32,0.08)',
            boxShadow: '0 16px 40px rgba(42,34,32,0.18)',
          }}
        >
          {CURRENCIES.map((c) => {
            const active = c.code === currency
            return (
              <li key={c.code} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    setCurrency(c.code)
                    setOpen(false)
                  }}
                  style={{
                    appearance: 'none',
                    width: '100%',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    textAlign: isRtl ? 'right' : 'left',
                    fontFamily: FONT,
                    fontSize: 13.5,
                    fontWeight: active ? 800 : 600,
                    padding: '9px 12px',
                    borderRadius: 11,
                    border: 'none',
                    color: active ? COLORS.burgundy : COLORS.ink,
                    background: active ? 'rgba(91,15,22,0.08)' : 'transparent',
                  }}
                >
                  <span>{t(`currency.name.${c.code}`)}</span>
                  <span style={{ color: COLORS.muted, fontWeight: 700 }}>{c.code}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
