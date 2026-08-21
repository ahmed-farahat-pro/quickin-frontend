// Resorts — the compound catalog and the queue of host-typed names awaiting review.
//
// The (console) layout has already proven a valid staff session; this adds the
// per-module check. The API routes re-check `resorts` independently.
import type { Metadata } from 'next'
import { opsSession, opsCan, backendFetchOr } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { REGION_VALUES } from '@/lib/local/resort-core'
import { OpsResorts } from './ops-resorts'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Resorts — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsResortsPage() {
  const staff = await opsSession()
  if (!staff) redirect('/ops/login')
  if (!opsCan(staff, 'resorts')) redirect('/ops')

  // Server-render the first paint so the screen is useful immediately — the same
  // shape /ops/staff uses. The client refetches after every mutation.
  // Server-render the first paint so the screen is useful immediately. The client
  // refetches after every mutation.
  type Initial = React.ComponentProps<typeof OpsResorts>['initial']
  // Two endpoints: the catalog, and the queue of names hosts typed themselves.
  const [catalog, subs] = await Promise.all([
    backendFetchOr<{ resorts: Initial['resorts']; unassigned: Initial['unassigned'] }>(
      '/api/local/admin/resorts',
      { resorts: [], unassigned: [] } as unknown as { resorts: Initial['resorts']; unassigned: Initial['unassigned'] },
    ),
    backendFetchOr<{ submissions: Initial['submissions'] }>(
      '/api/local/admin/resorts/submissions',
      { submissions: [] as unknown as Initial['submissions'] },
    ),
  ])
  const initial: Initial = {
    resorts: catalog.resorts, unassigned: catalog.unassigned, submissions: subs.submissions,
  } as Initial

  return <OpsResorts initial={initial} regions={[...REGION_VALUES]} />
}
