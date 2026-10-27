// Host response — booking requests a host has left unanswered for 24h+.
//
// Written nightly (01:00 UTC, about 3 AM Cairo) by the backend's host-response sweep, which also
// reminds the host. Staff work the queue here: contact the host, then mark the
// alert handled with a note. The booking itself is still the host's to decide, or
// staff's through Booking Requests.
import type { Metadata } from 'next'
import { opsSession, opsCan, backendFetchOr } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { OpsHostResponse } from './ops-host-response'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Host response — Quick In Ops',
  robots: { index: false, follow: false },
}

export default async function OpsHostResponsePage() {
  const staff = await opsSession()
  if (!staff) redirect('/ops/login')
  if (!opsCan(staff, 'bookings')) redirect('/ops')

  // An unreachable backend must not 500 the console — the screen renders empty.
  type Initial = React.ComponentProps<typeof OpsHostResponse>['initial']
  const { alerts: initial } = await backendFetchOr<{ alerts: Initial }>(
    '/api/local/admin/host-response-alerts?status=open',
    { alerts: [] as unknown as Initial },
  )

  return <OpsHostResponse initial={initial} />
}
