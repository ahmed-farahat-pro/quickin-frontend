// Reports — user-filed abuse reports (F4).
//
// The reports table, the filing route and the `reports` staff module have all existed
// since the trust work; this console never had a screen, so nothing filed here had
// ever been seen. This is that screen.
import type { Metadata } from 'next'
import { opsSession, opsCan, backendFetchOr } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { OpsReports } from './ops-reports'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Reports — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsReportsPage() {
  const staff = await opsSession()
  if (!staff) redirect('/ops/login')
  if (!opsCan(staff, 'reports')) redirect('/ops')

  // The list the screen opens on. A backend hiccup shows an empty console rather
  // than a 500 — the client refetches on mount and whenever the filter changes.
  type Initial = React.ComponentProps<typeof OpsReports>['initial']
  const { reports: initial } = await backendFetchOr<{ reports: Initial }>(
    '/api/local/admin/reports?status=open',
    { reports: [] as unknown as Initial },
  )

  return <OpsReports initial={initial} />
}
