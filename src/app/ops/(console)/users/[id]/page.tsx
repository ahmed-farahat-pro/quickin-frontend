// One user's profile (D2), and the block / remove controls (D3, D4).
//
// The first dynamic segment anywhere under /ops. It sits inside the (console) route
// group, so the group layout has already proven a valid staff session and supplied
// OpsSessionProvider; this adds the per-module check. The API routes re-check
// `users` independently.
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { resolveStaffSession, staffCan, STAFF_COOKIE } from '@/lib/local/staff'
import { adminGetUserDetail } from '@/lib/local/db'
import { OpsUserDetail } from './ops-user-detail'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'User — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsUserPage(ctx: { params: Promise<{ id: string }> }) {
  const staff = await resolveStaffSession((await cookies()).get(STAFF_COOKIE)?.value)
  if (!staff) redirect('/ops/login')
  if (!staffCan(staff, 'users')) redirect('/ops')

  const { id } = await ctx.params
  // Server-rendered, unlike a client fetch: a profile that arrives empty and fills in
  // later is exactly the failure mode other /ops screens have hit.
  const initial = await adminGetUserDetail(id)
  if (!initial) notFound()

  return <OpsUserDetail initial={initial} isSuperAdmin={staff.role === 'super_admin'} />
}
