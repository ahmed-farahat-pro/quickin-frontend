'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import { API_URL } from '@/lib/api'
import { signInWithApple, APPLE_SERVICES_ID, APPLE_JS_SRC } from '@/lib/apple'
import { EyeIcon, EyeOffIcon, eyeButtonStyle } from '@/app/_components/password-eye'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

// Persist the {token, user} the backend returns. Admins go to the admin area;
// everyone else to Explore.
function persistAuthAndGo(data: { token?: string; user?: { role?: string } | unknown }) {
  try {
    if (data?.token) localStorage.setItem('qk_token', data.token)
    if (data?.user) localStorage.setItem('qk_user', JSON.stringify(data.user))
  } catch {
    // ignore storage failures
  }
  const role = (data?.user as { role?: string } | undefined)?.role
  window.location.href = role === 'admin' ? '/admin' : '/explore'
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

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState<'user' | 'host'>('user')
  const [step, setStep] = useState<'form' | 'otp' | 'forgot' | 'reset'>('form')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [gisReady, setGisReady] = useState(false)
  const googleBtnRef = useRef<HTMLDivElement | null>(null)

  const googleEnabled = Boolean(GOOGLE_CLIENT_ID)
  const appleEnabled = Boolean(APPLE_SERVICES_ID)

  async function onGoogleCredential(credential: string) {
    setError(null); setNotice(null); setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/google`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
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
        type: 'standard', theme: 'outline', size: 'large', text: 'continue_with',
        shape: 'pill', logo_alignment: 'center', width: 348,
      })
    }
    setGisReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleEnabled])

  useEffect(() => {
    if (googleEnabled && window.google?.accounts?.id) initGis()
  }, [googleEnabled, initGis])

  // Sign in. An unverified email returns 403 needsVerification → route to OTP.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setNotice(null); setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 403 && data?.needsVerification) {
        // Send a fresh code and switch to the OTP step.
        await fetch(`${API_URL}/api/auth/resend-otp`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        }).catch(() => {})
        setStep('otp')
        setNotice(`Your email isn't verified yet. We sent a 6-digit code to ${email}.`)
        setLoading(false)
        return
      }
      if (!res.ok) { setError(data?.error || 'Unable to sign in. Please try again.'); setLoading(false); return }
      persistAuthAndGo(data)
    } catch { setError('Network error. Please try again.'); setLoading(false) }
  }

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

  // Forgot password: email a 6-digit reset code, then move to the 'reset' step.
  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setNotice(null); setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || 'Could not send a reset code. Please try again.'); setLoading(false); return }
      setStep('reset')
      setCode(''); setNewPassword('')
      setNotice(`We emailed a 6-digit code to ${email}.`)
      setLoading(false)
    } catch { setError('Network error. Please try again.'); setLoading(false) }
  }

  // Reset password with the emailed code + a new password. On success the
  // backend returns {token, user} and we log the user straight in.
  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setNotice(null); setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password: newPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || 'Could not reset your password. Please try again.'); setLoading(false); return }
      persistAuthAndGo(data)
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
      const { id_token, full_name } = await signInWithApple()
      const res = await fetch(`${API_URL}/api/auth/apple`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityToken: id_token, full_name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || 'Apple sign-in failed. Please try again.'); setLoading(false); return }
      persistAuthAndGo(data)
    } catch (e) {
      const msg = (e as Error)?.message || ''
      if (/popup|cancel|closed/i.test(msg)) { setLoading(false); return } // user closed the popup
      setError(msg || 'Apple sign-in failed. Please try again.'); setLoading(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: COLORS.cream, color: COLORS.ink, fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={initGis} />
      {appleEnabled && <Script src={APPLE_JS_SRC} strategy="afterInteractive" />}
      <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 28, boxShadow: '0 12px 48px rgba(42,34,32,0.12)', border: '1px solid rgba(42,34,32,0.06)', padding: '40px 36px 36px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo.png" alt="QuickIn" style={{ height: 54, width: 'auto', margin: '0 auto', display: 'block' }} />
          <p style={{ margin: '14px 0 0', fontSize: 15, color: COLORS.muted }}>
            {step === 'otp'
              ? 'Verify your email to continue'
              : step === 'forgot'
                ? 'Reset your password'
                : step === 'reset'
                  ? 'Enter the code and a new password'
                  : 'Welcome back — sign in to continue'}
          </p>
        </div>

        {error && (
          <div style={{ background: 'rgba(91,15,22,0.06)', border: '1px solid rgba(91,15,22,0.18)', color: COLORS.burgundy, fontSize: 14, borderRadius: 14, padding: '10px 14px', marginBottom: 18 }}>{error}</div>
        )}
        {notice && (
          <div style={{ background: 'rgba(42,34,32,0.05)', border: '1px solid rgba(42,34,32,0.14)', color: COLORS.ink, fontSize: 13.5, borderRadius: 14, padding: '10px 14px', marginBottom: 18 }}>{notice}</div>
        )}

        {step === 'otp' ? (
          /* ---- OTP verification step (unverified login) ---- */
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
              <button type="button" onClick={() => { setStep('form'); setError(null); setNotice(null) }} style={linkBtnStyle}>← Back to sign in</button>
              <button type="button" onClick={handleResend} disabled={loading} style={linkBtnStyle}>Resend code</button>
            </div>
          </form>
        ) : step === 'forgot' ? (
          /* ---- Forgot password: request a reset code ---- */
          <form onSubmit={handleForgot}>
            <label style={{ display: 'block', marginBottom: 22 }}>
              <span style={labelStyle}>Email</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="layla@email.com" style={inputStyle} />
            </label>
            <button type="submit" disabled={loading || !email.trim()} style={primaryButtonStyle(loading || !email.trim())}>
              {loading ? 'Sending…' : 'Send reset code'}
            </button>
            <div style={{ marginTop: 16, fontSize: 13.5 }}>
              <button type="button" onClick={() => { setStep('form'); setError(null); setNotice(null) }} style={linkBtnStyle}>← Back to sign in</button>
            </div>
          </form>
        ) : step === 'reset' ? (
          /* ---- Reset password: enter the emailed code + a new password ---- */
          <form onSubmit={handleReset}>
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
            <label style={{ display: 'block', marginBottom: 22 }}>
              <span style={labelStyle}>New password</span>
              <div style={{ position: 'relative' }}>
                <input type={showNewPassword ? 'text' : 'password'} required minLength={6} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" style={{ ...inputStyle, paddingRight: 44 }} />
                <button type="button" onClick={() => setShowNewPassword((v) => !v)} aria-label={showNewPassword ? 'Hide password' : 'Show password'} style={eyeButtonStyle}>
                  {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </label>
            <button type="submit" disabled={loading || code.length < 6 || newPassword.length < 6} style={primaryButtonStyle(loading || code.length < 6 || newPassword.length < 6)}>
              {loading ? 'Resetting…' : 'Reset password'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 13.5 }}>
              <button type="button" onClick={() => { setStep('form'); setError(null); setNotice(null) }} style={linkBtnStyle}>← Back to sign in</button>
              <button type="button" onClick={() => { setStep('forgot'); setError(null); setNotice(null) }} disabled={loading} style={linkBtnStyle}>Resend code</button>
            </div>
          </form>
        ) : (
          /* ---- Sign-in form step ---- */
          <>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 18 }}>
                <span style={labelStyle}>Sign in as</span>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button type="button" onClick={() => setRole('user')} style={{ flex: 1, padding: '11px', borderRadius: 12, fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer', border: role === 'user' ? '1px solid #5B0F16' : '1px solid rgba(42,34,32,0.14)', background: role === 'user' ? '#5B0F16' : '#fff', color: role === 'user' ? '#fff' : '#2A2220' }}>Guest</button>
                  <button type="button" onClick={() => setRole('host')} style={{ flex: 1, padding: '11px', borderRadius: 12, fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer', border: role === 'host' ? '1px solid #5B0F16' : '1px solid rgba(42,34,32,0.14)', background: role === 'host' ? '#5B0F16' : '#fff', color: role === 'host' ? '#fff' : '#2A2220' }}>Host</button>
                </div>
              </div>
              <label style={{ display: 'block', marginBottom: 16 }}>
                <span style={labelStyle}>Email or username</span>
                <input type="text" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="layla@email.com" style={inputStyle} />
              </label>
              <label style={{ display: 'block', marginBottom: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={labelStyle}>Password</span>
                  <button type="button" onClick={() => { setStep('forgot'); setError(null); setNotice(null) }} style={{ ...linkBtnStyle, marginBottom: 6 }}>Forgot password?</button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input type={showPassword ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={{ ...inputStyle, paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} style={eyeButtonStyle}>
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </label>
              <button type="submit" disabled={loading} style={primaryButtonStyle(loading)}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
              <span style={{ flex: 1, height: 1, background: 'rgba(42,34,32,0.12)' }} />
              <span style={{ fontSize: 12, color: COLORS.muted }}>or</span>
              <span style={{ flex: 1, height: 1, background: 'rgba(42,34,32,0.12)' }} />
            </div>

            {appleEnabled && (
              <button type="button" onClick={handleAppleClick} style={appleButtonStyle(loading)}>
                <AppleGlyph /> Continue with Apple
              </button>
            )}

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
              New here?{' '}
              <a href="/signup" style={{ color: COLORS.burgundy, fontWeight: 600, textDecoration: 'none' }}>Create an account</a>
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
