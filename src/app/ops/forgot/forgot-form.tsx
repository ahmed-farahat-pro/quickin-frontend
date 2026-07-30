'use client'

import { useState } from 'react'
import { COLORS, FONT, SERIF, cardStyle, inputStyle, buttonStyle, labelStyle } from '../ops-theme'

// Two-step reset: request a 6-digit code by email, then present the code with a new
// password. Step 1 always reports success (the API refuses to reveal whether an
// address exists), so the UI advances to step 2 either way.
export function StaffForgotForm() {
  const [step, setStep] = useState<'request' | 'confirm'>('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const request = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/local/staff/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? 'Could not start the reset')
        setBusy(false)
        return
      }
      // Present only when the mail relay isn't configured (local dev).
      setDevCode(typeof data?.devCode === 'string' ? data.devCode : null)
      setStep('confirm')
    } catch {
      setError('Network error. Please try again.')
    }
    setBusy(false)
  }

  const confirmReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('The two passwords do not match')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/local/staff/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? 'Could not reset the password')
        setBusy(false)
        return
      }
      window.location.href = '/ops/login?reason=reset'
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
          <img src="/logo.png" alt="QuickIn" height={44} style={{ height: 44, width: 'auto', display: 'inline-block' }} />
        </div>

        <div style={{ ...cardStyle, padding: '30px 26px' }}>
          <h1
            style={{
              margin: '0 0 6px',
              fontFamily: SERIF,
              fontSize: 25,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: COLORS.burgundy,
            }}
          >
            Reset your password
          </h1>
          <p style={{ margin: '0 0 22px', fontSize: 14, color: COLORS.muted }}>
            {step === 'request'
              ? 'We will email you a 6-digit code.'
              : `Enter the code sent to ${email} and choose a new password.`}
          </p>

          {devCode && (
            <div
              style={{
                marginBottom: 16,
                padding: '11px 13px',
                borderRadius: 12,
                background: 'rgba(46,125,91,0.10)',
                color: COLORS.green,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Dev mode — no mail relay configured. Your code is {devCode}
            </div>
          )}

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

          {step === 'request' ? (
            <form onSubmit={request}>
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="forgot-email" style={labelStyle}>
                  Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                style={{ ...buttonStyle, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}
              >
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </form>
          ) : (
            <form onSubmit={confirmReset}>
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="forgot-code" style={labelStyle}>
                  6-digit code
                </label>
                <input
                  id="forgot-code"
                  inputMode="numeric"
                  required
                  autoFocus
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  style={{ ...inputStyle, letterSpacing: 6, fontWeight: 700 }}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="forgot-password" style={labelStyle}>
                  New password
                </label>
                <input
                  id="forgot-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                />
                <p style={{ margin: '6px 0 0', fontSize: 12, color: COLORS.muted }}>
                  At least 10 characters, with a letter and a digit.
                </p>
              </div>
              <div style={{ marginBottom: 18 }}>
                <label htmlFor="forgot-confirm" style={labelStyle}>
                  Confirm new password
                </label>
                <input
                  id="forgot-confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                style={{ ...buttonStyle, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}
              >
                {busy ? 'Saving…' : 'Set new password'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('request'); setError(null); setDevCode(null) }}
                style={{
                  width: '100%',
                  marginTop: 10,
                  padding: '11px 18px',
                  borderRadius: 14,
                  border: '1px solid rgba(42,34,32,0.16)',
                  background: 'transparent',
                  color: COLORS.muted,
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: FONT,
                  cursor: 'pointer',
                }}
              >
                Use a different email
              </button>
            </form>
          )}

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <a href="/ops/login" style={{ fontSize: 13, color: COLORS.muted, textDecoration: 'underline' }}>
              Back to sign in
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}
