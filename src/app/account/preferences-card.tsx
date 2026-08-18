'use client'

// Preferences — currency and language, on the page a guest goes to when they
// want to change something about their account. The header carries the same two
// switchers; this is the other place people look for them, and the only place
// there is room to say what the currency setting does and does not do.
import { useTranslations } from 'next-intl'
import { CurrencySwitcher } from '@/components/layout/currency-switcher'
import { LocaleSwitcher } from '@/components/layout/locale-switcher'
import { RATES_AS_OF } from '@/lib/local/currency-core'

const COLORS = {
  ink: '#2A2220',
  muted: '#6B6055',
}

const controlClass =
  'flex items-center gap-2 rounded-full border border-[rgba(42,34,32,0.16)] bg-white px-4 py-2.5 text-sm font-semibold text-[#2A2220] transition-colors hover:border-[rgba(91,15,22,0.35)]'

export function PreferencesCard() {
  const t = useTranslations('accountPage.preferences')
  const tc = useTranslations('currency')

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 22,
        border: `1px solid rgba(42,34,32,0.06)`,
        boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
        padding: '24px',
      }}
    >
      <h2 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 700, color: COLORS.ink }}>
        {t('title')}
      </h2>
      <p style={{ margin: '0 0 18px', fontSize: 14.5, color: COLORS.muted, lineHeight: 1.55 }}>
        {t('subtitle')}
      </p>

      <Row label={t('currencyLabel')} help={t('currencyHelp')}>
        <CurrencySwitcher className={controlClass} />
      </Row>

      <p style={{ margin: '8px 0 18px', fontSize: 12.5, color: COLORS.muted }}>
        {tc('ratesAsOf', { date: RATES_AS_OF })}
      </p>

      <div style={{ borderTop: `1px solid rgba(42,34,32,0.08)`, paddingTop: 18 }}>
        <Row label={t('languageLabel')}>
          <LocaleSwitcher className={controlClass} />
        </Row>
      </div>
    </div>
  )
}

function Row({
  label,
  help,
  children,
}: {
  label: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 240px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.ink }}>{label}</div>
        {help && (
          <div style={{ marginTop: 4, fontSize: 13.5, color: COLORS.muted, lineHeight: 1.5 }}>
            {help}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}
