'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import { API_URL } from '@/lib/api'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

// Persist the {token, user} the backend returns, then go to Explore.
function persistAuthAndGo(data: { token?: string; user?: unknown }) {
  try {
    if (data?.token) localStorage.setItem('qk_token', data.token)
    if (data?.user) localStorage.setItem('qk_user', JSON.stringify(data.user))
  } catch {
    // ignore storage failures
  }
  window.location.href = '/explore'
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  )
}

function AppleGlyph() {
  return (
    <svg width="17" height="20" viewBox="0 0 17 20" fill="#fff" aria-hidden="true">
      <path d="M14.06 10.62c-.02-2.16 1.76-3.2 1.84-3.25-1-1.47-2.57-1.67-3.12-1.69-1.33-.13-2.59.78-3.26.78-.67 0-1.71-.76-2.81-.74-1.45.02-2.78.84-3.53 2.14-1.5 2.6-.38 6.45 1.08 8.56.71 1.03 1.56 2.19 2.67 2.15 1.07-.04 1.48-.69 2.78-.69 1.3 0 1.66.69 2.79.67 1.15-.02 1.88-1.05 2.59-2.09.81-1.2 1.15-2.36 1.16-2.42-.03-.01-2.23-.86-2.26-3.4zM11.9 4.3c.59-.72.99-1.71.88-2.71-.85.03-1.89.57-2.5 1.28-.55.63-1.03 1.65-.9 2.62.95.07 1.92-.48 2.52-1.19z" />
    </svg>
  )
}

