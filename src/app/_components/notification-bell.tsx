'use client'

// Notification bell for the header: polls the in-app notification feed, shows an
// unread badge, opens a dropdown of recent notifications, and (with permission)
// raises a native browser notification when new ones arrive. Renders nothing when
// signed out. The token lives in localStorage (qk_token).
import { useCallback, useEffect, useRef, useState } from 'react'
import { API_URL } from '@/lib/api'

const COLORS = { burgundy: '#5B0F16', cream: '#F6F1E6', tan: '#EFE6D8', ink: '#2A2220', muted: '#6B6055' }

interface Notif {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function NotificationBell() {
  const [token, setToken] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)
  const prevUnread = useRef<number | null>(null)

  useEffect(() => {
    try { setToken(localStorage.getItem('qk_token')) } catch {}
  }, [])

  const fetchNotifs = useCallback(async (t: string) => {
    try {
      const res = await fetch(`${API_URL}/api/local/notifications`, { headers: { Authorization: `Bearer ${t}` } })
      if (!res.ok) return
      const d = await res.json()
      const list: Notif[] = d.notifications || []
      const count: number = d.unreadCount || 0
      setItems(list)
      setUnread(count)
      // Raise a native browser notification for newly-arrived unread items.
      if (
        typeof Notification !== 'undefined' && Notification.permission === 'granted' &&
        prevUnread.current !== null && count > prevUnread.current
      ) {
        const newest = list.find((n) => !n.read)
        if (newest) {
          try { new Notification('QuickIn', { body: newest.title }) } catch {}
        }
      }
      prevUnread.current = count
    } catch {}
  }, [])

  useEffect(() => {
    if (!token) return
    fetchNotifs(token)
    const iv = setInterval(() => fetchNotifs(token), 30000)
    return () => clearInterval(iv)
  }, [token, fetchNotifs])

  if (!token) return null

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { await Notification.requestPermission() } catch {}
    }
  }

  async function openNotif(n: Notif) {
    if (token) { try { await fetch(`${API_URL}/api/local/notifications/${n.id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }) } catch {} }
    if (n.link) { window.location.href = n.link; return }
    setOpen(false)
    if (token) fetchNotifs(token)
  }

  async function markAll() {
    if (!token) return
    try { await fetch(`${API_URL}/api/local/notifications/read-all`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }) } catch {}
    fetchNotifs(token)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button onClick={toggle} aria-label="Notifications" style={{ position: 'relative', border: 'none', background: 'transparent', cursor: 'pointer', color: COLORS.ink, padding: 4, display: 'flex' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: COLORS.burgundy, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
          <div style={{ position: 'absolute', top: 34, right: 0, width: 340, maxWidth: '90vw', maxHeight: 440, overflowY: 'auto', background: '#fff', border: `1px solid ${COLORS.tan}`, borderRadius: 16, boxShadow: '0 16px 40px rgba(42,34,32,0.20)', zIndex: 100, fontFamily: 'inherit' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${COLORS.tan}`, position: 'sticky', top: 0, background: '#fff' }}>
              <strong style={{ color: COLORS.burgundy, fontSize: 15 }}>Notifications</strong>
              {unread > 0 && <button onClick={markAll} style={{ border: 'none', background: 'transparent', color: COLORS.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Mark all read</button>}
            </div>
            {items.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', color: COLORS.muted, fontSize: 14 }}>No notifications yet.</div>
            ) : (
              items.map((n) => (
                <button key={n.id} onClick={() => openNotif(n)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderBottom: `1px solid ${COLORS.cream}`, background: n.read ? '#fff' : 'rgba(91,15,22,0.04)', cursor: 'pointer', padding: '12px 16px', fontFamily: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {!n.read && <span style={{ width: 8, height: 8, borderRadius: 4, background: COLORS.burgundy, flexShrink: 0 }} />}
                    <span style={{ fontWeight: 700, color: COLORS.ink, fontSize: 14 }}>{n.title}</span>
                  </div>
                  {n.body && <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 2 }}>{n.body}</div>}
                  <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 4 }}>{timeAgo(n.created_at)}</div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
