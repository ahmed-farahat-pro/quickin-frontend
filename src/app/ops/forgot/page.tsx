// Staff password reset (A5). Outside the (console) route group — an operator who
// cannot sign in must be able to reach this.
import type { Metadata } from 'next'
import { StaffForgotForm } from './forgot-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Reset admin password — QuickIn',
  robots: { index: false, follow: false },
}

export default function OpsForgotPage() {
  return <StaffForgotForm />
}
