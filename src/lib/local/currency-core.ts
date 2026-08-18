// Display currency — the currency a guest *reads* prices in.
//
// A listing is priced by its host in one real currency (`listings.currency`,
// almost always EGP) and that is the currency a booking is charged in. This
// module only converts for display, so every converted figure is marked
// approximate and the charge currency is always still named next to it.
//
// No relative imports on purpose: `test/unit/currency-core.test.mjs` loads this
// file directly under `node --test`. See README → Testing.

/** Cookie the display currency lives in — same shape as `NEXT_LOCALE`. */
export const DISPLAY_CURRENCY_COOKIE = 'qk_currency'

/** One year, matching the locale cookie. */
export const DISPLAY_CURRENCY_MAX_AGE = 60 * 60 * 24 * 365

/**
 * The currency the platform prices and charges in. Rates below are quoted
 * against it, and it is the fallback whenever a conversion can't be made.
 */
export const BASE_CURRENCY = 'EGP'

/** What a guest can switch to. Egypt, then the markets its guests fly in from. */
export const DISPLAY_CURRENCIES = ['EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED'] as const

export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number]

/**
 * No cookie means EGP — the currency listings are priced in. Guessing from the
 * locale would quote an English-speaking guest in a currency nobody here
 * charges, so the default is the honest one and the switcher is the opt-in.
 */
export const DEFAULT_DISPLAY_CURRENCY: DisplayCurrency = 'EGP'

/** Symbol shown in the switcher. Short and unambiguous beats typographically pure. */
export const CURRENCY_SYMBOLS: Record<DisplayCurrency, string> = {
  EGP: 'E£',
  USD: '$',
  EUR: '€',
  GBP: '£',
  SAR: 'SR',
  AED: 'AED',
}

/**
 * How many EGP one unit of each currency is worth.
 *
 * PLACEHOLDER RATES. These are a hand-maintained snapshot, not a feed — they
 * drift the day after they are written. Override them per deploy without a
 * release by setting `NEXT_PUBLIC_FX_RATES_PER_EGP`, e.g.
 *
 *   NEXT_PUBLIC_FX_RATES_PER_EGP={"USD":49.10,"EUR":53.40}
 *
 * and replace this table with a real rate source before these numbers are ever
 * quoted as anything but an approximation. Nothing is charged off them: see the
 * file header.
 */
export const DEFAULT_EGP_PER_UNIT: Record<DisplayCurrency, number> = {
  EGP: 1,
  USD: 48.5,
  EUR: 53.0,
  GBP: 62.0,
  SAR: 12.93,
  AED: 13.2,
}

/** When `DEFAULT_EGP_PER_UNIT` was last written by hand. Shown to the guest. */
export const RATES_AS_OF = '2026-08-16'

export type RateTable = Record<string, number>

export function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return (
    typeof value === 'string' &&
    (DISPLAY_CURRENCIES as readonly string[]).includes(value)
  )
}

/**
 * Read a currency out of a cookie, a query string, or a form. Case and
 * whitespace are forgiving; anything unrecognised falls back to the default
 * rather than leaving prices in a currency with no rate.
 */
export function resolveDisplayCurrency(
  value: string | null | undefined,
): DisplayCurrency {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return isDisplayCurrency(code) ? code : DEFAULT_DISPLAY_CURRENCY
}

/**
 * Parse the `NEXT_PUBLIC_FX_RATES_PER_EGP` JSON object. A malformed blob is
 * ignored whole; a single bad entry inside a good blob is dropped on its own,
 * so one typo'd code doesn't take the other five rates down with it.
 */
export function parseRateOverrides(raw: string | null | undefined): RateTable {
  if (typeof raw !== 'string' || !raw.trim()) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const out: RateTable = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const code = key.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(code)) continue
    const rate = typeof value === 'string' ? Number(value) : value
    // A zero or negative rate would divide prices into nonsense or flip their
    // sign, so it is not "a rate we have" — it is no rate at all.
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) continue
    out[code] = rate
  }
  return out
}

/** The built-in table with any valid overrides layered on top. */
export function ratesWith(overrides?: RateTable | null): RateTable {
  return { ...DEFAULT_EGP_PER_UNIT, ...(overrides ?? {}) }
}

/**
 * A converted price is an estimate, so it is rounded to something a person
 * would say out loud: whole units once the number is big enough to carry them,
 * two decimals below that (a 60 EGP cleaning fee is $1.24, not "$1").
 */
export function roundForDisplay(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  return Math.abs(amount) >= 100
    ? Math.round(amount)
    : Math.round(amount * 100) / 100
}

/**
 * Convert between two currencies through EGP. Returns `null` when either side
 * has no rate — the caller then shows the original price untouched, which is
 * always correct, rather than a number invented from a missing rate.
 */
export function convertAmount(
  amount: number,
  from: string | null | undefined,
  to: string | null | undefined,
  rates: RateTable = DEFAULT_EGP_PER_UNIT,
): number | null {
  if (!Number.isFinite(amount)) return null

  const source = (from || BASE_CURRENCY).trim().toUpperCase()
  const target = (to || BASE_CURRENCY).trim().toUpperCase()
  if (source === target) return amount

  const sourceRate = rates[source]
  const targetRate = rates[target]
  if (!sourceRate || !targetRate) return null
  if (!Number.isFinite(sourceRate) || !Number.isFinite(targetRate)) return null

  return roundForDisplay((amount * sourceRate) / targetRate)
}

export interface DisplayPrice {
  /** The number to render. */
  amount: number
  /** The currency it is in — the target when converted, the source when not. */
  currency: string
  /** True when the figure is a conversion and so an estimate, not the charge. */
  approximate: boolean
}

/**
 * What to actually put on screen for `amount` priced in `from`, given the
 * guest's chosen currency. Falls back to the untouched original whenever the
 * conversion can't be made, so a price never disappears behind a missing rate.
 */
export function displayPrice(
  amount: number,
  from: string | null | undefined,
  to: string | null | undefined,
  rates: RateTable = DEFAULT_EGP_PER_UNIT,
): DisplayPrice {
  const source = (from || BASE_CURRENCY).trim().toUpperCase()
  const target = (to || BASE_CURRENCY).trim().toUpperCase()
  const safeAmount = Number.isFinite(amount) ? amount : 0

  if (source === target) {
    return { amount: safeAmount, currency: source, approximate: false }
  }

  const converted = convertAmount(safeAmount, source, target, rates)
  if (converted === null) {
    return { amount: safeAmount, currency: source, approximate: false }
  }
  // Zero is zero in every currency — "≈ $0" on an empty quote is noise.
  return { amount: converted, currency: target, approximate: converted !== 0 }
}

/**
 * The guest-facing name of a currency, localized by the browser/server ICU
 * data so the switcher reads as "Egyptian Pound" / "الجنيه المصري" without a
 * fourth copy of the same six words in every messages file. Falls back to the
 * bare code where ICU has nothing.
 */
export function currencyName(code: string, bcp47: string): string {
  try {
    const name = new Intl.DisplayNames([bcp47], { type: 'currency' }).of(code)
    return name && name !== code ? name : code
  } catch {
    return code
  }
}
