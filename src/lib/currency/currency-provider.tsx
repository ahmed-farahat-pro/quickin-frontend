'use client'

// Lightweight client-side multi-currency DISPLAY layer for QuickIn. Mirrors the
// language-provider pattern: a React context exposes { currency, setCurrency,
// format, rates } to any client component.
//
// What it does (and what it does NOT):
//   • EGP is the base — EVERY amount the backend returns is in EGP. This layer
//     only converts amounts for DISPLAY. It never changes what is sent to the
//     backend (bookings/payments stay EGP).
//   • format(amountEgp) → a localized string in the chosen currency, e.g.
//     "EGP 1,800" or "$36.54". Conversion is amountEgp * rates[currency].
//
// SSR safety / hydration:
//   • We ALWAYS render the default currency ('EGP') on the server AND on the
//     first client paint, so server and client markup match (no mismatch).
//   • After mount, an effect reads the persisted currency (localStorage) and
//     adopts it, then fetches the live rate table once and caches it.
//
// Persistence: the chosen currency is written to localStorage ('qk_currency').

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  FALLBACK_RATES,
  getCurrencies,
  type CurrencyCode,
  type CurrencyRates,
} from '@/lib/api'

const DEFAULT_CURRENCY: CurrencyCode = 'EGP'
const STORAGE_KEY = 'qk_currency'

// Display order for the switcher + the per-currency symbol/code and how many
// fraction digits to show. EGP reads as a whole-number code ("EGP 1,800");
// the foreign currencies show 2 decimals with their symbol.
export const CURRENCIES: {
  code: CurrencyCode
  symbol: string
  // Where the symbol sits relative to the number.
  position: 'prefix' | 'suffix'
  fractionDigits: number
}[] = [
  { code: 'EGP', symbol: 'EGP', position: 'prefix', fractionDigits: 0 },
  { code: 'USD', symbol: '$', position: 'prefix', fractionDigits: 2 },
  { code: 'EUR', symbol: '€', position: 'prefix', fractionDigits: 2 },
  { code: 'GBP', symbol: '£', position: 'prefix', fractionDigits: 2 },
  { code: 'SAR', symbol: 'SAR', position: 'prefix', fractionDigits: 2 },
  { code: 'AED', symbol: 'AED', position: 'prefix', fractionDigits: 2 },
]

const CURRENCY_BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]))

export const CURRENCY_CODES: CurrencyCode[] = CURRENCIES.map((c) => c.code)

function isCurrency(value: string | null | undefined): value is CurrencyCode {
  return !!value && CURRENCY_BY_CODE.has(value as CurrencyCode)
}

function readStoredCurrency(): CurrencyCode | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (isCurrency(raw)) return raw
  } catch {
    // ignore unavailable storage
  }
  return null
}

function persistCurrency(currency: CurrencyCode) {
  try {
    localStorage.setItem(STORAGE_KEY, currency)
  } catch {
    // ignore
  }
}

interface CurrencyContextValue {
  currency: CurrencyCode
  setCurrency: (currency: CurrencyCode) => void
  // The live (or fallback) rate table — exposed for the rare caller that needs
  // the raw multiplier rather than a formatted string.
  rates: CurrencyRates
  // Convert an EGP amount and format it in the chosen currency, e.g.
  // format(1800) → "EGP 1,800" (EGP) or "$36.54" (USD).
  format: (amountEgp: number) => string
  // Convert without formatting — the raw target-currency number.
  convert: (amountEgp: number) => number
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

// Build a formatter for the given currency/locale. Uses Intl when possible (for
// thousands separators) and falls back to a manual format on any failure.
function formatAmount(
  amountEgp: number,
  currency: CurrencyCode,
  rates: CurrencyRates
): string {
  const meta = CURRENCY_BY_CODE.get(currency) ?? CURRENCIES[0]
  const rate = rates.rates[currency] ?? FALLBACK_RATES.rates[currency] ?? 1
  const value = (Number(amountEgp) || 0) * rate
  let body: string
  try {
    body = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: meta.fractionDigits,
      maximumFractionDigits: meta.fractionDigits,
    }).format(value)
  } catch {
    body = value.toFixed(meta.fractionDigits)
  }
  return meta.position === 'prefix'
    ? `${meta.symbol}${meta.symbol.length > 1 ? ' ' : ''}${body}`
    : `${body} ${meta.symbol}`
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  // Start at the stable base so SSR and first client paint match.
  const [currency, setCurrencyState] = useState<CurrencyCode>(DEFAULT_CURRENCY)
  const [rates, setRates] = useState<CurrencyRates>(FALLBACK_RATES)

  // After mount: adopt the persisted currency, then fetch the live rates once.
  useEffect(() => {
    const stored = readStoredCurrency()
    if (stored && stored !== currency) setCurrencyState(stored)
    const ac = new AbortController()
    getCurrencies(ac.signal).then((r) => {
      if (!ac.signal.aborted) setRates(r)
    })
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setCurrency = useCallback((next: CurrencyCode) => {
    setCurrencyState(next)
    persistCurrency(next)
  }, [])

  const format = useCallback(
    (amountEgp: number) => formatAmount(amountEgp, currency, rates),
    [currency, rates]
  )

  const convert = useCallback(
    (amountEgp: number) => {
      const rate = rates.rates[currency] ?? FALLBACK_RATES.rates[currency] ?? 1
      return (Number(amountEgp) || 0) * rate
    },
    [currency, rates]
  )

  const value = useMemo<CurrencyContextValue>(
    () => ({ currency, setCurrency, rates, format, convert }),
    [currency, setCurrency, rates, format, convert]
  )

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  )
}

// Hook for client components. Safe to call outside the provider — returns an
// EGP-only fallback so a stray usage never throws (and SSR stays stable).
export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext)
  if (ctx) return ctx
  return {
    currency: DEFAULT_CURRENCY,
    setCurrency: () => {},
    rates: FALLBACK_RATES,
    format: (amountEgp) => formatAmount(amountEgp, DEFAULT_CURRENCY, FALLBACK_RATES),
    convert: (amountEgp) => Number(amountEgp) || 0,
  }
}
