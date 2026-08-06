// Users — the directory of every guest and host (D1), and the way into one
// person's profile (D2).
//
// The (console) layout has already proven a valid staff session; this adds the
// per-module check. The API routes re-check `users` independently.
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { resolveStaffSession, staffCan, STAFF_COOKIE } from '@/lib/local/staff'
import { adminSearchUsers } from '@/lib/local/db'
import { parseUserListFilter } from '@/lib/local/user-admin-core'
import { OpsUsers } from './ops-users'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Users — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsUsersPage() {
  const staff = await resolveStaffSession((await cookies()).get(STAFF_COOKIE)?.value)
  if (!staff) redirect('/ops/login')
  if (!staffCan(staff, 'users')) redirect('/ops')

  // Server-render the first page so the screen is useful immediately — the same
  // shape /ops/resorts and /ops/staff use. The client refetches whenever a filter
  // changes or a mutation lands.
  const filter = parseUserListFilter(() => null)
  let initial: { users: Awaited<ReturnType<typeof adminSearchUsers>>['users']; total: number } = {
    users: [],
    total: 0,
  }
  try {
    initial = await adminSearchUsers(filter)
  } catch (err) {
    // A DB hiccup shouldn't blank the page — the client refetches on mount anyway.
    console.error('ops/users initial load:', err)
  }

  return <OpsUsers initial={initial} />
}
