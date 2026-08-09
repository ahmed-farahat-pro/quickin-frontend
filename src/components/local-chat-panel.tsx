'use client'

// Local-stack chat panel (no Supabase). Given either an existing conversationId
// or a listingId (opens/reuses the guest⇄host thread), it polls messages every
// few seconds and sends new ones. Used by the listing "Message host" drawer and
// the /messages page.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ShimmerStyles, SkeletonChatBubbles } from '@/components/ui/skeleton-block'
// The same module the server enforces with — imported here only so the sender
// gets the answer instantly. The server still checks; this is never the gate.
import { inspectContent } from '@/lib/local/contentguard'
import { WARNING_GATE_STATUS } from '@/lib/local/moderation-core'

const C = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

interface Msg {
  id: string
  body: string
  created_at: string
  mine?: boolean
}

export default function LocalChatPanel({
  conversationId: initialId,
  listingId,
}: {
  conversationId?: string
  listingId?: string
}) {
  const t = useTranslations('chat')
  const [convoId, setConvoId] = useState<string | null>(initialId ?? null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [state, setState] = useState<'loading' | 'ready' | 'needsLogin' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  // A policy warning the user must read before they can send again. Set from the
  // send response; cleared once they acknowledge it.
  const [warning, setWarning] = useState<{ id: string; message: string } | null>(null)
  const [acking, setAcking] = useState(false)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Open/reuse a thread from a listingId when no conversationId was provided.
  useEffect(() => {
    let cancelled = false
    async function open() {
      if (convoId || !listingId) return
      try {
        const res = await fetch('/api/local/chat', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId }),
        })
        if (res.status === 401) { if (!cancelled) setState('needsLogin'); return }
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to open chat')
        if (!cancelled) setConvoId(data.conversationId)
      } catch (e) {
        if (!cancelled) { setState('error'); setErrorMsg(e instanceof Error ? e.message : 'Error') }
      }
    }
    open()
    return () => { cancelled = true }
  }, [convoId, listingId])

  const load = useCallback(async () => {
    if (!convoId) return
    try {
      const res = await fetch(`/api/local/chat?conversationId=${encodeURIComponent(convoId)}`, {
        credentials: 'same-origin',
      })
      if (res.status === 401) { setState('needsLogin'); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load messages')
      setMessages(data.messages ?? [])
      setState('ready')
    } catch (e) {
      setState('error'); setErrorMsg(e instanceof Error ? e.message : 'Error')
    }
  }, [convoId])

  // Poll while a thread is open.
  useEffect(() => {
    if (!convoId) return
    load()
    const id = setInterval(load, 4000)
    return () => clearInterval(id)
  }, [convoId, load])

  // Keep the view pinned to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || !convoId || sending) return
    // Answer locally first: same policy, no round trip, and the message stays in
    // the box so the sender can edit rather than retype it. The server rejects
    // it too — a client can always skip this, which is why it isn't the gate.
    const verdict = inspectContent(body, 'chat')
    if (verdict.blocked) {
      setErrorMsg(verdict.message!)
      return
    }
    setErrorMsg('')
    setSending(true)
    setText('')
    try {
      const res = await fetch('/api/local/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: convoId, body }),
      })
      if (res.status === 401) { setState('needsLogin'); return }
      const data = await res.json().catch(() => ({}))
      // A moderator has issued a warning that hasn't been read. The message is
      // kept, not lost — acknowledging re-enables the box and they can send it.
      if (res.status === WARNING_GATE_STATUS && data.policyWarning) {
        setWarning(data.policyWarning)
        setText(body)
        return
      }
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      setMessages((prev) => [...prev, data.message])
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error')
      setText(body) // restore so the user doesn't lose their message
    } finally {
      setSending(false)
    }
  }

  if (state === 'needsLogin') {
    return (
      <div style={{ padding: 16, fontSize: 14, color: C.ink }}>
        {t('needsLogin')}{' '}
        <a href="/login" style={{ color: C.burgundy, fontWeight: 700, textDecoration: 'none' }}>{t('logIn')}</a>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', minHeight: 0 }}>
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '4px 2px',
        }}
      >
        {/* The transcript takes a moment on every open — this panel is a drawer on
            listing pages as well as the /messages thread, so it is the one placeholder
            a guest is most likely to see. */}
        {state === 'loading' && (
          <>
            <ShimmerStyles />
            <SkeletonChatBubbles count={4} />
          </>
        )}
        {state === 'ready' && messages.length === 0 && (
          <p style={{ fontSize: 13, color: C.muted }}>{t('empty')}</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.mine ? 'flex-end' : 'flex-start',
              maxWidth: '78%',
              background: m.mine ? C.burgundy : C.tan,
              color: m.mine ? '#fff' : C.ink,
              padding: '9px 13px',
              borderRadius: 14,
              fontSize: 14,
              lineHeight: 1.4,
              wordBreak: 'break-word',
            }}
          >
            {m.body}
          </div>
        ))}
      </div>

      {errorMsg && <p style={{ margin: 0, fontSize: 12.5, color: '#b3261e' }}>{errorMsg}</p>}

      {/* The acknowledge gate. It replaces the composer rather than sitting above
          it: the point is that sending is not available until this is read, and a
          notice you can ignore while still typing is not that. */}
      {warning ? (
        <div style={{ background: '#FDECEA', border: '1px solid #F3C0BA', borderRadius: 14, padding: '13px 15px' }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#8C1D18' }}>
            {t('warningTitle')}
          </p>
          <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.45, color: C.ink, whiteSpace: 'pre-wrap' }}>
            {warning.message}
          </p>
          <button
            type="button"
            disabled={acking}
            onClick={async () => {
              setAcking(true)
              try {
                const res = await fetch('/api/local/policy-warning', {
                  method: 'POST',
                  credentials: 'same-origin',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: warning.id }),
                })
                // Only drop the gate if the server agrees. Clearing it locally on a
                // failed call would just bounce their next message off the same 409.
                if (res.ok) setWarning(null)
                else setErrorMsg(t('warningAckFailed'))
              } catch {
                setErrorMsg(t('warningAckFailed'))
              } finally {
                setAcking(false)
              }
            }}
            style={{
              border: 'none', borderRadius: 999, padding: '9px 18px', cursor: acking ? 'default' : 'pointer',
              background: C.burgundy, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            {acking ? '…' : t('warningAck')}
          </button>
        </div>
      ) : (
      <form onSubmit={send} style={{ display: 'flex', gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('placeholder')}
          disabled={!convoId}
          style={{
            flex: 1,
            fontFamily: 'inherit',
            fontSize: 14,
            padding: '10px 13px',
            border: `1px solid ${C.tan}`,
            borderRadius: 12,
            outline: 'none',
            background: '#fff',
            color: C.ink,
          }}
        />
        <button
          type="submit"
          disabled={!convoId || sending || !text.trim()}
          style={{
            background: C.burgundy,
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            padding: '10px 18px',
            fontWeight: 700,
            fontSize: 14,
            fontFamily: 'inherit',
            cursor: !convoId || sending || !text.trim() ? 'default' : 'pointer',
            opacity: !convoId || sending || !text.trim() ? 0.6 : 1,
          }}
        >
          {t('send')}
        </button>
      </form>
      )}
      <p style={{ margin: 0, fontSize: 11.5, color: C.muted, textAlign: 'center' }}>{t('guardNote')}</p>
    </div>
  )
}
