'use client'

// "Guests will see EGP X" — shown under every price field in the host forms.
//
// Hosts type the amount they want to RECEIVE. Guests are quoted that amount plus
// the platform commission (see lib/local/commission-core.ts), so without this the
// host has no idea what their listing actually costs to book. The markup is
// computed with the same function the server prices with, so the number here and
// the number on the listing card cannot disagree.
import { useTranslations } from 'next-intl'
import { withCommission } from '@/lib/local/commission-core'

const C = { burgundy: '#5B0F16', muted: '#6B6055' }

export function GuestPriceHint({
  /** The raw value straight out of the input — may be blank or junk mid-typing. */
  value,
  rate,
  currency = 'EGP',
}: {
  value: string
  rate: number
  currency?: string
}) {
  const t = useTranslations('hostPage.create.commission')
  const raw = Number(value)
  // Say nothing until there is a real price. An empty field is not an error, and
  // "Guests will see EGP 0" would be worse than silence.
  if (!value.trim() || !Number.isFinite(raw) || raw <= 0) return null

  const guest = withCommission(raw, rate) ?? raw
  const percent = Math.round(rate * 10_000) / 100

  return (
    <p style={{ margin: '8px 0 0', fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
      <strong style={{ color: C.burgundy }}>
        {t('guestsSee', { price: `${currency} ${guest.toLocaleString('en-US')}` })}
      </strong>
      {percent > 0 ? <> · {t('note', { percent })}</> : null}
    </p>
  )
}
