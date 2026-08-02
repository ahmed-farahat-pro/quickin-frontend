// Resorts — the compound catalog and the queue of host-typed names awaiting review.
//
// The (console) layout has already proven a valid staff session; this adds the
// per-module check. The API routes re-check `resorts` independently.
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { resolveStaffSession, staffCan, STAFF_COOKIE } from '@/lib/local/staff'
import { listResorts, listResortSubmissions, listUnassignedResortNames } from '@/lib/local/resorts'
import { REGION_VALUES } from '@/lib/local/resort-core'
import { OpsResorts } from './ops-resorts'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Resorts — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsResortsPage() {
  const staff = await resolveStaffSession((await cookies()).get(STAFF_COOKIE)?.value)
  if (!staff) redirect('/ops/login')
  if (!staffCan(staff, 'resorts')) redirect('/ops')

  // Server-render the first paint so the screen is useful immediately — the same
  // shape /ops/staff uses. The client refetches after every mutation.
  let initial = { resorts: [], submissions: [], unassigned: [] } as {
    resorts: Awaited<ReturnType<typeof listResorts>>
    submissions: Awaited<ReturnType<typeof listResortSubmissions>>
    unassigned: Awaited<ReturnType<typeof listUnassignedResortNames>>
  }
  try {
    const [resorts, submissions, unassigned] = await Promise.all([
      listResorts(),
      listResortSubmissions(),
      listUnassignedResortNames(),
    ])
    initial = { resorts, submissions, unassigned }
  } catch (err) {
    console.error('ops/resorts initial load:', err)
  }

  return <OpsResorts initial={initial} regions={[...REGION_VALUES]} />
}
