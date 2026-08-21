// Host: the day-by-day calendar for ONE OF YOUR OWN listings. Server-side it
// verifies the qk_token cookie AND that the listing belongs to the signed-in
// host; a stranger's listing 404s, exactly like the edit page.
//
// The first three months are fetched here so the grid paints with prices
// already on it — the client then fills the rest of the year in the background.
// `asHost: true` throughout: these are the host's RAW rates, the numbers they
// type and are paid, with the guest-inclusive figure shown alongside.
import type { Metadata } from 'next'
import type { ListingCalendar, Listing } from '@/lib/types'
import { viewer, backendFetch } from '@/lib/backend'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { addDays } from '@/lib/local/date-pricing-core'
import { CalendarEditor } from './calendar-editor'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hostPage.calendar')
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

/** Today in Cairo. The calendar is a wall-clock artifact — "can I still price
 *  tonight?" must be answered in the host's day, not the server's UTC day, and
 *  it must be the SAME answer the API gives or the grid would offer a day the
 *  save then refuses. */
function todayInCairo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/** How much the server paints before the client takes over. */
const PREFETCH_DAYS = 92

export default async function HostCalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const me = await viewer()
  if (!me) redirect('/login')

  const listing = await backendFetch<Listing | null>(`/api/local/listings/${id}?asHost=1`, { allow404: true })
  // Only the owner may see this — anyone else (or a missing listing) gets a 404.
  if (!listing || listing.host_id !== me.id) notFound()

  const today = todayInCairo()
  // A calendar that fails to load still renders: the editor fetches its own
  // windows, so the host sees an empty grid that fills in rather than an error.
  let initial: ListingCalendar | null = null
  try {
    initial = await backendFetch<ListingCalendar>(
      `/api/local/listings/${id}/calendar?from=${today}&to=${addDays(today, PREFETCH_DAYS)}&asHost=1`,
    )
  } catch (err) {
    console.error('host/calendar prefetch:', err)
  }

  const t = await getTranslations('hostPage.calendar')
  const currency = listing.currency ?? 'EGP'

  return (
    <main style={{ minHeight: '100vh', background: COLORS.cream, color: COLORS.ink, fontFamily: FONT }}>
      <header
        style={{
          background: `linear-gradient(180deg, ${COLORS.tan} 0%, ${COLORS.cream} 100%)`,
          borderBottom: '1px solid rgba(91,15,22,0.10)',
          padding: '20px 24px',
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <a href="/host" style={{ color: COLORS.burgundy, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
            ← {t('backToHost')}
          </a>
          <a href={`/host/${listing.id}/edit`} style={{ color: COLORS.burgundy, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
            {t('editListing')} ↗
          </a>
        </div>
      </header>

      <section style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 72px' }}>
        <h1
          style={{
            margin: '0 0 6px',
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(24px, 4vw, 32px)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: COLORS.burgundy,
          }}
        >
          {t('title')}
        </h1>
        <p style={{ margin: '0 0 4px', fontSize: 15, color: COLORS.muted, lineHeight: 1.55 }}>{listing.title}</p>
        <p style={{ margin: '0 0 24px', fontSize: 14.5, color: COLORS.muted, lineHeight: 1.55 }}>
          {t('subtitle', {
            base: new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(listing.price_per_night),
            currency,
          })}
        </p>

        <CalendarEditor listingId={listing.id} today={today} currency={currency} initial={initial} />
      </section>
    </main>
  )
}
