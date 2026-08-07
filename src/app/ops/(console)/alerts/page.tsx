// Alerts — every queue that needs a human, in one place (F4).
//
// Derived counts, not stored notifications: an alert disappears exactly when the work
// is done, and there is no read/unread state that could disagree with reality.
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { resolveStaffSession, staffCan, STAFF_COOKIE } from '@/lib/local/staff'
import { adminStats } from '@/lib/local/db'
import { alertsFor } from '@/lib/local/activity-core'
import { OpsAlerts } from './ops-alerts'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Alerts — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsAlertsPage() {
  const staff = await resolveStaffSession((await cookies()).get(STAFF_COOKIE)?.value)
  if (!staff) redirect('/ops/login')
  if (!staffCan(staff, 'overview')) redirect('/ops')

  let alerts: ReturnType<typeof alertsFor> = []
  let oldest: Record<string, string | null> = {}
  try {
    const stats = await adminStats()
    alerts = alertsFor(stats as unknown as Record<string, number>, {
      modules: staff.modules ?? [],
      isSuperAdmin: staff.role === 'super_admin',
    })
    oldest = {
      pending_verifications: stats.oldest_verification,
      pending_applications: stats.oldest_application,
      pending_listings: stats.oldest_listing,
      pending_payments: stats.oldest_payment,
      open_reports: stats.oldest_report,
    }
  } catch (err) {
    console.error('ops/alerts initial load:', err)
  }

  return <OpsAlerts initialAlerts={alerts} initialOldest={oldest} />
}
