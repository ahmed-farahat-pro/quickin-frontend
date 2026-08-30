// "Review your guests" — the host's side of the two-way review.
//
// The list is fetched in the browser rather than server-rendered: submitting a
// review removes its card, and a server-rendered list would need a full
// round-trip to reflect that. See review-guests.tsx.
import type { Metadata } from 'next'
import { viewer } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageFrame } from '@/components/layout/page-frame'
import { ReviewGuests } from './review-guests'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hostReviews')
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: { canonical: '/host/reviews' },
    robots: { index: false, follow: true },
  }
}

export default async function HostReviewsPage() {
  const me = await viewer()
  if (!me) redirect('/login')
  if (!me.is_host) redirect('/host')

  const t = await getTranslations('hostReviews')

  return (
    <PageFrame
      title={t('title')}
      subtitle={t('subtitle')}
      maxWidth={860}
      backLinks={[
        { href: '/host', label: t('backToDashboard') },
        { href: '/account', label: t('backToAccount') },
      ]}
    >
      <ReviewGuests />
    </PageFrame>
  )
}
