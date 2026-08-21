// Users — the directory of every guest and host (D1), and the way into one
// person's profile (D2).
//
// The (console) layout has already proven a valid staff session; this adds the
// per-module check. The API routes re-check `users` independently.
import type { Metadata } from 'next'
import { opsSession, opsCan, backendFetchOr } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { parseUserListFilter } from '@/lib/local/user-admin-core'
import { OpsUsers } from './ops-users'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Users — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsUsersPage() {
  const staff = await opsSession()
  if (!staff) redirect('/ops/login')
  if (!opsCan(staff, 'users')) redirect('/ops')

  // Server-render the first page so the screen is useful immediately — the same
  // shape /ops/resorts and /ops/staff use. The client refetches whenever a filter
  // changes or a mutation lands.
  // A backend hiccup shouldn't blank the page — the client refetches on mount anyway.
  type Initial = React.ComponentProps<typeof OpsUsers>['initial']
  const initial = await backendFetchOr<Initial>(
    '/api/local/admin/users',
    { users: [], total: 0 } as unknown as Initial,
  )

  return <OpsUsers initial={initial} />
}
