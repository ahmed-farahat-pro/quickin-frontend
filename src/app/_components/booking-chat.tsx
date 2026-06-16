'use client'

// Per-booking chat thread (host ↔ guest). Reusable client component used on the
// guest reservation page and inside each host reservation request row. Talks to
// the backend with the bearer token in qk_token:
//   GET  /api/local/bookings/:id/messages  -> messages oldest-first
//   POST /api/local/bookings/:id/messages  { body } -> 201 the new message
// Access is enforced server-side (booking's guest or listing's host); a stranger
// gets 403. We decide "mine" vs "theirs" from getStoredUser().id, poll every ~4s,
// and auto-scroll to the newest message.
import { useCallback, useEffect, useRef, useState } from 'react'
import { API_URL, getStoredUser, getToken } from '@/lib/api'
import { useLanguage } from '@/lib/i18n/language-provider'
import { useToast } from './toast'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

const POLL_MS = 4000

interface ChatMessage {
  id: string
  booking_id: string
  sender_id: string
  sender_name: string
  body: string
  created_at: string
}

// Short, friendly timestamp: "2:14 PM" today, otherwise "Jun 12, 2:14 PM".
function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  if (sameDay) return time
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${day}, ${time}`
}

type Load =
  | { kind: 'loading' }
  | { kind: 'anon' }
  | { kind: 'forbidden' }
  | { kind: 'error' }
  | { kind: 'ready' }

export default function BookingChat({ bookingId }: { bookingId: string }) {
  const { t } = useLanguage()
  const toast = useToast()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [myId, setMyId] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  // Track whether the very first load has happened, so polling errors don't
  // wipe out an already-rendered thread.
  const loadedOnce = useRef(false)

  // Capture the signed-in user's id once on mount (used for mine vs theirs).
  useEffect(() => {
    setMyId(getStoredUser()?.id ?? null)
  }, [])

  const fetchMessages = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setLoad({ kind: 'anon' })
      return
    }
    try {
      const res = await fetch(
        `${API_URL}/api/local/bookings/${bookingId}/messages`,
        { headers: { Authorization: 'Bearer ' + token } }
      )
      if (res.status === 401) {
        setLoad({ kind: 'anon' })
        return
      }
      if (res.status === 403) {
        setLoad({ kind: 'forbidden' })
        return
      }
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = (await res.json()) as ChatMessage[]
      setMessages(Array.isArray(data) ? data : [])
      loadedOnce.current = true
      setLoad({ kind: 'ready' })
    } catch {
      // Only surface an error if we never managed a first successful load;
      // a transient poll failure shouldn't blow away the visible thread.
      if (!loadedOnce.current) setLoad({ kind: 'error' })
    }
  }, [bookingId])

  // Initial fetch + ~4s polling. Interval is cleared on unmount.
  useEffect(() => {
    let active = true
    loadedOnce.current = false
    setLoad({ kind: 'loading' })
    setMessages([])
    fetchMessages()
    const timer = setInterval(() => {
      if (active) fetchMessages()
    }, POLL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [fetchMessages])

  // Auto-scroll to the bottom whenever the message list grows.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    const token = getToken()
    if (!token) {
      setLoad({ kind: 'anon' })
      return
    }
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(
        `${API_URL}/api/local/bookings/${bookingId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
          },
          body: JSON.stringify({ body }),
        }
      )
      if (res.status === 401) {
        setLoad({ kind: 'anon' })
        return
      }
      if (res.status !== 201 && !res.ok) {
        // Surface the server's explanation (e.g. the 400 "sharing phone numbers
        // in chat isn't allowed" block) instead of a generic failure. Crucially
        // we DON'T clear the draft, so the guest can edit and resend.
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null
        const serverMsg = data?.error?.trim()
        const message =
          serverMsg ||
          (res.status === 403
            ? t('chat.noAccess')
            : t('chat.sendError'))
        setSendError(message)
        toast.show(message, { kind: 'error' })
        return
      }
      const created = (await res.json().catch(() => null)) as ChatMessage | null
      // Only clear the input once the send actually succeeded.
      setDraft('')
      // Optimistically append, then a refresh reconciles with the server.
      if (created && created.id) {
        setMessages((prev) =>
          prev.some((m) => m.id === created.id) ? prev : [...prev, created]
        )
      }
      fetchMessages()
    } catch {
      // Network / parse failure — keep the draft so they can retry.
      const message = t('chat.sendError')
      setSendError(message)
      toast.show(message, { kind: 'error' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        fontFamily: FONT,
        color: COLORS.ink,
      }}
    >
      {/* Message list */}
      <div
        ref={scrollRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxHeight: 320,
          overflowY: 'auto',
          padding: '14px',
          background: COLORS.cream,
          border: '1px solid rgba(42,34,32,0.08)',
          borderRadius: 16,
        }}
      >
        {load.kind === 'loading' && (
          <p style={{ margin: 0, fontSize: 14, color: COLORS.muted }}>
            {t('chat.loading')}
          </p>
        )}
        {load.kind === 'anon' && (
          <p style={{ margin: 0, fontSize: 14, color: COLORS.muted }}>
            {t('chat.signIn')}
          </p>
        )}
        {load.kind === 'forbidden' && (
          <p style={{ margin: 0, fontSize: 14, color: COLORS.muted }}>
            {t('chat.noAccess')}
          </p>
        )}
        {load.kind === 'error' && (
          <p style={{ margin: 0, fontSize: 14, color: COLORS.burgundy }}>
            {t('chat.loadError')}
          </p>
        )}
        {load.kind === 'ready' && messages.length === 0 && (
          <p style={{ margin: 0, fontSize: 14, color: COLORS.muted }}>
            {t('chat.empty')}
          </p>
        )}

        {messages.map((m) => {
          const mine = myId != null && m.sender_id === myId
          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: mine ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '78%',
                  padding: '9px 13px',
                  borderRadius: 14,
                  borderTopRightRadius: mine ? 4 : 14,
                  borderTopLeftRadius: mine ? 14 : 4,
                  background: mine ? COLORS.burgundy : '#fff',
                  color: mine ? COLORS.cream : COLORS.ink,
                  border: mine
                    ? 'none'
                    : '1px solid rgba(42,34,32,0.10)',
                  boxShadow: '0 2px 8px rgba(42,34,32,0.06)',
                  fontSize: 14,
                  lineHeight: 1.4,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {m.body}
              </div>
              <span
                style={{
                  margin: '3px 4px 0',
                  fontSize: 11,
                  color: COLORS.muted,
                }}
              >
                {mine ? t('chat.you') : m.sender_name || t('chat.guest')} ·{' '}
                {fmtTime(m.created_at)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Composer — hidden when the viewer can't participate. */}
      {load.kind !== 'anon' && load.kind !== 'forbidden' && (
        <form
          onSubmit={send}
          style={{ display: 'flex', gap: 8, marginTop: 12 }}
        >
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setSendError(null)
            }}
            placeholder={t('chat.placeholder')}
            style={{
              flex: 1,
              minWidth: 0,
              boxSizing: 'border-box',
              padding: '11px 14px',
              fontSize: 14,
              fontFamily: FONT,
              color: COLORS.ink,
              background: '#fff',
              border: '1px solid rgba(42,34,32,0.14)',
              borderRadius: 14,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            style={{
              padding: '11px 22px',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: FONT,
              color: '#fff',
              background: COLORS.burgundy,
              border: 'none',
              borderRadius: 14,
              cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer',
              opacity: sending || !draft.trim() ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {sending ? t('chat.sending') : t('chat.send')}
          </button>
        </form>
      )}

      {sendError && (
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.burgundy,
          }}
        >
          {sendError}
        </p>
      )}
    </div>
  )
}
