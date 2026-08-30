'use client'

// Length-of-stay discounts — the two percent fields a host sets on /host/new and
// /host/:id/edit, shared by both so the create door and the edit door cannot
// drift apart on layout or copy.
//
// These are `listings.weekly_discount` / `listings.monthly_discount`: whole
// percentages off the summed nightly total, applied from WEEKLY_DISCOUNT_MIN_NIGHTS
// and MONTHLY_DISCOUNT_MIN_NIGHTS respectively. Only ONE of them ever applies —
// the monthly rate supersedes the weekly one rather than compounding with it (see
// stayDiscountPercent in lib/local/date-pricing-core.ts, which is the rule).
//
// The web had neither field until now, while the iOS and Android add-listing
// flows have had both since the growth work: a host who set a 15% weekly discount
// from their phone could not see it, let alone change it, from a browser.
import { useTranslations } from 'next-intl'
import {
  MONTHLY_DISCOUNT_MIN_NIGHTS,
  WEEKLY_DISCOUNT_MIN_NIGHTS,
} from '@/lib/local/date-pricing-core'
import { MAX_STAY_DISCOUNT, checkStayDiscount, stayDiscountsInvert } from '@/lib/local/listing-pricing-core'

const C = {
  burgundy: '#5B0F16',
  ink: '#2A2220',
  muted: '#6B6055',
}

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: C.ink,
  margin: '0 0 6px',
}

const hint: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 12.5,
  color: C.muted,
  lineHeight: 1.55,
}

/**
 * The two discount fields plus their inversion warning.
 *
 * Values are held by the parent as the raw strings the host typed (`''` = no
 * discount), not as numbers: the parent is what decides whether they are
 * submittable, and coercing here would hide the `7.5` that has to be refused.
 */
export function StayDiscountFields({
  weekly,
  monthly,
  onWeekly,
  onMonthly,
  /** `edit-` on the edit form, so the two forms' input ids stay distinct. */
  idPrefix = '',
  inputStyle,
}: {
  weekly: string
  monthly: string
  onWeekly: (value: string) => void
  onMonthly: (value: string) => void
  idPrefix?: string
  inputStyle: React.CSSProperties
}) {
  const t = useTranslations('hostPage.create')

  // The warning is derived from what is currently VALID, so a half-typed `-`
  // doesn't flash a message about a discount that isn't a discount yet.
  const weeklyChecked = checkStayDiscount(weekly)
  const monthlyChecked = checkStayDiscount(monthly)
  const inverted =
    weeklyChecked.ok &&
    monthlyChecked.ok &&
    stayDiscountsInvert(weeklyChecked.value, monthlyChecked.value)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={label} htmlFor={`${idPrefix}weeklyDiscount`}>
            {t('fields.weeklyDiscount')}
          </label>
          <input
            id={`${idPrefix}weeklyDiscount`}
            style={inputStyle}
            type="number"
            min="0"
            max={MAX_STAY_DISCOUNT}
            step="1"
            inputMode="numeric"
            value={weekly}
            onChange={(e) => onWeekly(e.target.value)}
            placeholder="0"
          />
          <p style={hint}>{t('hints.weeklyDiscount', { nights: WEEKLY_DISCOUNT_MIN_NIGHTS })}</p>
        </div>
        <div>
          <label style={label} htmlFor={`${idPrefix}monthlyDiscount`}>
            {t('fields.monthlyDiscount')}
          </label>
          <input
            id={`${idPrefix}monthlyDiscount`}
            style={inputStyle}
            type="number"
            min="0"
            max={MAX_STAY_DISCOUNT}
            step="1"
            inputMode="numeric"
            value={monthly}
            onChange={(e) => onMonthly(e.target.value)}
            placeholder="0"
          />
          <p style={hint}>{t('hints.monthlyDiscount', { nights: MONTHLY_DISCOUNT_MIN_NIGHTS })}</p>
        </div>
      </div>
      {/* Legal, occasionally deliberate, almost always a mistake — so it is said
          rather than refused. See stayDiscountsInvert. */}
      {inverted && (
        <p style={{ ...hint, color: C.burgundy }}>
          {t('hints.stayDiscountsInvert', {
            weekly: WEEKLY_DISCOUNT_MIN_NIGHTS,
            monthly: MONTHLY_DISCOUNT_MIN_NIGHTS,
          })}
        </p>
      )}
    </div>
  )
}
