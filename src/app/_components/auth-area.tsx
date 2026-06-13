'use client'

// Client-side PRIMARY NAVIGATION + auth state for the site header.
// Reads the user persisted in localStorage (qk_user) after login/signup and
// renders ROLE-AWARE links:
//   • guest (role 'user' / signed-out): Explore · Services · Trips · Account
//     (+ "Become a host" and Log in / Sign up when anonymous)
//   • host / admin:                     Listings · Reservations · Services · Profile
//     (host links deep-link into the /host dashboard sections; Profile → /account)
//   • admin also gets an extra "Admin" link.
// No cookies — the token lives in localStorage so the UI can talk to a backend
// on another domain. This component owns the whole <nav> link set; pages render
// it as the single child of their header <nav>.
import { useEffect, useState } from 'react'
import NotificationBell from './notification-bell'
import LanguageToggle from './language-toggle'
import { useLanguage } from '@/lib/i18n/language-provider'

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

// Shared link styling. `active` (burgundy + bolder) marks the host's primary
// actions so the host nav reads as a small dashboard menu.
function linkStyle(active = false): React.CSSProperties {
  return {
    color: active ? COLORS.burgundy : COLORS.ink,
    textDecoration: 'none',
    fontWeight: active ? 700 : 600,
    whiteSpace: 'nowrap',
  }
}

export default function AuthArea() {
  const { t } = useLanguage()
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
  const isAdmin = role === 'admin'
  const signedIn = ready && !!firstName

  // ---- Primary links (role-aware) -----------------------------------------
  // Until mounted we render the GUEST link set so the server/client markup
  // stays stable (no hydration mismatch); the role-specific set swaps in after
  // the effect reads localStorage.
  const primaryLinks =
    signedIn && isHost ? (
      // HOST / ADMIN: the /host dashboard combines listings + reservation
      // requests + services in one page, so these deep-link to its sections.
      <>
        <a href="/host#listings" style={linkStyle(true)}>
          {t('nav.listings')}
        </a>
        <a href="/host#reservations" style={linkStyle()}>
          {t('nav.reservations')}
        </a>
        <a href="/host#services" style={linkStyle()}>
          {t('nav.services')}
        </a>
        <a href="/account" style={linkStyle()}>
          {t('nav.profile')}
        </a>
        {isAdmin && (
          <a href="/admin" style={linkStyle()}>
            {t('nav.admin')}
          </a>
        )}
      </>
    ) : (
      // GUEST (signed-in 'user' or anonymous): the public browse/trip nav.
      <>
        <a href="/explore" style={linkStyle()}>
          {t('nav.explore')}
        </a>
        <a href="/services" style={linkStyle()}>
          {t('nav.services')}
        </a>
        {signedIn && (
          <a href="/reservations" style={linkStyle()}>
            {t('nav.trips')}
          </a>
        )}
        {signedIn && (
          <a href="/subscriptions" style={linkStyle()}>
            {t('nav.subscriptions')}
          </a>
        )}
        {signedIn && (
          <a href="/account" style={linkStyle()}>
            {t('nav.account')}
          </a>
        )}
        {/* Guests get the conversion CTA; only shown once mounted so the
            initial markup is stable. */}
        {ready && (
          <a href="/signup" style={{ ...linkStyle(), fontWeight: 600 }}>
            {t('nav.becomeHost')}
          </a>
        )}
      </>
    )

  // ---- Right side: notifications + greeting/logout OR log in / sign up -----
  if (signedIn) {
    return (
      <>
        {primaryLinks}
        <NotificationBell />
        <span style={{ color: COLORS.ink, fontWeight: 600 }}>
          {t('nav.greeting', { name: firstName ?? '' })}
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
          {t('nav.logout')}
        </button>
        <LanguageToggle />
      </>
    )
  }

  return (
    <>
      {primaryLinks}
      <a href="/login" style={linkStyle()}>
        {t('nav.login')}
      </a>
      <a
        href="/signup"
        className="qk-press"
        style={{
          color: '#fff',
          background: 'linear-gradient(135deg,#5B0F16,#8a2530)',
          textDecoration: 'none',
          fontWeight: 600,
          padding: '9px 18px',
          borderRadius: 999,
          boxShadow: '0 8px 20px rgba(91,15,22,0.24)',
        }}
      >
        {t('nav.signup')}
      </a>
      <LanguageToggle />
    </>
  )
}
