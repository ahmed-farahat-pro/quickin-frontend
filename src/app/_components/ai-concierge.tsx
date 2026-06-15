'use client'

// QuickIn AI travel concierge — a floating "Ask AI" button + chat panel that
// answers "where should I go in Egypt?" questions. Streams the reply token-by-
// token from the backend Server-Sent-Events endpoint:
//   POST {API_URL}/api/local/ai/chat  { messages: [{role, content}] }
//     -> data: {"delta":"..."}\n\n  (per token) ... data: [DONE]\n\n
// The OpenAI key lives only on the backend; this just renders the stream.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/lib/i18n/language-provider'

const COLORS = {
  burgundy: '#5B0F16',
  burgundyLight: '#8A2530',
  gold: '#B07A2A',
  goldLight: '#F3C969',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  white: '#FFFFFF',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

export default function AIConcierge() {
  const { t, lang } = useLanguage()
  const rtl = lang === 'ar'

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-scroll to the newest content as it streams in.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, open])

  // Cancel any in-flight stream when the panel closes / unmounts.
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || streaming) return
      setError(null)
      setInput('')

      // Append the user turn + an empty assistant turn we'll stream into.
      const next: Msg[] = [
        ...messages,
        { role: 'user', content: trimmed },
        { role: 'assistant', content: '' },
      ]
      setMessages(next)
      setStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      // The history we send: everything except the trailing empty assistant.
      const payload = next.slice(0, -1).map((m) => ({ role: m.role, content: m.content }))

      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: payload }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          let msg = t('ai.error')
          try {
            const j = await res.json()
            if (j?.error) msg = String(j.error)
          } catch {
            /* keep generic */
          }
          throw new Error(msg)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let streamDone = false

        while (!streamDone) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''
          for (const part of parts) {
            const line = part.trim()
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (data === '[DONE]') {
              streamDone = true
              break
            }
            try {
              const json = JSON.parse(data)
              if (json.error) throw new Error(String(json.error))
              if (typeof json.delta === 'string') {
                setMessages((cur) => {
                  const copy = cur.slice()
                  const last = copy[copy.length - 1]
                  if (last && last.role === 'assistant') {
                    copy[copy.length - 1] = { role: 'assistant', content: last.content + json.delta }
                  }
                  return copy
                })
              }
            } catch (e) {
              if (e instanceof Error && e.message && e.message !== 'Unexpected end of JSON input') {
                // Surface backend-sent errors; ignore JSON parse hiccups.
                if (data.includes('"error"')) throw e
              }
            }
          }
        }
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return
        setError((e as Error)?.message || t('ai.error'))
        // Drop the empty assistant bubble on failure.
        setMessages((cur) => {
          const copy = cur.slice()
          if (copy.length && copy[copy.length - 1].role === 'assistant' && !copy[copy.length - 1].content) {
            copy.pop()
          }
          return copy
        })
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [messages, streaming, t]
  )

  const suggestions = [t('ai.suggest1'), t('ai.suggest2'), t('ai.suggest3'), t('ai.suggest4')]
  const side = rtl ? { left: 20 } : { right: 20 }

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={t('ai.open')}
          style={{
            position: 'fixed',
            bottom: 22,
            ...side,
            zIndex: 1000,
            width: 60,
            height: 60,
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            background: `linear-gradient(135deg, ${COLORS.burgundy}, ${COLORS.burgundyLight})`,
            color: COLORS.cream,
            boxShadow: '0 10px 26px rgba(91,15,22,0.40)',
            display: 'grid',
            placeItems: 'center',
            fontFamily: FONT,
          }}
        >
          <SparkleIcon size={26} />
          <span
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: `2px solid ${COLORS.goldLight}`,
              opacity: 0.5,
              animation: 'qkAiPulse 2s ease-out infinite',
            }}
          />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          dir={rtl ? 'rtl' : 'ltr'}
          style={{
            position: 'fixed',
            bottom: 20,
            ...side,
            zIndex: 1000,
            width: 'min(390px, calc(100vw - 32px))',
            height: 'min(620px, calc(100vh - 40px))',
            display: 'flex',
            flexDirection: 'column',
            background: COLORS.cream,
            borderRadius: 24,
            overflow: 'hidden',
            boxShadow: '0 24px 60px rgba(20,17,15,0.34)',
            fontFamily: FONT,
            animation: 'qkAiIn 0.28s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              background: `linear-gradient(135deg, ${COLORS.burgundy}, ${COLORS.burgundyLight})`,
              color: COLORS.cream,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'rgba(243,201,105,0.18)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <SparkleIcon size={22} color={COLORS.goldLight} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{t('ai.title')}</div>
              <div style={{ fontSize: 12, opacity: 0.82 }}>{t('ai.subtitle')}</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label={t('ai.close')}
              style={{
                background: 'rgba(246,241,230,0.16)',
                border: 'none',
                color: COLORS.cream,
                width: 32,
                height: 32,
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          {/* Transcript */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {messages.length === 0 ? (
              <div>
                <Bubble role="assistant">{t('ai.greeting')}</Bubble>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      style={{
                        border: `1px solid ${COLORS.tan}`,
                        background: COLORS.white,
                        color: COLORS.burgundy,
                        borderRadius: 999,
                        padding: '8px 14px',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: FONT,
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <Bubble key={i} role={m.role}>
                  {m.content || (m.role === 'assistant' && streaming ? <TypingDots /> : '')}
                </Bubble>
              ))
            )}
            {error && (
              <div
                style={{
                  marginTop: 10,
                  padding: '10px 12px',
                  background: '#FBE9E7',
                  color: COLORS.burgundy,
                  borderRadius: 12,
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            style={{
              display: 'flex',
              gap: 8,
              padding: 12,
              borderTop: `1px solid ${COLORS.tan}`,
              background: COLORS.cream,
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('ai.placeholder')}
              disabled={streaming}
              style={{
                flex: 1,
                border: `1px solid ${COLORS.tan}`,
                background: COLORS.white,
                borderRadius: 999,
                padding: '11px 16px',
                fontSize: 14,
                color: COLORS.ink,
                outline: 'none',
                fontFamily: FONT,
              }}
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              aria-label={t('ai.send')}
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                border: 'none',
                cursor: streaming || !input.trim() ? 'default' : 'pointer',
                background: `linear-gradient(135deg, ${COLORS.burgundy}, ${COLORS.burgundyLight})`,
                color: COLORS.cream,
                opacity: streaming || !input.trim() ? 0.5 : 1,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                transform: rtl ? 'scaleX(-1)' : 'none',
              }}
            >
              <SendIcon />
            </button>
          </form>
        </div>
      )}

      <style>{`
        @keyframes qkAiPulse { 0% { transform: scale(1); opacity: 0.5 } 100% { transform: scale(1.5); opacity: 0 } }
        @keyframes qkAiIn { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes qkAiDot { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4 } 30% { transform: translateY(-4px); opacity: 1 } }
      `}</style>
    </>
  )
}

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  const isUser = role === 'user'
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 10,
      }}
    >
      <div
        style={{
          maxWidth: '82%',
          padding: '10px 14px',
          borderRadius: 18,
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          background: isUser ? `linear-gradient(135deg, ${COLORS.burgundy}, ${COLORS.burgundyLight})` : COLORS.white,
          color: isUser ? COLORS.cream : COLORS.ink,
          border: isUser ? 'none' : `1px solid ${COLORS.tan}`,
          borderBottomRightRadius: isUser ? 4 : 18,
          borderBottomLeftRadius: isUser ? 18 : 4,
        }}
      >
        {children}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 4, padding: '2px 0' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: COLORS.muted,
            display: 'inline-block',
            animation: `qkAiDot 1.2s ${i * 0.18}s ease-in-out infinite`,
          }}
        />
      ))}
    </span>
  )
}

function SparkleIcon({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2.5l1.9 4.9 4.9 1.9-4.9 1.9L12 16.1l-1.9-4.9L5.2 9.3l4.9-1.9L12 2.5z"
        fill={color}
      />
      <path d="M5 15l.9 2.3 2.3.9-2.3.9L5 21.4l-.9-2.3L1.8 18l2.3-.9L5 15z" fill={color} opacity={0.85} />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3.4 20.4L21 12 3.4 3.6l.1 6.6L15 12 3.5 13.8l-.1 6.6z" fill="currentColor" />
    </svg>
  )
}
