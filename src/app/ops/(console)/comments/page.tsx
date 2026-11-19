// Comments — the public Q&A on every listing, as staff see it.
//
// Comments replaced host ⇄ guest messaging, so they are now the one place users talk
// to each other in public. This screen is how staff read them, remove one, remove a
// host's reply, or ban the author. Same module as Moderation: it is the same job.
import type { Metadata } from 'next'
import { opsSession, opsCan, backendFetch } from '@/lib/backend'
import { redirect } from 'next/navigation'
import { OpsComments, type AdminComment } from './ops-comments'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Comments — Quick In Ops',
  robots: { index: false, follow: false },
}

export default async function OpsCommentsPage() {
  const staff = await opsSession()
  if (!staff) redirect('/ops/login')
  if (!opsCan(staff, 'moderation')) redirect('/ops')

  // An unreachable backend must not 500 the console, but it must not pass for "no
  // comments" either — that is how a failing query hid every comment from staff.
  let comments: AdminComment[] = []
  let reviewCount = 0
  let loadError: string | null = null
  try {
    const res = await backendFetch<{ comments: AdminComment[]; review_count?: number }>(
      '/api/local/admin/comments?scope=review',
    )
    comments = res.comments ?? []
    reviewCount = res.review_count ?? 0
  } catch (err) {
    console.error('ops comments load failed:', err instanceof Error ? err.message : err)
    loadError = 'Could not load comments. Please retry.'
  }

  return <OpsComments initial={comments} initialReviewCount={reviewCount} initialError={loadError} />
}
