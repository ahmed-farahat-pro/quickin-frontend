'use client'

// Account settings (UI-only) — the signed-in user edits their profile. Requires
// the bearer token in localStorage (qk_token); redirects to /login otherwise.
// Loads GET /api/local/profile and saves via PATCH /api/local/profile with
// { full_name, age, id_document, phone }. Boutique inline styling, matching the
// rest of the app.
//
// Note: a host's phone is private. It's only ever shown here, to the user
// themselves — never on a listing/detail page.
import { useCallback, useEffect, useState } from 'react'
import { API_URL, getToken } from '@/lib/api'
import AuthArea from '../_components/auth-area'
import { EyeIcon, EyeOffIcon, eyeButtonStyle } from '@/app/_components/password-eye'
import { useLanguage } from '@/lib/i18n/language-provider'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: COLORS.muted,
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  fontSize: 15,
  fontFamily: FONT,
  color: COLORS.ink,
  background: '#fff',
  border: '1px solid rgba(42,34,32,0.14)',
  borderRadius: 14,
  outline: 'none',
}

interface Profile {
  email?: string | null
  full_name?: string | null
  role?: string | null
  age?: number | null
  id_document?: string | null
  phone?: string | null
}

interface FormState {
  full_name: string
  age: string
  id_document: string
  phone: string
}

type Gate = 'checking' | 'anon' | 'ok'

