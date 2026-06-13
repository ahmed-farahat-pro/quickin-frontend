'use client'

// Client wrapper rendered inside the (server) root layout body. Keeps the layout
// a server component while still mounting the client-only LanguageProvider that
// powers i18n + RTL across the app.
import { LanguageProvider } from '@/lib/i18n/language-provider'

export default function Providers({ children }: { children: React.ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>
}
