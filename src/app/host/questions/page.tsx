// "Guest questions" — every public question asked on the host's listings, with the
// host's reply inline. This is where the Messages inbox used to sit: host ⇄ guest
// messaging was replaced by public Q&A on each listing (2026-10-02).
//
// The list is fetched in the browser (GET /api/local/host/comments) rather than
// server-rendered, same as /host/reviews: replying changes a row in place, and a
// server-rendered list would need a full round-trip to reflect it.
import type { Metadata } from 'next'
import { viewer } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageFrame } from '@/components/layout/page-frame'
import { HostQuestions } from './host-questions'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hostQuestions')
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: { canonical: '/host/questions' },
    robots: { index: false, follow: true },
  }
}

export default async function HostQuestionsPage() {
  const me = await viewer()
  if (!me) redirect('/login')
  if (!me.is_host) redirect('/host')

  const t = await getTranslations('hostQuestions')

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
      <HostQuestions />
    </PageFrame>
  )
}
