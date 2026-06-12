'use client'

// Client-side auth state for the explore header. Reads the user persisted in
// localStorage (qk_user) after login/signup. Shows a greeting + Logout when
// signed in, otherwise Log in / Sign up links. No cookies — the token lives in
// localStorage so the UI can talk to a backend on another domain.
import { useEffect, useState } from 'react'

const COLORS = {
  burgundy: '#5B0F16',
  ink: '#2A2220',
  muted: '#6B6055',
}

interface StoredUser {
  full_name?: string | null
  name?: string | null
  email?: string | null
  role?: string | null
}

function firstNameOf(user: StoredUser | null): string | null {
  if (!user) return null
  const raw =
    (user.full_name && user.full_name.trim()) ||
    (user.name && user.name.trim()) ||
    (user.email ? user.email.split('@')[0] : '')
  if (!raw) return null
  return raw.split(' ')[0]
}

export default function AuthArea() {
  // Start null so server + first client render match; fill in after mount.
  const [user, setUser] = useState<StoredUser | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('qk_user')
      if (raw) setUser(JSON.parse(raw) as StoredUser)
    } catch {
      // ignore malformed storage
    }
    setReady(true)
  }, [])

  function logout() {
    try {
      localStorage.removeItem('qk_token')
      localStorage.removeItem('qk_user')
    } catch {
      // ignore
    }
    window.location.reload()
  }

  const firstName = firstNameOf(user)
  const role = (user?.role || '').toLowerCase()
  const isHost = role === 'host' || role === 'admin'

  // Role-aware nav link: signed-in hosts/admins get a "Host" link to the
  // dashboard; everyone else gets "Become a host" → signup. Only shown once
  // mounted, so the initial server/client markup stays stable.
  const hostLink = ready ? (
    <a
      href={isHost ? '/host' : '/signup'}
      style={{
        color: COLORS.ink,
        textDecoration: 'none',
        fontWeight: 600,
      }}
    >
      {isHost ? 'Host' : 'Become a host'}
    </a>
  ) : null

  // Until mounted, render the logged-out links so the markup is stable.
  if (ready && firstName) {
    return (
      <>
        {hostLink}
        <span style={{ color: COLORS.ink, fontWeight: 600 }}>
          Hi, {firstName}
        </span>
        <button
          type="button"
          onClick={logout}
          style={{
            appearance: 'none',
            border: 'none',
            background: 'transparent',
            color: COLORS.muted,
            fontWeight: 600,
            fontSize: 14,
            fontFamily: 'inherit',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          Logout
        </button>
      </>
    )
  }

  return (
    <>
      {hostLink}
      <a
        href="/login"
        style={{
          color: COLORS.ink,
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        Log in
      </a>
      <a
        href="/signup"
        style={{
          color: '#fff',
          background: COLORS.burgundy,
          textDecoration: 'none',
          fontWeight: 600,
          padding: '9px 18px',
          borderRadius: 999,
        }}
      >
        Sign up
      </a>
    </>
  )
}
