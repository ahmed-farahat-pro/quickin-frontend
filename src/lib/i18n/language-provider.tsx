'use client'

// Lightweight client-side i18n for QuickIn — no route restructuring, no [locale]
// segment. A React context exposes { lang, setLang, t } to any client component.
//
// SSR safety / hydration:
//   • We ALWAYS render the default lang ('en') on the server AND on the first
//     client paint, so server and client markup match (no hydration mismatch).
//   • After mount, an effect reads the persisted lang (cookie → localStorage)
//     and switches if it differs. From then on the UI is reactive.
//
// Persistence: the chosen lang is written to BOTH localStorage ('qk_lang') and a
// 'qk_lang' cookie (so a future server-side default could read it if needed).
//
// Direction: on every lang change (and on mount) we set
// document.documentElement.lang + .dir ('rtl' for ar, 'ltr' for en).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { messages, type Lang } from './messages'

const DEFAULT_LANG: Lang = 'en'
const STORAGE_KEY = 'qk_lang'
const COOKIE_KEY = 'qk_lang'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

export function dirFor(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr'
}

function isLang(value: string | null | undefined): value is Lang {
  return value === 'en' || value === 'ar'
}

function readCookieLang(): Lang | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + COOKIE_KEY + '=([^;]*)')
  )
  const value = match ? decodeURIComponent(match[1]) : null
  return isLang(value) ? value : null
}

function readStoredLang(): Lang | null {
  // Cookie first (cheap, also what a server default would read), then localStorage.
  const fromCookie = readCookieLang()
  if (fromCookie) return fromCookie
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (isLang(raw)) return raw
  } catch {
    // ignore unavailable storage
  }
  return null
}

function persistLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // ignore
  }
  try {
    document.cookie = `${COOKIE_KEY}=${lang}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
  } catch {
    // ignore
  }
}

// Replace {placeholder} tokens with provided values.
function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole
  )
}

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  // t(key) → current-lang string; falls back to English, then the raw key.
  // Optional vars interpolate {tokens}.
  t: (key: string, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Start at the stable default so SSR and first client paint match.
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG)

  // After mount, adopt the persisted lang (if any) and sync <html> dir/lang.
  useEffect(() => {
    const stored = readStoredLang()
    const initial = stored ?? DEFAULT_LANG
    if (initial !== lang) setLangState(initial)
    applyHtmlAttributes(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    persistLang(next)
    applyHtmlAttributes(next)
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const table = messages[lang] || messages[DEFAULT_LANG]
      const raw =
        table[key] ?? messages[DEFAULT_LANG][key] ?? key
      return interpolate(raw, vars)
    },
    [lang]
  )

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, setLang, t }),
    [lang, setLang, t]
  )

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

function applyHtmlAttributes(lang: Lang) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  el.lang = lang
  el.dir = dirFor(lang)
}

// Hook for client components. Safe to call outside the provider — returns a
// no-op English fallback so a stray usage never throws (and SSR stays stable).
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (ctx) return ctx
  return {
    lang: DEFAULT_LANG,
    setLang: () => {},
    t: (key, vars) =>
      interpolate(messages[DEFAULT_LANG][key] ?? key, vars),
  }
}
