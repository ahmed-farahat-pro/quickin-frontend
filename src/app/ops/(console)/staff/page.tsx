// Staff & permissions (A2, A3) — the super admin's screen for creating, editing and
// deactivating moderators and choosing which modules each one may use.
//
// The (console) layout has already proven there is a valid staff session; this page
// adds the super-admin check. The API routes re-check it independently — this
// redirect only stops a moderator from loading a screen they can't use.
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { resolveStaffSession, STAFF_COOKIE, GRANTABLE_MODULES } from '@/lib/local/staff'
import { listStaffAccounts } from '@/lib/local/db'
import { StaffClient } from './staff-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Staff & permissions — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsStaffPage() {
  const staff = await resolveStaffSession((await cookies()).get(STAFF_COOKIE)?.value)
  if (!staff) redirect('/ops/login')
  if (staff.role !== 'super_admin') redirect('/ops')

  // Server-render the first list so the screen is useful before any JS runs. A DB
  // hiccup shouldn't blank the page — the client refetches on mount anyway.
  let initial: Awaited<ReturnType<typeof listStaffAccounts>> = []
  try {
    initial = await listStaffAccounts()
  } catch (err) {
    console.error('ops/staff initial load:', err)
  }

  return (
    <StaffClient
      initialAccounts={initial}
      grantable={GRANTABLE_MODULES.map((m) => ({ key: m.key, label: m.label, description: m.description }))}
      currentStaffId={staff.legacy ? null : staff.staffId}
    />
  )
}
