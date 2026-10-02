// Comments — the public Q&A on every listing, as staff see it.
//
// Comments replaced host ⇄ guest messaging, so they are now the one place users talk
// to each other in public. This screen is how staff read them, remove one, remove a
// host's reply, or ban the author. Same module as Moderation: it is the same job.
import type { Metadata } from 'next'
import { opsSession, opsCan, backendFetchOr } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { OpsComments, type AdminComment } from './ops-comments'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Comments — QuickIn Ops',
  robots: { index: false, follow: false },
}

export default async function OpsCommentsPage() {
  const staff = await opsSession()
  if (!staff) redirect('/ops/login')
  if (!opsCan(staff, 'moderation')) redirect('/ops')

  // An unreachable backend must not 500 the console — the screen renders empty.
  const { comments } = await backendFetchOr<{ comments: AdminComment[] }>(
    '/api/local/admin/comments?scope=visible',
    { comments: [] },
  )

  return <OpsComments initial={comments} />
}
