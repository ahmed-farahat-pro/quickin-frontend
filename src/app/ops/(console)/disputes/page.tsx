// Guest disputes (F6) — issues guests raise about a stay, routed here for
// investigation and resolution.
//
// Distinct from /ops → Payments (a contested payment proof) and /ops → Reports
// (abuse about a listing, user or review). This is the stay itself: it wasn't as
// described, we couldn't get in, the host never replied.
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { resolveStaffSession, staffCan, STAFF_COOKIE } from '@/lib/local/staff'
import { adminListDisputes } from '@/lib/local/disputes'
import { OpsDisputes } from './ops-disputes'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Guest disputes — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsDisputesPage() {
  const staff = await resolveStaffSession((await cookies()).get(STAFF_COOKIE)?.value)
  if (!staff) redirect('/ops/login')
  if (!staffCan(staff, 'disputes')) redirect('/ops')

  let initial: Awaited<ReturnType<typeof adminListDisputes>> = []
  try {
    initial = await adminListDisputes('needs_action')
  } catch (err) {
    // An un-migrated database must not 500 the console — the screen renders
    // empty and the rest of /ops works normally.
    console.error('ops/disputes initial load:', err)
  }

  return <OpsDisputes initial={initial} />
}
