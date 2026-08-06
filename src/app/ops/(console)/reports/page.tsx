// Reports — user-filed abuse reports (F4).
//
// The reports table, the filing route and the `reports` staff module have all existed
// since the trust work; this console never had a screen, so nothing filed here had
// ever been seen. This is that screen.
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { resolveStaffSession, staffCan, STAFF_COOKIE } from '@/lib/local/staff'
import { adminListReports } from '@/lib/local/db'
import { OpsReports } from './ops-reports'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Reports — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsReportsPage() {
  const staff = await resolveStaffSession((await cookies()).get(STAFF_COOKIE)?.value)
  if (!staff) redirect('/ops/login')
  if (!staffCan(staff, 'reports')) redirect('/ops')

  let initial: Awaited<ReturnType<typeof adminListReports>> = []
  try {
    initial = await adminListReports('open')
  } catch (err) {
    console.error('ops/reports initial load:', err)
  }

  return <OpsReports initial={initial} />
}