type Role = 'user' | 'host'

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('user')
  const [step, setStep] = useState<'form' | 'otp'>('form')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [gisReady, setGisReady] = useState(false)
  const googleBtnRef = useRef<HTMLDivElement | null>(null)

  const googleEnabled = Boolean(GOOGLE_CLIENT_ID)

  async function onGoogleCredential(credential: string) {
    setError(null); setNotice(null); setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/google`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, role }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || 'Google sign-in failed. Please try again.'); setLoading(false); return }
      persistAuthAndGo(data)
    } catch { setError('Network error. Please try again.'); setLoading(false) }
  }

  const initGis = useCallback(() => {
    if (!googleEnabled) return
    if (!window.google?.accounts?.id) return
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (resp) => { if (resp?.credential) onGoogleCredential(resp.credential) },
    })
    if (googleBtnRef.current) {
      googleBtnRef.current.innerHTML = ''
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: 'standard', theme: 'outline', size: 'large', text: 'signup_with',
        shape: 'pill', logo_alignment: 'center', width: 348,
      })
    }
    setGisReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleEnabled])

  useEffect(() => {
    if (googleEnabled && window.google?.accounts?.id) initGis()
  }, [googleEnabled, initGis])

  // Step 1 — create the account; backend emails a 6-digit OTP and returns { pending }.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setNotice(null); setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/signup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName, role }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || 'Unable to create account. Please try again.'); setLoading(false); return }
      // OTP sent — move to the verification step.
      setStep('otp')
      setNotice(
        data?.devCode
          ? `Dev mode (no SMTP): your code is ${data.devCode}`
          : `We sent a 6-digit code to ${email}. Enter it below to finish.`
      )
      setLoading(false)
    } catch { setError('Network error. Please try again.'); setLoading(false) }
  }

  // Step 2 — verify the OTP; backend returns { token, user } and logs us in.
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || 'Invalid or expired code.'); setLoading(false); return }
      persistAuthAndGo(data)
    } catch { setError('Network error. Please try again.'); setLoading(false) }
  }

  async function handleResend() {
    setError(null); setNotice(null); setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/resend-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || 'Could not resend the code.'); setLoading(false); return }
      setNotice(data?.devCode ? `Dev mode: your new code is ${data.devCode}` : `A new code was sent to ${email}.`)
      setLoading(false)
    } catch { setError('Network error. Please try again.'); setLoading(false) }
  }

  function handleGoogleClick() {
    if (!googleEnabled) return
    setError(null); setNotice(null)
    window.google?.accounts?.id?.prompt()
  }

  async function handleAppleClick() {
    setError(null); setNotice(null); setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/apple`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || 'Apple sign-in is not available right now.'); setLoading(false); return }
      persistAuthAndGo(data)
    } catch { setError('Network error. Please try again.'); setLoading(false) }
  }

  return (
    <main style={{ minHeight: '100vh', background: COLORS.cream, color: COLORS.ink, fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={initGis} />
      <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 28, boxShadow: '0 12px 48px rgba(42,34,32,0.12)', border: '1px solid rgba(42,34,32,0.06)', padding: '40px 36px 36px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo.png" alt="QuickIn" style={{ height: 54, width: 'auto', margin: '0 auto', display: 'block' }} />
          <p style={{ margin: '14px 0 0', fontSize: 15, color: COLORS.muted }}>
            {step === 'otp' ? 'Verify your email to finish' : 'Create your account to start exploring'}
          </p>
        </div>

        {error && (
          <div style={{ background: 'rgba(91,15,22,0.06)', border: '1px solid rgba(91,15,22,0.18)', color: COLORS.burgundy, fontSize: 14, borderRadius: 14, padding: '10px 14px', marginBottom: 18 }}>{error}</div>
        )}
        {notice && (
          <div style={{ background: 'rgba(42,34,32,0.05)', border: '1px solid rgba(42,34,32,0.14)', color: COLORS.ink, fontSize: 13.5, borderRadius: 14, padding: '10px 14px', marginBottom: 18 }}>{notice}</div>
        )}

        {step === 'otp' ? (
          /* ---- OTP verification step ---- */
          <form onSubmit={handleVerify}>
            <label style={{ display: 'block', marginBottom: 18 }}>
              <span style={labelStyle}>Verification code</span>
              <input
                type="text" inputMode="numeric" autoComplete="one-time-code" required
                maxLength={6} value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                style={{ ...inputStyle, textAlign: 'center', letterSpacing: 12, fontSize: 22, fontWeight: 700 }}
              />
            </label>
            <button type="submit" disabled={loading || code.length < 6} style={primaryButtonStyle(loading || code.length < 6)}>
              {loading ? 'Verifying…' : 'Verify & continue'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 13.5 }}>
              <button type="button" onClick={() => { setStep('form'); setError(null); setNotice(null) }} style={linkBtnStyle}>← Change details</button>
              <button type="button" onClick={handleResend} disabled={loading} style={linkBtnStyle}>Resend code</button>
            </div>
          </form>
        ) : (
          /* ---- Sign-up form step ---- */
          <>
            {/* Role choice */}
            <div style={{ marginBottom: 18 }}>
              <span style={labelStyle}>I want to join as</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setRole('user')} style={roleBtnStyle(role === 'user')}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>🧳 Guest</span>
                  <span style={{ fontSize: 12, color: COLORS.muted }}>Book stays</span>
                </button>
                <button type="button" onClick={() => setRole('host')} style={roleBtnStyle(role === 'host')}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>🏠 Host</span>
                  <span style={{ fontSize: 12, color: COLORS.muted }}>List your place</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <label style={{ display: 'block', marginBottom: 16 }}>
                <span style={labelStyle}>Full name</span>
                <input type="text" required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Layla Hassan" style={inputStyle} />
              </label>
              <label style={{ display: 'block', marginBottom: 16 }}>
                <span style={labelStyle}>Email</span>
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="layla@email.com" style={inputStyle} />
              </label>
              <label style={{ display: 'block', marginBottom: 22 }}>
                <span style={labelStyle}>Password</span>
                <input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" style={inputStyle} />
              </label>
              <button type="submit" disabled={loading} style={primaryButtonStyle(loading)}>
                {loading ? 'Sending code…' : `Create ${role === 'host' ? 'host' : 'guest'} account`}
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
              <span style={{ flex: 1, height: 1, background: 'rgba(42,34,32,0.12)' }} />
              <span style={{ fontSize: 12, color: COLORS.muted }}>or</span>
              <span style={{ flex: 1, height: 1, background: 'rgba(42,34,32,0.12)' }} />
            </div>

            <button type="button" onClick={handleAppleClick} style={appleButtonStyle(loading)}>
              <AppleGlyph /> Continue with Apple
            </button>

            {googleEnabled ? (
              <>
                <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
                {!gisReady && (
                  <button type="button" onClick={handleGoogleClick} disabled={loading} style={googleButtonStyle(loading)}>
                    <GoogleG /> Continue with Google
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" disabled aria-disabled="true" title="Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable Google sign-in" style={googleButtonStyle(true)}>
                  <GoogleG /> Continue with Google
                </button>
                <p style={{ margin: '8px 0 0', fontSize: 12, color: COLORS.muted, textAlign: 'center' }}>Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable Google sign-in</p>
              </>
            )}

            <p style={{ margin: '26px 0 0', textAlign: 'center', fontSize: 14, color: COLORS.muted }}>
              Already have an account?{' '}
              <a href="/login" style={{ color: COLORS.burgundy, fontWeight: 600, textDecoration: 'none' }}>Sign in</a>
            </p>
          </>
        )}
      </div>
    </main>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: COLORS.ink, marginBottom: 6 }

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontFamily: FONT, fontSize: 15, color: COLORS.ink,
  background: COLORS.cream, border: '1px solid rgba(42,34,32,0.14)', borderRadius: 18, padding: '12px 16px', outline: 'none',
}

const linkBtnStyle: React.CSSProperties = {
  appearance: 'none', border: 'none', background: 'transparent', color: COLORS.burgundy,
  fontWeight: 600, fontSize: 13.5, fontFamily: FONT, cursor: 'pointer', padding: 0,
}

function roleBtnStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
    fontFamily: FONT, textAlign: 'left',
    background: active ? COLORS.tan : '#fff',
    border: `1.5px solid ${active ? COLORS.burgundy : 'rgba(42,34,32,0.16)'}`,
    borderRadius: 16, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.12s ease',
  }
}

function primaryButtonStyle(loading: boolean): React.CSSProperties {
  return {
    width: '100%', fontFamily: FONT, fontSize: 16, fontWeight: 600, color: '#fff', background: COLORS.burgundy,
    border: 'none', borderRadius: 20, padding: '13px 16px', cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s ease',
  }
}

function appleButtonStyle(loading: boolean): React.CSSProperties {
  return {
    width: '100%', fontFamily: FONT, fontSize: 15, fontWeight: 600, color: '#fff', background: '#000',
    border: 'none', borderRadius: 20, padding: '12px 16px', cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12,
  }
}

function googleButtonStyle(loading: boolean): React.CSSProperties {
  return {
    width: '100%', fontFamily: FONT, fontSize: 15, fontWeight: 600, color: '#3c4043', background: '#fff',
    border: '1px solid rgba(42,34,32,0.20)', borderRadius: 20, padding: '12px 16px', cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  }
}
