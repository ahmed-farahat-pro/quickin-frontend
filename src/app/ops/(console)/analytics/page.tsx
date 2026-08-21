// Analytics reports (B1 bookings, B2 payments, B3 cancellations).
//
// The (console) layout has already proven a valid staff session; this adds the
// per-module check. The API routes re-check `analytics` independently — this
// redirect only stops a moderator loading a screen they cannot use.
import type { Metadata } from 'next'
import { opsSession, opsCan } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { OpsAnalytics } from './ops-analytics'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Analytics — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsAnalyticsPage() {
  const staff = await opsSession()
  if (!staff) redirect('/ops/login')
  if (!opsCan(staff, 'analytics')) redirect('/ops')

  return <OpsAnalytics />
}
