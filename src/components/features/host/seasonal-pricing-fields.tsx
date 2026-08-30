'use client'

// Seasonal pricing — the twelve optional nightly rates a host sets on /host/new
// and /host/:id/edit, shared by both forms so the create door and the edit door
// cannot drift apart.
//
// This is `listings.monthly_prices`, the rung of the nightly ladder directly
// under the weekend rate:
//
//     host calendar (listing_date_prices) → weekend → month → price_per_night
//
// A month left empty has no opinion and falls through to the base price, which
// is why a blank field is how a month is CLEARED — see checkMonthlyPrices in
// lib/local/listing-pricing-core.ts, which is the rule both this and the submit
// handler run.
//
// The month names come from Intl rather than twelve translation keys per locale,
// the same way the host calendar titles its months.
import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { MONTHS_IN_YEAR } from '@/lib/local/listing-pricing-core'
import { withCommission } from '@/lib/local/commission-core'

const C = {
  burgundy: '#5B0F16',
  ink: '#2A2220',
  muted: '#6B6055',
}

/** Month 1..12 → its short name in the reader's language. */
export function useMonthNames(): string[] {
  const locale = useLocale()
  return useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
    // 2021 is an arbitrary non-leap year — only the month is formatted.
    return Array.from({ length: MONTHS_IN_YEAR }, (_, i) =>
      fmt.format(new Date(Date.UTC(2021, i, 1)))
    )
  }, [locale])
}

/**
 * The twelve month fields.
 *
 * `values` is month `"1".."12"` → the raw string the host typed, exactly as the
 * parent holds it. A key that is absent and a key that is `''` mean the same
 * thing here (no override) and both are what an empty field produces, so the
 * parent may drop the key or keep it blank — checkMonthlyPrices treats them
 * alike.
 */
export function SeasonalPricingFields({
  values,
  onChange,
  currency,
  commissionRate,
  /** `edit-` on the edit form, so the two forms' input ids stay distinct. */
  idPrefix = '',
  inputStyle,
}: {
  values: Record<string, string>
  onChange: (month: string, value: string) => void
  currency: string
  commissionRate: number
  idPrefix?: string
  inputStyle: React.CSSProperties
}) {
  const t = useTranslations('hostPage.create')
  const months = useMonthNames()

  return (
    <div>
      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>
        {t('hints.seasonalPricing')}
      </p>
      <div
        className="qk-seasonal-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}
      >
        {months.map((name, i) => {
          const month = String(i + 1)
          const value = values[month] ?? ''
          const raw = Number(value)
          // The guest-facing number, on the same terms as GuestPriceHint: hosts
          // type what they want to receive, guests are quoted that plus
          // commission. Rendered inline rather than as a second line because
          // twelve stacked hints would bury the fields they belong to.
          const guest =
            value.trim() && Number.isFinite(raw) && raw > 0 ? withCommission(raw, commissionRate) ?? raw : null
          return (
            <div key={month}>
              <label
                style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.ink, margin: '0 0 5px' }}
                htmlFor={`${idPrefix}month-${month}`}
              >
                {name}
              </label>
              <input
                id={`${idPrefix}month-${month}`}
                style={inputStyle}
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={value}
                onChange={(e) => onChange(month, e.target.value)}
                placeholder="—"
                aria-label={name}
              />
              <p style={{ margin: '5px 0 0', fontSize: 11.5, color: guest === null ? 'transparent' : C.burgundy, minHeight: 15 }}>
                {guest === null ? '·' : `${currency} ${guest.toLocaleString('en-US')}`}
              </p>
            </div>
          )
        })}
      </div>
      {/* Same plain <style> + global class the host forms use for their own
          responsive rows — this repo has no styled-jsx. */}
      <style>{`
        @media (max-width: 560px) {
          .qk-seasonal-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  )
}
