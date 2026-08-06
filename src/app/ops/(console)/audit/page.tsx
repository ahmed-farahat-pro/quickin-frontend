// Audit log — every staff action, who did it and when (F2).
//
// staff_audit_log has been written since the RBAC work but never read; this is its
// first reader. Gated on `audit`, which is super-admin-only, because the log records
// who opened whose ID documents and who read whose messages.
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { resolveStaffSession, staffCan, STAFF_COOKIE } from '@/lib/local/staff'
import { getAuditLog, getAuditActions } from '@/lib/local/db'
import { parseAuditFilter } from '@/lib/local/activity-core'
import { OpsAudit } from './ops-audit'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Audit log — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsAuditPage() {
  const staff = await resolveStaffSession((await cookies()).get(STAFF_COOKIE)?.value)
  if (!staff) redirect('/ops/login')
  if (!staffCan(staff, 'audit')) redirect('/ops')

  let initial: Awaited<ReturnType<typeof getAuditLog>> = { entries: [], hasMore: false }
  let actions: string[] = []
  try {
    ;[initial, actions] = await Promise.all([
      getAuditLog(parseAuditFilter(() => null)),
      getAuditActions(),
    ])
  } catch (err) {
    console.error('ops/audit initial load:', err)
  }

  return <OpsAudit initial={initial} actions={actions} />
}
