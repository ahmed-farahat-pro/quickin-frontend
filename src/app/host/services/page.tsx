// Host services — the web twin of iOS's HostServicesSection and Android's
// HostServicesScreen: the host's own services, their subscription-request
// inbox, and the form that posts a new one.
import type { Metadata } from 'next'
import type { Service, ServiceRequest } from '@/lib/types'
import { viewer, backendFetchOr } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageFrame } from '@/components/layout/page-frame'
import { HostServices } from './host-services'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hostServices')
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: { canonical: '/host/services' },
    robots: { index: false, follow: true },
  }
}

export default async function HostServicesPage() {
  const me = await viewer()
  if (!me) redirect('/login')
  if (!me.is_host) redirect('/host')

  const t = await getTranslations('hostServices')
  // Fetched here rather than on mount in the client component: the server
  // already holds this host's session, so there is no reason to make the
  // browser ask again and show a skeleton while it does.
  const [services, requests] = await Promise.all([
    backendFetchOr<Service[]>('/api/local/host/services', []),
    backendFetchOr<ServiceRequest[]>('/api/local/host/service-requests', []),
  ])

  return (
    <PageFrame
      title={t('title')}
      subtitle={t('subtitle')}
      maxWidth={920}
      backLinks={[
        { href: '/host', label: t('backToDashboard') },
        { href: '/services', label: t('backToBrowse') },
      ]}
    >
      <HostServices initialServices={services} initialRequests={requests} />
    </PageFrame>
  )
}
