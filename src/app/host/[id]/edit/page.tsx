// Host: edit ONE OF YOUR OWN listings (local-stack, no Supabase). Server-side it
// verifies the qk_token cookie AND that the listing belongs to the signed-in
// host; a stranger's listing 404s. The client form PATCHes /api/local/listings/:id,
// which sends the listing back to the admin queue on every edit — the form warns
// about that before the host commits, and this header carries the same
// approval-status chip the host dashboard uses.
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCommissionConfig, getListingById, hostListingHasOwnershipDoc } from '@/lib/local/db'
import { verifyToken, getUserRowByEmail } from '@/lib/local/auth'
import { ListingStatusChip } from '../../listing-status-chip'
import type { HostListingStatus } from '../../host-tabs'
import { listActiveResorts } from '@/lib/local/resorts'
import { EditListingForm } from './edit-listing-form'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hostPage.edit')
  return {
    title: t('meta.title'),
    robots: { index: false, follow: false },
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

/** Legacy rows have no approval_status — treat anything unknown as published
 *  (same rule as the host dashboard). */
function listingStatus(approval: string | null | undefined): HostListingStatus {
  return approval === 'pending' || approval === 'rejected' ? approval : 'approved'
}

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  // Server-side, like the create page: no client fetch needed.
  let resorts: Awaited<ReturnType<typeof listActiveResorts>> = []
  try {
    resorts = await listActiveResorts()
  } catch (err) {
    console.error('host/edit resorts:', err)
  }
  const { id } = await params

  const token = (await cookies()).get('qk_token')?.value
  if (!token) redirect('/login')
  const claims = verifyToken(token)
  if (!claims?.email) redirect('/login')
  const me = await getUserRowByEmail(claims.email)
  if (!me) redirect('/login')

  // asHost: the form loads price_per_night and saves it straight back, so it
  // must see the host's RAW price — not the commission-inclusive guest price,
  // which would inflate the listing a little more on every save.
  const listing = await getListingById(id, { asHost: true })
  // Only the owner may edit — anyone else (or a missing listing) gets a 404.
  if (!listing || listing.host_id !== me.id) notFound()
  // Just a flag — the document itself is admin-only (reviewed in /ops).
  const hasOwnershipDoc = await hostListingHasOwnershipDoc(listing.id, me.id)
  // Drives the "guests will see EGP X" hint under the price fields. A failure
  // degrades to 0, hiding the hint rather than showing a wrong number.
  let commissionRate = 0
  try {
    commissionRate = (await getCommissionConfig()).rate
  } catch (err) {
    console.error('host/edit commission:', err)
  }

  const t = await getTranslations('hostPage.edit')
  const tDash = await getTranslations('hostPage.dashboard')
  const status = listingStatus(listing.approval_status)
  const statusLabel: Record<HostListingStatus, string> = {
    approved: tDash('filters.published'),
    pending: tDash('badge.pending'),
    rejected: tDash('badge.rejected'),
  }

  return (
    <main style={{ minHeight: '100vh', background: COLORS.cream, color: COLORS.ink, fontFamily: FONT }}>
      <header
        style={{
          background: `linear-gradient(180deg, ${COLORS.tan} 0%, ${COLORS.cream} 100%)`,
          borderBottom: `1px solid rgba(91,15,22,0.10)`,
          padding: '20px 24px',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <a href="/host" style={{ color: COLORS.burgundy, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
            ← {t('backToHost')}
          </a>
          <a href={`/explore/${listing.id}`} style={{ color: COLORS.burgundy, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
            {t('viewListing')} ↗
          </a>
        </div>
      </header>

      <section style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 72px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 6px' }}>
          <h1
            style={{
              margin: 0,
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 'clamp(24px, 4vw, 32px)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: COLORS.burgundy,
            }}
          >
            {t('title')}
          </h1>
          <ListingStatusChip status={status} label={statusLabel[status]} />
        </div>
        <p style={{ margin: '0 0 24px', fontSize: 15, color: COLORS.muted, lineHeight: 1.55 }}>
          {t('subtitle')}
        </p>
        {/* The reason this listing was rejected, above the form that fixes it. The
            host dashboard shows it too, but this is where the host actually acts on
            it — a reason they have to navigate back to isn't much better than none.
            `review_note` is null when the operator rejected without writing one, and
            on listings rejected before the note was stored at all; both fall back to
            generic copy. Cleared on save, since saving re-queues the listing. */}
        {status === 'rejected' && (
          <div
            style={{
              margin: '0 0 24px',
              padding: '14px 16px',
              background: '#fdecea',
              border: '1px solid rgba(179,38,30,0.18)',
              borderRadius: 14,
            }}
          >
            <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: '#b3261e' }}>
              {t('rejected.title')}
            </p>
            {/* Staff-authored text shown to the host: keep the operator's line
                breaks, and break inside a long unspaced run so it can't overflow. */}
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 14.5,
                lineHeight: 1.55,
                color: COLORS.ink,
                whiteSpace: 'pre-line',
                overflowWrap: 'anywhere',
              }}
            >
              {listing.review_note || t('rejected.noReason')}
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.5, color: COLORS.muted }}>
              {t('rejected.hint')}
            </p>
          </div>
        )}
        <EditListingForm
          listing={listing}
          hasOwnershipDoc={hasOwnershipDoc}
          resorts={resorts}
          commissionRate={commissionRate}
        />
      </section>
    </main>
  )
}
