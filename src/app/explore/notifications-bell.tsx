'use client'

// Header notifications bell for the local-stack web. Fetches /api/local/notifications
// (cookie auth), shows an unread badge, and a dropdown of recent items with "mark all read".
// Renders nothing when signed out (401).

import { useCallback, useEffect, useState } from 'react'
import { Bell, Check } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { notificationHref } from '@/lib/local/listing-comments-ui-core'
import { useRelativeTime } from '@/lib/use-relative-time'

// `created_at` comes back from getNotifications() as an ISO-8601 UTC string
// (to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS"Z"')).
type Notif = {
  id: string
  type?: string | null
  title: string
  body?: string | null
  link?: string | null
  read: boolean
  created_at?: string | null
}

export function NotificationsBell({ className }: { className?: string }) {
  const t = useTranslations('explorePage')
  const locale = useLocale()
  const relativeTime = useRelativeTime(locale)
  const [items, setItems] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)
  const [signedIn, setSignedIn] = useState(true)
  // Clock reference for the timestamps. Stays 0 through SSR and the first client
  // render (where `items` is empty anyway) and is only ever sampled inside the
  // client-side load(), so server and client HTML can never disagree.
  const [now, setNow] = useState(0)

  const load = useCallback(async () => {
    setNow(Date.now())
    try {
      const r = await fetch('/api/local/notifications', { credentials: 'same-origin', cache: 'no-store' })
      if (r.status === 401) { setSignedIn(false); return }
      if (!r.ok) return
      const d = await r.json()
      setItems(Array.isArray(d.notifications) ? d.notifications : [])
      setUnread(Number(d.unreadCount) || 0)
      setSignedIn(true)
    } catch { /* offline — leave as is */ }
  }, [])

  useEffect(() => { load() }, [load])

  async function markAll() {
    setUnread(0)
    setItems((prev) => prev.map((i) => ({ ...i, read: true })))
    try { await fetch('/api/local/notifications/read-all', { method: 'POST', credentials: 'same-origin' }) } catch { /* ignore */ }
  }

  // Opening a notification marks it read on the server; the navigation itself is a
  // plain link, so this is fire-and-forget (keepalive lets it outlive the page).
  function markOne(n: Notif) {
    if (n.read) return
    setUnread((u) => Math.max(0, u - 1))
    setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, read: true } : i)))
    try {
      void fetch(`/api/local/notifications/${encodeURIComponent(n.id)}`, {
        method: 'PATCH', credentials: 'same-origin', keepalive: true,
      }).catch(() => {})
    } catch { /* ignore */ }
  }

  if (!signedIn) return null

  return (
    <DropdownMenu onOpenChange={(o) => { if (o) load() }}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('nav.notifications')}
          className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[#2A2220] transition-colors hover:bg-black/5 ${className ?? ''}`}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#5B0F16] px-1 text-[11px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[26rem] w-80 overflow-auto rounded-2xl p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">{t('nav.notifications')}</span>
          {items.some((i) => !i.read) && (
            <button onClick={markAll} className="inline-flex items-center gap-1 text-xs font-semibold text-[#5B0F16]">
              <Check className="h-3.5 w-3.5" /> {t('nav.markAllRead')}
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t('nav.noNotifications')}</div>
        ) : (
          <ul className="divide-y">
            {items.map((n) => {
              const when = relativeTime(n.created_at, now)
              // comment / comment_reply open the listing's Questions & comments;
              // `message` (messaging was removed) and anything else open nothing.
              const href = notificationHref(n)
              const content = (
                <div className="flex gap-2">
                  {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#5B0F16]" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0 text-sm font-semibold text-[#2A2220]">{n.title}</p>
                      {when && (
                        <time dateTime={n.created_at ?? undefined} className="shrink-0 text-[11.5px] leading-none text-[#6B6055]">
                          {when}
                        </time>
                      )}
                    </div>
                    {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                  </div>
                </div>
              )
              return (
                <li key={n.id} className={n.read ? '' : 'bg-[#5B0F16]/5'}>
                  {href ? (
                    <a href={href} onClick={() => markOne(n)} className="block px-4 py-3 transition-colors hover:bg-black/5">
                      {content}
                    </a>
                  ) : (
                    <div className="px-4 py-3">{content}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
