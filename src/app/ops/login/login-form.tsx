'use client'

import { useState } from 'react'
import { COLORS, FONT, SERIF, cardStyle, inputStyle, buttonStyle, labelStyle } from '../ops-theme'

// The sign-in form. Errors from /api/local/staff/login are shown verbatim: the route
// already decides what is safe to reveal (a generic "Invalid email or password" for
// bad credentials, but an explicit message for a lockout or a deactivated account).
export function StaffLoginForm({ notice }: { notice: string | null }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/local/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'same-origin',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          data?.attempts_left > 0
            ? `${data.error} (${data.attempts_left} attempt${data.attempts_left === 1 ? '' : 's'} left)`
            : (data?.error ?? 'Sign-in failed')
        )
        setBusy(false)
        return
      }
      // Full reload rather than router.push: the console layout must re-run on the
      // server to pick up the new cookie.
      window.location.href = '/ops'
    } catch {
      setError('Network error. Please try again.')
      setBusy(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.cream,
        color: COLORS.ink,
        fontFamily: FONT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="QuickIn"
            height={44}
            style={{ height: 44, width: 'auto', display: 'inline-block' }}
          />
        </div>

        <div style={{ ...cardStyle, padding: '30px 26px' }}>
          <h1
            style={{
              margin: '0 0 6px',
              fontFamily: SERIF,
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: COLORS.burgundy,
            }}
          >
            Admin sign in
          </h1>
          <p style={{ margin: '0 0 22px', fontSize: 14, color: COLORS.muted }}>
            QuickIn operations console.
          </p>

          {notice && (
            <div
              style={{
                marginBottom: 16,
                padding: '11px 13px',
                borderRadius: 12,
                background: 'rgba(91,15,22,0.06)',
                color: COLORS.burgundy,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {notice}
            </div>
          )}

          <form onSubmit={submit}>
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="staff-email" style={labelStyle}>
                Email
              </label>
              <input
                id="staff-email"
                type="email"
                required
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label htmlFor="staff-password" style={labelStyle}>
                Password
              </label>
              <input
                id="staff-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
            </div>

            {error && (
              <div
                style={{
                  marginBottom: 16,
                  padding: '11px 13px',
                  borderRadius: 12,
                  background: 'rgba(179,38,30,0.08)',
                  color: COLORS.red,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{ ...buttonStyle, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <a
              href="/ops/forgot"
              style={{ fontSize: 13, color: COLORS.muted, textDecoration: 'underline' }}
            >
              Forgot your password?
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}
