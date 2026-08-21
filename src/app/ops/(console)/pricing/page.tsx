// QuickIn — pricing ops (World 1, no Supabase).
// Server component: the (console) layout has already established the staff session;
// this adds the per-module check, so only a super admin or a moderator holding the
// 'pricing' module sees the panel. The API route behind it re-checks the same
// permission independently.
//
// The current rate is read HERE and passed to the client component as a prop.
// Client-side useEffect fetches have failed to populate on several /ops screens;
// server-rendering the initial data (the /ops/staff pattern) is what works.
// Strings are hardcoded English, like the rest of /ops.
import type { Metadata } from 'next'
import { opsSession, opsCan, backendFetchOr } from '@/lib/backend'
import { OpsPricing } from './ops-pricing'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Pricing & commission — QuickIn Ops',
  robots: { index: false, follow: false },
}

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

export default async function OpsPricingPage() {
  const staff = await opsSession()
  const allowed = Boolean(staff && opsCan(staff, 'pricing'))
  // Only read the setting once the gate has passed — an operator without the
  // module should not cause a query, let alone see its result.
  // One call returns the rate and the impact preview together. Only read it once the
  // gate has passed — an operator without the module should not cause a query, let
  // alone see its result.
  type CommissionView = React.ComponentProps<typeof OpsPricing>['initial']
  const settings = allowed
    ? await backendFetchOr<CommissionView | null>('/api/local/admin/settings/commission', null)
    : null

  return (
    <main style={{ minHeight: '100vh', background: COLORS.cream, color: COLORS.ink, fontFamily: FONT }}>

      <section style={{ maxWidth: 960, margin: '0 auto', padding: '36px 24px 72px' }}>
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
          Pricing &amp; commission
        </h1>
        <p style={{ margin: '0 0 28px', fontSize: 15, color: COLORS.muted }}>
          Set the commission QuickIn adds on top of every host&rsquo;s price.
        </p>

        {!allowed || !settings ? (
          <div
            style={{
              background: '#fff',
              borderRadius: 22,
              border: '1px solid rgba(42,34,32,0.06)',
              boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
              padding: '44px 24px',
              textAlign: 'center',
              color: COLORS.muted,
            }}
          >
            <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: COLORS.ink }}>
              No access to pricing
            </p>
            <p style={{ margin: 0, fontSize: 14 }}>
              {staff
                ? 'Your account does not have the Pricing module. Ask a super admin to grant it.'
                : 'Please sign in to manage pricing.'}
            </p>
          </div>
        ) : (
          <OpsPricing initial={settings} />
        )}
      </section>
    </main>
  )
}
