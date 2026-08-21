// Activity — everything that happened on the site (F1).
//
// The feed is derived from rows that already exist rather than a written log, so this
// screen shows full history the day it ships. See getActivityFeed in db.ts.
import type { Metadata } from 'next'
import { opsSession, opsCan, backendFetchOr } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { parseActivityFilter } from '@/lib/local/activity-core'
import { OpsActivity } from './ops-activity'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Activity — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsActivityPage() {
  const staff = await opsSession()
  if (!staff) redirect('/ops/login')
  if (!opsCan(staff, 'overview')) redirect('/ops')

  // The first page of the feed. A backend hiccup shows an empty console rather than
  // a 500 — the client refetches on mount and whenever the filter changes.
  type Initial = React.ComponentProps<typeof OpsActivity>['initial']
  const initial = await backendFetchOr<Initial>(
    '/api/local/admin/activity',
    { events: [], hasMore: false } as unknown as Initial,
  )

  return <OpsActivity initial={initial} />
}
