// Activity — everything that happened on the site (F1).
//
// The feed is derived from rows that already exist rather than a written log, so this
// screen shows full history the day it ships. See getActivityFeed in db.ts.
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { resolveStaffSession, staffCan, STAFF_COOKIE } from '@/lib/local/staff'
import { getActivityFeed } from '@/lib/local/db'
import { parseActivityFilter } from '@/lib/local/activity-core'
import { OpsActivity } from './ops-activity'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Activity — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsActivityPage() {
  const staff = await resolveStaffSession((await cookies()).get(STAFF_COOKIE)?.value)
  if (!staff) redirect('/ops/login')
  if (!staffCan(staff, 'overview')) redirect('/ops')

  let initial: Awaited<ReturnType<typeof getActivityFeed>> = { events: [], hasMore: false }
  try {
    initial = await getActivityFeed(parseActivityFilter(() => null))
  } catch (err) {
    // A DB hiccup shouldn't blank the page — the client refetches on filter change.
    console.error('ops/activity initial load:', err)
  }

  return <OpsActivity initial={initial} />
}
