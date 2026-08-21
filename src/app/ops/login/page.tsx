// Admin-panel sign-in page (A1). Deliberately OUTSIDE the (console) route group so
// the console's session gate doesn't apply to it — gating this page would loop.
//
// Server component so `reason` is read without a Suspense boundary; the form itself
// is the client component below.
import type { Metadata } from 'next'
import { opsSession } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { StaffLoginForm } from './login-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin sign in — QuickIn',
  robots: { index: false, follow: false },
}

const NOTICES: Record<string, string> = {
  expired: 'Your session ended. Please sign in again.',
  idle: 'You were signed out after a period of inactivity.',
  reset: 'Password updated. Sign in with your new password.',
}

export default async function OpsLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  // Already signed in — skip the form.
  const staff = await opsSession()
  if (staff) redirect('/ops')

  const { reason } = await searchParams
  return <StaffLoginForm notice={reason ? (NOTICES[reason] ?? null) : null} />
}
