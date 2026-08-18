'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { localeToBcp47, type Locale } from '@/i18n/config'
import {
  CURRENCY_SYMBOLS,
  DISPLAY_CURRENCIES,
  currencyName,
  type DisplayCurrency,
} from '@/lib/local/currency-core'
import { useDisplayCurrency } from '@/components/providers/display-currency-provider'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * The currency picker that sits beside the language picker — header, footer and
 * the account page, so it is reachable from anywhere a guest reads a price.
 */
export function CurrencySwitcher({ className }: { className?: string }) {
  const locale = useLocale() as Locale
  const bcp47 = localeToBcp47(locale)
  const t = useTranslations('currency')
  const { currency, setCurrency } = useDisplayCurrency()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('change')}
          className={cn(
            'group flex items-center gap-2 transition-all duration-300',
            className,
          )}
        >
          <span aria-hidden className="shrink-0 tabular-nums">
            {CURRENCY_SYMBOLS[currency]}
          </span>
          <span className="whitespace-nowrap">{currency}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[max(230px,min(300px,calc(100vw-2rem)))] rounded-2xl p-1.5"
      >
        <DropdownMenuLabel className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('title')}
        </DropdownMenuLabel>
        {DISPLAY_CURRENCIES.map((code: DisplayCurrency) => (
          <DropdownMenuItem
            key={code}
            onClick={() => setCurrency(code)}
            className={cn(
              'flex items-center gap-2.5 rounded-xl px-3 py-2 cursor-pointer',
              code === currency && 'bg-accent/50 font-semibold',
            )}
          >
            <span aria-hidden className="w-8 shrink-0 text-start">
              {CURRENCY_SYMBOLS[code]}
            </span>
            <span className="flex-1 truncate">{currencyName(code, bcp47)}</span>
            <span className="text-xs text-muted-foreground">{code}</span>
            {code === currency && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {/* The guest is choosing what to read, not what to pay — say so here
            rather than only next to a converted price they may not scroll to. */}
        <p className="px-3 py-2 text-xs leading-snug text-muted-foreground">
          {t('disclaimer')}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
