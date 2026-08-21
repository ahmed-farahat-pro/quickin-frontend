// Moderation (F5) — users the content guard caught trying to share contact details.
//
// The guard (src/lib/local/contentguard.ts) has always refused these messages; until
// the policy_violations table there was no record that it had, so someone could try
// forty times and nobody would know. This is the screen that reads that record.
import type { Metadata } from 'next'
import { opsSession, opsCan, backendFetchOr } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { OpsModeration } from './ops-moderation'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Moderation — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsModerationPage() {
  const staff = await opsSession()
  if (!staff) redirect('/ops/login')
  if (!opsCan(staff, 'moderation')) redirect('/ops')

  // An unreachable backend must not 500 the console — the screen renders empty and
  // the operator sees the rest of /ops normally.
  type Initial = React.ComponentProps<typeof OpsModeration>['initial']
  const { users: initial } = await backendFetchOr<{ users: Initial }>(
    '/api/local/admin/moderation?scope=open',
    { users: [] as unknown as Initial },
  )

  return <OpsModeration initial={initial} />
}
