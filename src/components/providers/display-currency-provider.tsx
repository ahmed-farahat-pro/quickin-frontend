'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DEFAULT_DISPLAY_CURRENCY,
  DISPLAY_CURRENCY_COOKIE,
  DISPLAY_CURRENCY_MAX_AGE,
  resolveDisplayCurrency,
  type DisplayCurrency,
} from '@/lib/local/currency-core'

interface DisplayCurrencyValue {
  currency: DisplayCurrency
  setCurrency: (next: DisplayCurrency) => void
}

const DisplayCurrencyContext = createContext<DisplayCurrencyValue>({
  currency: DEFAULT_DISPLAY_CURRENCY,
  setCurrency: () => {},
})

/**
 * Holds the currency prices are shown in. Seeded from the `qk_currency` cookie
 * in the root layout, so the first paint is already in the guest's currency.
 *
 * Switching writes the cookie and keeps the new value in state — client prices
 * change on the spot — then refreshes, which is what re-renders the server
 * components (`/saved`, `/reservations`, the listing page) that read the cookie
 * themselves. Without the local state those two would disagree for a beat.
 */
export function DisplayCurrencyProvider({
  initial,
  children,
}: {
  initial: DisplayCurrency
  children: React.ReactNode
}) {
  const router = useRouter()
  const [currency, setCurrencyState] = useState<DisplayCurrency>(initial)

  const setCurrency = useCallback(
    (next: DisplayCurrency) => {
      const resolved = resolveDisplayCurrency(next)
      if (resolved === currency) return
      document.cookie = `${DISPLAY_CURRENCY_COOKIE}=${resolved}; path=/; max-age=${DISPLAY_CURRENCY_MAX_AGE}; samesite=lax`
      setCurrencyState(resolved)
      router.refresh()
    },
    [currency, router],
  )

  const value = useMemo(
    () => ({ currency, setCurrency }),
    [currency, setCurrency],
  )

  return (
    <DisplayCurrencyContext.Provider value={value}>
      {children}
    </DisplayCurrencyContext.Provider>
  )
}

export function useDisplayCurrency(): DisplayCurrencyValue {
  return useContext(DisplayCurrencyContext)
}
