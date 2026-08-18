// Identity verification (no Supabase) — upload a National ID for auto-scan or
// manual admin review. Reachable at /{locale}/verify-id via the locale proxy.
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { IdVerificationPanel } from '@/components/features/verification/id-verification-panel'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('verifyIdPage')
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: { canonical: '/verify-id' },
    robots: { index: false, follow: true },
  }
}

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
}

// Same header as /account and /host/apply: the logo home, plus the way back to
// the page that sent the user here. Without it this route was a dead end that
// could only be left with the browser's own back button.
function Header({ backLabel }: { backLabel: string }) {
  return (
    <header
      style={{
        background: `linear-gradient(180deg, ${COLORS.tan} 0%, ${COLORS.cream} 100%)`,
        borderBottom: `1px solid rgba(91,15,22,0.10)`,
        padding: '20px 24px',
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <a href="/explore" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <img
            src="/logo.png"
            alt="QuickIn"
            height={40}
            style={{ height: 40, width: 'auto', display: 'block' }}
          />
        </a>
        <a
          href="/account"
          style={{
            color: COLORS.burgundy,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ← {backLabel}
        </a>
      </div>
    </header>
  )
}

export default async function VerifyIdPage() {
  const t = await getTranslations('verifyIdPage')
  return (
    <main style={{ background: COLORS.cream, minHeight: '100vh' }}>
      <Header backLabel={t('backToAccount')} />

      <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: COLORS.burgundy }}>
            {t('heading')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <IdVerificationPanel />
      </div>
    </main>
  )
}
