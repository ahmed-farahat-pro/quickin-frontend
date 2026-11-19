// Notifications — send a push (+ in-app, optional email) to hand-picked users or a
// whole segment. The backend owns validation and delivery (POST admin/notify).
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { opsSession, opsCan } from '@/lib/backend'
import { OpsNotify } from './ops-notify'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Notifications — Quick In Ops',
  robots: { index: false, follow: false },
}

export default async function OpsNotificationsPage() {
  const staff = await opsSession()
  if (!staff) redirect('/ops/login')
  if (!opsCan(staff, 'notify')) redirect('/ops')
  return <OpsNotify />
}
