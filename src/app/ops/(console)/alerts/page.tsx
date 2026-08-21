// Alerts — every queue that needs a human, in one place (F4).
//
// Derived counts, not stored notifications: an alert disappears exactly when the work
// is done, and there is no read/unread state that could disagree with reality.
import type { Metadata } from 'next'
import { opsSession, opsCan, backendFetchOr } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { alertsFor } from '@/lib/local/activity-core'
import { OpsAlerts } from './ops-alerts'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Alerts — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsAlertsPage() {
  const staff = await opsSession()
  if (!staff) redirect('/ops/login')
  if (!opsCan(staff, 'overview')) redirect('/ops')

  // The backend already filters the alert list to what this operator may act on and
  // resolves the "oldest waiting" timestamps, so the page just renders them.
  const { alerts, oldest } = await backendFetchOr<{
    alerts: ReturnType<typeof alertsFor>
    oldest: Record<string, string | null>
  }>('/api/local/admin/alerts', { alerts: [], oldest: {} })

  return <OpsAlerts initialAlerts={alerts} initialOldest={oldest} />
}
