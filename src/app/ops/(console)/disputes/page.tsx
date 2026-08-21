// Guest disputes (F6) — issues guests raise about a stay, routed here for
// investigation and resolution.
//
// Distinct from /ops → Payments (a contested payment proof) and /ops → Reports
// (abuse about a listing, user or review). This is the stay itself: it wasn't as
// described, we couldn't get in, the host never replied.
import type { Metadata } from 'next'
import { opsSession, opsCan, backendFetchOr } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { OpsDisputes } from './ops-disputes'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Guest disputes — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsDisputesPage() {
  const staff = await opsSession()
  if (!staff) redirect('/ops/login')
  if (!opsCan(staff, 'disputes')) redirect('/ops')

  // An unreachable backend must not 500 the console — the screen renders empty and
  // the rest of /ops works normally.
  type Initial = React.ComponentProps<typeof OpsDisputes>['initial']
  const { disputes: initial } = await backendFetchOr<{ disputes: Initial }>(
    '/api/local/admin/disputes?status=needs_action',
    { disputes: [] as unknown as Initial },
  )

  return <OpsDisputes initial={initial} />
}
