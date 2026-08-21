// Gate for every page inside the /ops admin console (A1, A4).
//
// This lives in a (console) route group on purpose: a Next.js layout wraps ALL
// nested routes, so gating at src/app/ops/layout.tsx would also gate /ops/login and
// loop forever. Route groups don't affect URLs — /ops, /ops/payments and /ops/staff
// are unchanged — while /ops/login and /ops/forgot sit outside as ungated siblings.
//
// The session is resolved server-side (so an unauthenticated visitor never receives
// the console HTML at all) and handed to the client tree via OpsSessionProvider,
// which also runs the idle-logout timer.
//
// The chrome — top bar and sidebar — is rendered here rather than by each page, so
// it survives navigation instead of being torn down and rebuilt fifteen times over.
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { opsMe, STAFF_COOKIE } from '@/lib/backend'
import { OpsSessionProvider } from './ops-session'
import { OpsShell } from './ops-shell'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function OpsConsoleLayout({ children }: { children: React.ReactNode }) {
  // The cookie is read only to tell "signed out" from "session rejected" — its value
  // is opaque here; the backend owns the signing secret and verifies it.
  const token = (await cookies()).get(STAFF_COOKIE)?.value
  const { staff, idleMs } = await opsMe()

  if (!staff) {
    // `reason` lets the login page explain itself: a present-but-rejected cookie
    // means the session expired, went idle, or was revoked (deactivated account).
    redirect(token ? '/ops/login?reason=expired' : '/ops/login')
  }

  return (
    <OpsSessionProvider
      session={{
        staffId: staff.id,
        email: staff.email,
        fullName: staff.full_name ?? '',
        role: staff.role as never,
        modules: [...staff.modules] as never,
        legacy: Boolean(staff.legacy),
      }}
      idleMs={idleMs}
    >
      <OpsShell>{children}</OpsShell>
    </OpsSessionProvider>
  )
}
