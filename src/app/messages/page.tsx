// Inbox for pre-booking chat threads (as guest or host).
//
// This was a 'use client' page that fetched its own threads on mount, which meant
// the inbox always arrived twice: heading and two empty panels first, threads a
// round-trip later. The interactive half now lives in messages-client.tsx and the
// first list is loaded here, so the screen arrives once, with its contents.
//
// Auth moves with it. The API still enforces it — this is the same qk_token cookie
// getUserFromRequest reads, resolved a step earlier — but a signed-out visitor now
// gets the sign-in prompt in the first paint instead of after a 401 comes back.
import { cookies } from 'next/headers'
import { verifyToken, getUserRowByEmail } from '@/lib/local/auth'
import { listConversations } from '@/lib/local/db'
import { MessagesClient, type Convo } from './messages-client'

export const dynamic = 'force-dynamic'

export default async function MessagesPage() {
  const token = (await cookies()).get('qk_token')?.value
  const claims = token ? verifyToken(token) : null
  const me = claims ? await getUserRowByEmail(claims.email) : null

  // null is "the load failed", which is not the same as "no threads" — the client
  // falls back to its poll doing the first load, and shows the skeleton meanwhile.
  let initial: Convo[] | null = null
  if (me) {
    try {
      initial = await listConversations(me.id)
    } catch (err) {
      console.error('messages initial load:', err)
    }
  }

  return <MessagesClient initialConversations={initial} signedIn={Boolean(me)} />
}
