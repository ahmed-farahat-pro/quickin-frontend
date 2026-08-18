import 'server-only'
import { cookies } from 'next/headers'
import {
  DISPLAY_CURRENCY_COOKIE,
  resolveDisplayCurrency,
  type DisplayCurrency,
} from '@/lib/local/currency-core'

/**
 * The display currency for this request — the `qk_currency` cookie, or EGP.
 * Mirrors `getRequestLocale()`; server components call it directly, client
 * components read the same value out of `DisplayCurrencyProvider`.
 */
export async function getRequestCurrency(): Promise<DisplayCurrency> {
  const cookieStore = await cookies()
  return resolveDisplayCurrency(cookieStore.get(DISPLAY_CURRENCY_COOKIE)?.value)
}
