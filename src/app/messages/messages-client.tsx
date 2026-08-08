'use client'

// The interactive half of the inbox: thread selection and the 8-second poll that
// keeps the list current.
//
// It used to be the whole page. Everything below the first paint still belongs
// here — but the FIRST list now arrives with the HTML from page.tsx, because this
// component fetching it on mount meant the inbox rendered its heading and its two
// empty panels and only then went looking for threads. No route-level loading.tsx
// can cover that gap: by the time it ran, the navigation was already over.
//
// The poll stays. It is what makes the inbox live, and it is also the thing that
// notices a session ending mid-visit.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import LocalChatPanel from '@/components/local-chat-panel'
import { ShimmerStyles, SkeletonBlock } from '@/components/ui/skeleton-block'

const C = { burgundy: '#5B0F16', cream: '#F6F1E6', tan: '#EFE6D8', ink: '#2A2220', muted: '#6B6055' }

export interface Convo {
  id: string
  listing_title: string | null
  listing_image: string | null
  other_name: string | null
  last_message: string | null
  last_message_at: string
  is_host: boolean
}

/**
 * Still here, and still needed — just for a narrower case than before.
 *
 * With the list server-rendered these only appear when the server render itself
 * failed and the poll is doing the first load instead. That is rare, which is
 * exactly why it should still look like a screen loading rather than an empty one.
 */
function ThreadListSkeleton() {
  const widths = ['62%', '48%', '70%', '54%']
  return (
    <div>
      <ShimmerStyles />
      {widths.map((w, i) => (
        <div key={i} style={{ padding: '13px 15px', borderBottom: '1px solid rgba(42,34,32,0.06)' }}>
          <SkeletonBlock width={w} height={14} />
          <SkeletonBlock width="80%" height={11} style={{ marginTop: 7 }} />
          <SkeletonBlock width="90%" height={11} style={{ marginTop: 6 }} />
        </div>
      ))}
    </div>
  )
}

function ThreadSkeleton() {
  // Alternating sides, so it reads as a conversation rather than a list.
  const bubbles: Array<{ w: string; mine: boolean }> = [
    { w: '58%', mine: false },
    { w: '44%', mine: true },
    { w: '68%', mine: false },
    { w: '36%', mine: true },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ShimmerStyles />
      {bubbles.map((b, i) => (
        <SkeletonBlock
          key={i}
          width={b.w}
          height={38}
          radius={14}
          style={{ alignSelf: b.mine ? 'flex-end' : 'flex-start' }}
        />
      ))}
    </div>
  )
}

export function MessagesClient({
  initialConversations,
  signedIn,
}: {
  /** null means the server render failed — the poll does the first load instead. */
  initialConversations: Convo[] | null
  signedIn: boolean
}) {
  const t = useTranslations('chat')
  const [convos, setConvos] = useState<Convo[]>(initialConversations ?? [])
  // Opening the newest thread is what the old mount fetch did; with the list already
  // here, it can happen in the initial state rather than a render later.
  const [active, setActive] = useState<string | null>(initialConversations?.[0]?.id ?? null)
  const [state, setState] = useState<'loading' | 'ready' | 'needsLogin' | 'error'>(
    !signedIn ? 'needsLogin' : initialConversations ? 'ready' : 'loading'
  )

  useEffect(() => {
    // The server already said so, and no amount of polling will change it.
    if (!signedIn) return

    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/local/chat', { credentials: 'same-origin' })
        if (res.status === 401) { if (!cancelled) setState('needsLogin'); return }
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'error')
        if (!cancelled) {
          setConvos(data.conversations ?? [])
          setState('ready')
          setActive((prev) => prev ?? (data.conversations?.[0]?.id ?? null))
        }
      } catch {
        // Only a first load can fail into an error screen. Once threads are on
        // screen, a dropped poll leaves them there rather than replacing a working
        // inbox with a failure message.
        if (!cancelled) setState((prev) => (prev === 'ready' ? prev : 'error'))
      }
    }
    // The first tick is skipped when the server already delivered the list — it
    // would be an identical query milliseconds after the one that rendered the page.
    if (initialConversations === null) load()
    const id = setInterval(load, 8000)
    return () => { cancelled = true; clearInterval(id) }
  }, [signedIn, initialConversations])

  return (
    <main style={{ minHeight: '100vh', background: C.cream, color: C.ink, fontFamily: '"DM Sans", ui-sans-serif, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 20px 60px' }}>
        {/* Both links were <a> before this file existed, which made "back" a full
            page reload. Carried across as <Link> rather than carried across as-is. */}
        <Link href="/explore" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: C.burgundy, textDecoration: 'none', marginBottom: 18 }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>&larr;</span> {t('backToExplore')}
        </Link>
        <h1 style={{ margin: '0 0 20px', fontFamily: '"Playfair Display", Georgia, serif', fontSize: 30, fontWeight: 700, color: C.burgundy }}>
          {t('inboxTitle')}
        </h1>

        {state === 'needsLogin' ? (
          <p style={{ fontSize: 15 }}>
            {t('needsLogin')}{' '}
            <Link href="/login" style={{ color: C.burgundy, fontWeight: 700, textDecoration: 'none' }}>{t('logIn')}</Link>
          </p>
        ) : (
          <style>{`
            @media (max-width: 720px) { .qk-msg-grid { grid-template-columns: 1fr !important; } }
          `}</style>
        )}

        {state !== 'needsLogin' && (
          <div className="qk-msg-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 20, alignItems: 'stretch' }}>
            {/* Thread list */}
            <div style={{ background: '#fff', borderRadius: 18, border: '1px solid rgba(42,34,32,0.06)', overflow: 'hidden' }}>
              {state === 'loading' && <ThreadListSkeleton />}
              {state === 'ready' && convos.length === 0 && <p style={{ padding: 16, fontSize: 14, color: C.muted }}>{t('noThreads')}</p>}
              {convos.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActive(c.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                    padding: '13px 15px', border: 'none', borderBottom: '1px solid rgba(42,34,32,0.06)',
                    background: active === c.id ? C.tan : '#fff', fontFamily: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>{c.other_name || t('host')}</span>
                    {c.is_host && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.burgundy, background: C.cream, borderRadius: 999, padding: '2px 7px' }}>{t('asHost')}</span>}
                  </div>
                  {c.listing_title && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{c.listing_title}</div>}
                  {c.last_message && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_message}</div>}
                </button>
              ))}
            </div>

            {/* Active thread */}
            <div style={{ background: '#fff', borderRadius: 18, border: '1px solid rgba(42,34,32,0.06)', padding: 16, height: '62vh', minHeight: 380 }}>
              {active ? (
                <LocalChatPanel key={active} conversationId={active} />
              ) : state === 'loading' ? (
                // "Pick a thread" is wrong while the list is still arriving — there
                // is nothing to pick yet, and it reads as an empty inbox.
                <ThreadSkeleton />
              ) : (
                <p style={{ fontSize: 14, color: C.muted }}>{t('pickThread')}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
