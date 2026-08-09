import { NextResponse } from 'next/server'
import {
  getOrCreateConversation,
  listConversations,
  listMessages,
  postMessage,
} from '@/lib/local/db'
import { getUserFromRequest } from '@/lib/local/auth'
import { pendingWarningFor } from '@/lib/local/moderation'
import { warningGateBody, WARNING_GATE_STATUS } from '@/lib/local/moderation-core'

// Pre-booking chat (guest ⇄ host), local stack. Polled by the web client.
//   GET  /api/local/chat                       → { conversations }
//   GET  /api/local/chat?conversationId=…      → { messages }
//   POST /api/local/chat { listingId }         → { conversationId } (open/reuse a thread)
//   POST /api/local/chat { conversationId, body } → { message }     (send)
export const dynamic = 'force-dynamic'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }

export async function GET(req: Request) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401, headers: CORS })
    const conversationId = new URL(req.url).searchParams.get('conversationId')
    if (conversationId) {
      const messages = await listMessages(user.id, conversationId)
      return NextResponse.json({ messages }, { headers: CORS })
    }
    const conversations = await listConversations(user.id)
    return NextResponse.json({ conversations }, { headers: CORS })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = /not found|Invalid/i.test(msg) ? 400 : 500
    return NextResponse.json({ error: msg }, { status, headers: CORS })
  }
}

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401, headers: CORS })
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: CORS })

    if (body.conversationId && typeof body.body === 'string') {
      // The acknowledge gate: a warned user can read the thread but cannot send
      // until they have confirmed they've read the warning. Server-side, so no
      // client can skip it.
      const warning = await pendingWarningFor(user.id)
      if (warning) {
        return NextResponse.json(warningGateBody(warning), { status: WARNING_GATE_STATUS, headers: CORS })
      }
      const message = await postMessage(user.id, String(body.conversationId), String(body.body))
      return NextResponse.json({ message }, { status: 201, headers: CORS })
    }
    if (body.listingId) {
      const convo = await getOrCreateConversation(user.id, String(body.listingId))
      return NextResponse.json({ conversationId: convo.id, listingTitle: convo.listing_title }, { status: 201, headers: CORS })
    }
    return NextResponse.json({ error: 'Nothing to do' }, { status: 400, headers: CORS })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = /not found|Invalid|empty|own listing|no host|isn’t allowed/i.test(msg) ? 400 : 500
    return NextResponse.json({ error: msg }, { status, headers: CORS })
  }
}