export default function AccountPage() {
  const { t } = useLanguage()
  const [gate, setGate] = useState<Gate>('checking')
  const [email, setEmail] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({
    full_name: '',
    age: '',
    id_document: '',
    phone: '',
  })
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  // Change-password section state (independent of the profile form above).
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwOk, setPwOk] = useState(false)

  const loadProfile = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setGate('anon')
      return
    }
    setLoadError(false)
    try {
      const res = await fetch(`${API_URL}/api/local/profile`, {
        headers: { Authorization: 'Bearer ' + token },
      })
      if (res.status === 401) {
        setGate('anon')
        return
      }
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const p: Profile = await res.json()
      setEmail(p.email ?? null)
      setRole(p.role ?? null)
      setForm({
        full_name: p.full_name ?? '',
        age: p.age != null ? String(p.age) : '',
        id_document: p.id_document ?? '',
        phone: p.phone ?? '',
      })
      setGate('ok')
    } catch {
      setLoadError(true)
      setGate('ok')
    }
  }, [])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  // Redirect unauthenticated users to /login (client-side — the token lives in
  // localStorage, so this can't be a server redirect).
  useEffect(() => {
    if (gate === 'anon' && typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }, [gate])

  function patch(p: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...p }))
    setSaveError(null)
    setSaveOk(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)
    setSaveOk(false)

    const token = getToken()
    if (!token) {
      setGate('anon')
      return
    }

    if (form.age.trim() && !(Number(form.age) > 0)) {
      setSaveError(t('account.invalidAge'))
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/local/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          age: form.age.trim() === '' ? null : Number(form.age),
          id_document: form.id_document.trim(),
          phone: form.phone.trim(),
        }),
      })

      if (res.status === 401) {
        setGate('anon')
        return
      }

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSaveError((data && data.error) || t('account.saveError'))
        return
      }

      // Reflect any normalised values returned by the server.
      const p = data as Profile
      setForm({
        full_name: p.full_name ?? form.full_name,
        age: p.age != null ? String(p.age) : '',
        id_document: p.id_document ?? form.id_document,
        phone: p.phone ?? form.phone,
      })
      setSaveOk(true)
    } catch {
      setSaveError(t('reserve.networkError'))
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwError(null)
    setPwOk(false)

    const token = getToken()
    if (!token) {
      setGate('anon')
      return
    }

    if (newPassword.length < 6) {
      setPwError(t('account.pwTooShort'))
      return
    }

    setPwSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/local/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })

      if (res.status === 401) {
        setGate('anon')
        return
      }

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPwError((data && data.error) || t('account.pwError'))
        return
      }

      setCurrentPassword('')
      setNewPassword('')
      setPwOk(true)
    } catch {
      setPwError(t('reserve.networkError'))
    } finally {
      setPwSaving(false)
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
        flexDirection: 'column',
      }}
    >
      <style>{`
        @media (max-width: 560px) {
          .qk-account-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header bar — same look as Explore */}
      <header
        style={{
          background: `linear-gradient(180deg, ${COLORS.tan} 0%, ${COLORS.cream} 100%)`,
          borderBottom: '1px solid rgba(91,15,22,0.10)',
          padding: '20px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <a href="/explore" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <img
              src="/logo.png"
              alt="QuickIn"
              height={40}
              style={{ height: 40, width: 'auto', display: 'block' }}
            />
          </a>
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              fontSize: 14,
              flexWrap: 'wrap',
            }}
          >
            <AuthArea />
          </nav>
        </div>
      </header>

      <section
        style={{
          maxWidth: 680,
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
          padding: '40px 24px 72px',
          flex: 1,
        }}
      >
        <h1
          style={{
            margin: '0 0 4px',
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(26px, 4vw, 34px)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: COLORS.burgundy,
          }}
        >
          {t('account.title')}
        </h1>
        <p style={{ margin: '0 0 28px', fontSize: 15, color: COLORS.muted }}>
          {t('account.subtitle')}
        </p>

        {gate === 'checking' ? (
          <p style={{ fontSize: 15, color: COLORS.muted }}>{t('account.loadingProfile')}</p>
        ) : gate === 'anon' ? (
          <p style={{ fontSize: 15, color: COLORS.muted }}>{t('account.redirecting')}</p>
        ) : (
          <div
            style={{
              background: '#fff',
              borderRadius: 22,
              border: '1px solid rgba(42,34,32,0.06)',
              boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
              padding: '26px 26px 28px',
            }}
          >
            {loadError && (
              <div
                style={{
                  marginBottom: 20,
                  padding: '11px 14px',
                  borderRadius: 12,
                  background: 'rgba(91,15,22,0.08)',
                  border: '1px solid rgba(91,15,22,0.2)',
                  fontSize: 14,
                  color: COLORS.burgundy,
                  fontWeight: 600,
                }}
              >
                {t('account.loadError')}
              </div>
            )}

            {/* Read-only identity row */}
            {(email || role) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  marginBottom: 24,
                  paddingBottom: 22,
                  borderBottom: '1px solid rgba(42,34,32,0.08)',
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    background: COLORS.tan,
                    color: COLORS.burgundy,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    fontWeight: 800,
                    flex: '0 0 auto',
                  }}
                >
                  {(form.full_name || email || '?').trim().charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  {email && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 15,
                        fontWeight: 700,
                        color: COLORS.ink,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {email}
                    </p>
                  )}
                  {role && (
                    <p
                      style={{
                        margin: '2px 0 0',
                        fontSize: 13,
                        color: COLORS.muted,
                        textTransform: 'capitalize',
                      }}
                    >
                      {t('account.roleAccount', {
                        role:
                          role === 'host'
                            ? t('auth.roleHost')
                            : role === 'user'
                              ? t('auth.roleGuest')
                              : role,
                      })}
                    </p>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gap: 18 }}>
                <label style={{ display: 'block' }}>
                  <span style={labelStyle}>{t('account.fullName')}</span>
                  <input
                    style={inputStyle}
                    value={form.full_name}
                    onChange={(e) => patch({ full_name: e.target.value })}
                    placeholder="Layla Hassan"
                    autoComplete="name"
                  />
                </label>

                <div
                  className="qk-account-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 18,
                  }}
                >
                  <label style={{ display: 'block' }}>
                    <span style={labelStyle}>{t('account.age')}</span>
                    <input
                      style={inputStyle}
                      type="number"
                      min={1}
                      value={form.age}
                      onChange={(e) => patch({ age: e.target.value })}
                      placeholder={t('account.agePlaceholder')}
                    />
                  </label>
                  <label style={{ display: 'block' }}>
                    <span style={labelStyle}>{t('account.phone')}</span>
                    <input
                      style={inputStyle}
                      type="tel"
                      value={form.phone}
                      onChange={(e) => patch({ phone: e.target.value })}
                      placeholder="+20 100 000 0000"
                      autoComplete="tel"
                    />
                  </label>
                </div>

                <label style={{ display: 'block' }}>
                  <span style={labelStyle}>{t('account.idDocument')}</span>
                  <input
                    style={inputStyle}
                    value={form.id_document}
                    onChange={(e) => patch({ id_document: e.target.value })}
                    placeholder={t('account.idForVerification')}
                  />
                  <span
                    style={{
                      display: 'block',
                      marginTop: 7,
                      fontSize: 12.5,
                      color: COLORS.muted,
                    }}
                  >
                    {t('account.idHint')}
                  </span>
                </label>
              </div>

              {saveError && (
                <div
                  style={{
                    marginTop: 20,
                    padding: '11px 14px',
                    borderRadius: 12,
                    background: 'rgba(91,15,22,0.08)',
                    border: '1px solid rgba(91,15,22,0.2)',
                    fontSize: 14,
                    color: COLORS.burgundy,
                    fontWeight: 600,
                  }}
                >
                  {saveError}
                </div>
              )}
              {saveOk && (
                <div
                  style={{
                    marginTop: 20,
                    padding: '11px 14px',
                    borderRadius: 12,
                    background: 'rgba(15,81,50,0.10)',
                    border: '1px solid rgba(15,81,50,0.25)',
                    fontSize: 14,
                    color: '#0f5132',
                    fontWeight: 600,
                  }}
                >
                  {t('account.saved')}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                style={{
                  marginTop: 24,
                  padding: '13px 30px',
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: FONT,
                  color: '#fff',
                  background: COLORS.burgundy,
                  border: 'none',
                  borderRadius: 14,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? t('account.saving') : t('account.saveChanges')}
              </button>
            </form>
          </div>
        )}

        {/* Change password — separate card below the profile form */}
        {gate === 'ok' && (
          <div
            style={{
              marginTop: 24,
              background: '#fff',
              borderRadius: 22,
              border: '1px solid rgba(42,34,32,0.06)',
              boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
              padding: '26px 26px 28px',
            }}
          >
            <h2
              style={{
                margin: '0 0 4px',
                fontSize: 18,
                fontWeight: 700,
                color: COLORS.ink,
              }}
            >
              {t('account.changePassword')}
            </h2>
            <p style={{ margin: '0 0 22px', fontSize: 14, color: COLORS.muted }}>
              {t('account.changePasswordHint')}
            </p>

            <form onSubmit={handleChangePassword}>
              <div style={{ display: 'grid', gap: 18 }}>
                <label style={{ display: 'block' }}>
                  <span style={labelStyle}>{t('account.currentPassword')}</span>
                  <div style={{ position: 'relative' }}>
                    <input
                      style={{ ...inputStyle, paddingRight: 44 }}
                      type={showCurrent ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => {
                        setCurrentPassword(e.target.value)
                        setPwError(null)
                        setPwOk(false)
                      }}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent((v) => !v)}
                      aria-label={showCurrent ? t('auth.hidePassword') : t('auth.showPassword')}
                      style={eyeButtonStyle}
                    >
                      {showCurrent ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </label>

                <label style={{ display: 'block' }}>
                  <span style={labelStyle}>{t('account.newPassword')}</span>
                  <div style={{ position: 'relative' }}>
                    <input
                      style={{ ...inputStyle, paddingRight: 44 }}
                      type={showNew ? 'text' : 'password'}
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value)
                        setPwError(null)
                        setPwOk(false)
                      }}
                      placeholder={t('auth.passwordMin')}
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew((v) => !v)}
                      aria-label={showNew ? t('auth.hidePassword') : t('auth.showPassword')}
                      style={eyeButtonStyle}
                    >
                      {showNew ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </label>
              </div>

              {pwError && (
                <div
                  style={{
                    marginTop: 20,
                    padding: '11px 14px',
                    borderRadius: 12,
                    background: 'rgba(91,15,22,0.08)',
                    border: '1px solid rgba(91,15,22,0.2)',
                    fontSize: 14,
                    color: COLORS.burgundy,
                    fontWeight: 600,
                  }}
                >
                  {pwError}
                </div>
              )}
              {pwOk && (
                <div
                  style={{
                    marginTop: 20,
                    padding: '11px 14px',
                    borderRadius: 12,
                    background: 'rgba(15,81,50,0.10)',
                    border: '1px solid rgba(15,81,50,0.25)',
                    fontSize: 14,
                    color: '#0f5132',
                    fontWeight: 600,
                  }}
                >
                  {t('account.pwUpdated')}
                </div>
              )}

              <button
                type="submit"
                disabled={pwSaving || !currentPassword || newPassword.length < 6}
                style={{
                  marginTop: 24,
                  padding: '13px 30px',
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: FONT,
                  color: '#fff',
                  background: COLORS.burgundy,
                  border: 'none',
                  borderRadius: 14,
                  cursor:
                    pwSaving || !currentPassword || newPassword.length < 6
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    pwSaving || !currentPassword || newPassword.length < 6 ? 0.6 : 1,
                }}
              >
                {pwSaving ? t('account.updating') : t('account.updatePassword')}
              </button>
            </form>
          </div>
        )}
      </section>
    </main>
  )
}
