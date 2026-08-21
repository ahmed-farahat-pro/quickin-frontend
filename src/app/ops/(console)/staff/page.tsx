// Staff & permissions (A2, A3) — the super admin's screen for creating, editing and
// deactivating moderators and choosing which modules each one may use.
//
// The (console) layout has already proven there is a valid staff session; this page
// adds the super-admin check. The API routes re-check it independently — this
// redirect only stops a moderator from loading a screen they can't use.
import type { Metadata } from 'next'
import { opsSession, backendFetchOr } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { StaffClient, type Account } from './staff-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Staff & permissions — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsStaffPage() {
  const staff = await opsSession()
  if (!staff) redirect('/ops/login')
  if (staff.role !== 'super_admin') redirect('/ops')

  // Server-render the first list so the screen is useful before any JS runs. A backend
  // hiccup shouldn't blank the page — the client refetches on mount anyway.
  // `grantable` excludes super-admin-only modules: a moderator can never be granted
  // the ability to manage staff. The backend decides which those are.
  const [{ accounts: initial }, { grantable }] = await Promise.all([
    backendFetchOr<{ accounts: Account[] }>('/api/local/staff/accounts', { accounts: [] }),
    backendFetchOr<{ grantable: { key: string; label: string; description: string }[] }>(
      '/api/local/staff/modules', { grantable: [] }
    ),
  ])

  return (
    <StaffClient
      initialAccounts={initial}
      grantable={grantable}
      currentStaffId={staff.legacy ? null : staff.id}
    />
  )
}
