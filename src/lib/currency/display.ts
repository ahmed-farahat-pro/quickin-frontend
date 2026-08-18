// Turning a stored price into the string a guest reads.
//
// `currency-core.ts` holds the arithmetic (and is the part under test);
// this is the thin layer that reads the deploy-time rate override and reuses
// `formatPrice` so a converted price looks exactly like an unconverted one.
import { formatPrice } from '@/lib/utils'
import {
  displayPrice,
  parseRateOverrides,
  ratesWith,
  type RateTable,
} from '@/lib/local/currency-core'

// Read as a literal so Next inlines it into the client bundle: the server and
// the browser have to convert with the same table or a price would change on
// hydration.
const overrides: RateTable = parseRateOverrides(
  process.env.NEXT_PUBLIC_FX_RATES_PER_EGP,
)

/** The live rate table: the built-in snapshot plus any deploy-time override. */
export const fxRates: RateTable = ratesWith(overrides)

/**
 * Format `amount` (priced in `from`) for a guest reading in `to`.
 *
 * A conversion is prefixed with "≈" — the guest is looking at an estimate, and
 * the listing's own currency is what they will be charged in.
 */
export function formatDisplayPrice(
  amount: number,
  from: string | null | undefined,
  to: string | null | undefined,
): string {
  const shown = displayPrice(amount, from, to, fxRates)
  const text = formatPrice(shown.amount, shown.currency, {
    // A converted price rounds to two decimals below 100, and "$6.8" reads as
    // a mistake — once there is a decimal at all, show both.
    minFractionDigits: Number.isInteger(shown.amount) ? 0 : 2,
  })
  return shown.approximate ? `≈ ${text}` : text
}

/**
 * True when `to` would render `from` as an estimate — the signal for showing
 * the "charged in X" note beside a converted price.
 */
export function isConverted(
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  return displayPrice(1, from, to, fxRates).approximate
}
