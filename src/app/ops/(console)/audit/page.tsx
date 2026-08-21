// Audit log — every staff action, who did it and when (F2).
//
// staff_audit_log has been written since the RBAC work but never read; this is its
// first reader. Gated on `audit`, which is super-admin-only, because the log records
// who opened whose ID documents and who read whose messages.
import type { Metadata } from 'next'
import { opsSession, opsCan, backendFetchOr } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { parseAuditFilter } from '@/lib/local/activity-core'
import { OpsAudit } from './ops-audit'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Audit log — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsAuditPage() {
  const staff = await opsSession()
  if (!staff) redirect('/ops/login')
  if (!opsCan(staff, 'audit')) redirect('/ops')

  // One call: the log page and the action list the filter dropdown offers.
  type Initial = React.ComponentProps<typeof OpsAudit>['initial']
  const { entries, hasMore, actions } = await backendFetchOr<{
    entries: Initial['entries']; hasMore: boolean; actions: string[]
  }>('/api/local/admin/audit', { entries: [] as unknown as Initial['entries'], hasMore: false, actions: [] })
  const initial = { entries, hasMore } as Initial

  return <OpsAudit initial={initial} actions={actions} />
}
