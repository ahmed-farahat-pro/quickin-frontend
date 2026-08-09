// Moderation (F5) — users the content guard caught trying to share contact details.
//
// The guard (src/lib/local/contentguard.ts) has always refused these messages; until
// the policy_violations table there was no record that it had, so someone could try
// forty times and nobody would know. This is the screen that reads that record.
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { resolveStaffSession, staffCan, STAFF_COOKIE } from '@/lib/local/staff'
import { adminListFlaggedUsers } from '@/lib/local/moderation'
import { OpsModeration } from './ops-moderation'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Moderation — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsModerationPage() {
  const staff = await resolveStaffSession((await cookies()).get(STAFF_COOKIE)?.value)
  if (!staff) redirect('/ops/login')
  if (!staffCan(staff, 'moderation')) redirect('/ops')

  let initial: Awaited<ReturnType<typeof adminListFlaggedUsers>> = []
  try {
    initial = await adminListFlaggedUsers('open')
  } catch (err) {
    // An un-migrated database must not 500 the console — the screen renders empty
    // and the operator sees the rest of /ops normally.
    console.error('ops/moderation initial load:', err)
  }

  return <OpsModeration initial={initial} />
}
