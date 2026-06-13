'use client'

// Compact "EN / العربية" segmented switch for the primary nav. On-brand: the
// active language reads burgundy on cream/tan; the inactive one is muted. Clicks
// call setLang, which persists + flips <html dir>.
import { useLanguage } from '@/lib/i18n/language-provider'
import type { Lang } from '@/lib/i18n/messages'

const COLORS = {
  burgundy: '#5B0F16',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

export default function LanguageToggle() {
  const { lang, setLang, t } = useLanguage()

  function seg(value: Lang, label: string) {
    const active = lang === value
    return (
      <button
        type="button"
        onClick={() => setLang(value)}
        aria-pressed={active}
        // Arabic label should always render in its own script regardless of UI lang.
        lang={value}
        style={{
          appearance: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: FONT,
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1,
          padding: '6px 12px',
          borderRadius: 999,
          color: active ? '#fff' : COLORS.muted,
          background: active ? COLORS.burgundy : 'transparent',
          transition: 'background 0.12s ease, color 0.12s ease',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div
      role="group"
      aria-label={t('lang.switchTo')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        background: COLORS.tan,
        borderRadius: 999,
        padding: 3,
        flex: '0 0 auto',
      }}
    >
      {seg('en', t('lang.en'))}
      {seg('ar', t('lang.ar'))}
    </div>
  )
}
