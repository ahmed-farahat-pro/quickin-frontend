// Create a new listing (no Supabase) — host-only. Server-side auth reads the
// qk_token cookie (same pattern as /explore) and redirects signed-out visitors
// to /login. The create form is the 'use client' component below.
import type { Metadata } from 'next'
import type { ResortOption } from '@/lib/types'
import type { ListingGateResult } from '@/lib/local/host-verification-core'
import { viewer, backendFetchOr } from '@/lib/backend'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { canPublishListing } from '@/lib/local/host-verification-core'
import { VerificationGateNotice } from '../verification-gate-notice'
import { NewListingForm } from './new-listing-form'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hostPage.create')
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: { canonical: '/host/new' },
    robots: { index: false, follow: true },
  }
}

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

export default async function NewListingPage() {
  // Server-side: the catalog is a small, cacheable read and the page already has
  // DB access, so there is no reason to make the browser fetch it. A failure here
  // degrades to the free-text "Other" path rather than breaking the form.
  let resorts: ResortOption[] = []
  try {
    resorts = (await backendFetchOr<{ resorts: ResortOption[] }>('/api/local/resorts', { resorts: [] })).resorts
  } catch (err) {
    console.error('host/new resorts:', err)
  }
  // The commission drives the "guests will see EGP X" hint under the price
  // fields. A failure degrades to 0, which hides the hint rather than showing a
  // wrong number — the server prices the listing either way.
  let commissionRate = 0
  try {
    commissionRate = (await backendFetchOr<{ rate: number }>('/api/local/host/commission', { rate: 0 })).rate
  } catch (err) {
    console.error('host/new commission:', err)
  }
  const userId = (await viewer())?.id ?? null
  if (!userId) redirect('/login')

  // Check the gate BEFORE rendering the form. The POST enforces it anyway, but
  // letting an unverified host fill in a whole listing only to be refused at the
  // end is a bad way to communicate a rule we already know.
  // The backend runs canPublishListing() and sends its result, so the gate the form
  // renders is the same one POST /api/local/listings will enforce.
  const gate = await backendFetchOr<ListingGateResult>('/api/local/host/listing-gate', {
    allowed: false, code: 'not_host', message: 'Only hosts can add a listing.',
  } as ListingGateResult)
  // The reviewer's reason, fetched only when it is going to be shown.
  const rejectionReason =
    gate.code === 'verification_rejected'
      ? (await backendFetchOr<{ notes: string | null }>('/api/local/verification', { notes: null })).notes
      : null

  const t = await getTranslations('hostPage.create')

  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.cream,
        color: COLORS.ink,
        fontFamily: FONT,
      }}
    >
      {/* Header */}
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
            href="/host"
            style={{
              color: COLORS.burgundy,
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            ← {t('backToHosting')}
          </a>
        </div>
      </header>

      <section style={{ maxWidth: 720, margin: '0 auto', padding: '36px 24px 72px' }}>
        <h1
          style={{
            margin: '0 0 6px',
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(26px, 4vw, 34px)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: COLORS.burgundy,
          }}
        >
          {t('title')}
        </h1>
        <p style={{ margin: '0 0 28px', fontSize: 15, color: COLORS.muted }}>
          {t('subtitle')}
        </p>

        {gate.allowed ? (
          <NewListingForm resorts={resorts} commissionRate={commissionRate} />
        ) : (
          <VerificationGateNotice code={gate.code} message={gate.message} reason={rejectionReason} />
        )}
      </section>
    </main>
  )
}
