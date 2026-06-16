'use client'

// Account settings (UI-only) — the signed-in user edits their profile. Requires
// the bearer token in localStorage (qk_token); redirects to /login otherwise.
// Loads GET /api/local/profile and saves via PATCH /api/local/profile with
// { full_name, age, id_document, phone }. Boutique inline styling, matching the
// rest of the app.
//
// Note: a host's phone is private. It's only ever shown here, to the user
// themselves — never on a listing/detail page.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  API_URL,
  getStoredUser,
  getToken,
  getGuestReviews,
  type GuestReview,
} from '@/lib/api'
import AuthArea from '../_components/auth-area'
import { EyeIcon, EyeOffIcon, eyeButtonStyle } from '@/app/_components/password-eye'
import PasswordStrength, { passwordMeetsMin } from '@/app/_components/password-strength'
import { useLanguage } from '@/lib/i18n/language-provider'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  page: '#E4DECF',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  gold: '#B07A2A',
}

const GRAD_BURGUNDY = 'linear-gradient(135deg,#5B0F16,#8a2530)'

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

// Downscale a picked image to <=256px on its longest side and return a JPEG
// data URL (~0.7 quality). Dependency-free — uses an offscreen <canvas>. The
// resulting data: URL is small enough to store inline via PATCH avatar_url.
async function downscaleToDataUrl(file: File, max = 256, quality = 0.7): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('decode failed'))
    el.src = dataUrl
  })

  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unsupported')
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

interface Profile {
  id?: string | null
  email?: string | null
  full_name?: string | null
  role?: string | null
  age?: number | null
  id_document?: string | null
  phone?: string | null
  bio?: string | null
  avatar_url?: string | null
}

interface FormState {
  full_name: string
  age: string
  id_document: string
  phone: string
  bio: string
  avatar_url: string
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
    bio: '',
    avatar_url: '',
  })
  const [loadError, setLoadError] = useState(false)
  // Reviews this user has received from hosts (host → guest), + the current
  // user id used to fetch them. null guestReviews = not loaded / none yet.
  const [guestReviews, setGuestReviews] = useState<GuestReview[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
        bio: p.bio ?? '',
        avatar_url: p.avatar_url ?? '',
      })
      setGate('ok')

      // Load the reviews hosts have left about this guest. The id comes from the
      // profile when present, else the user persisted at login (qk_user).
      const myId = p.id ?? getStoredUser()?.id ?? null
      if (myId) {
        getGuestReviews(myId).then(setGuestReviews)
      }
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

  async function handlePickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await downscaleToDataUrl(file)
      patch({ avatar_url: dataUrl })
    } catch {
      setSaveError(t('account.saveError'))
    }
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
          bio: form.bio.trim() === '' ? null : form.bio.trim(),
          avatar_url: form.avatar_url === '' ? null : form.avatar_url,
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
        bio: p.bio ?? '',
        avatar_url: p.avatar_url ?? '',
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
        background: COLORS.page,
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
          background: `linear-gradient(180deg, ${COLORS.tan} 0%, ${COLORS.page} 100%)`,
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
        <div style={{ position: 'relative' }}>
          {/* Travel motif: a plane climbs in along a dashed gold contrail that
              draws left→right — the same "boarding pass" flourish as the iOS app. */}
          <div
            aria-hidden="true"
            style={{ position: 'absolute', top: -24, left: 0, right: 0, height: 54, pointerEvents: 'none' }}
          >
            <svg
              width="100%"
              height="54"
              viewBox="0 0 1000 54"
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0 }}
            >
              <path
                className="qk-contrail"
                d="M40 46 Q 520 2 940 18"
                fill="none"
                stroke={COLORS.gold}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="2 10"
              />
            </svg>
            <span
              className="qk-fly"
              style={{
                position: 'absolute',
                left: 'min(94%, 940px)',
                top: 2,
                color: COLORS.gold,
                filter: 'drop-shadow(0 3px 8px rgba(176,122,42,0.45))',
              }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(43deg)' }}>
                <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
              </svg>
            </span>
          </div>

          <h1
            className="qk-reveal"
            style={{
              margin: '0 0 4px',
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 'clamp(26px, 4vw, 34px)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: COLORS.burgundy,
              animationDelay: '0.35s',
            }}
          >
            {t('account.title')}
          </h1>
          <p
            className="qk-reveal"
            style={{ margin: '0 0 28px', fontSize: 15, color: COLORS.muted, animationDelay: '0.45s' }}
          >
            {t('account.subtitle')}
          </p>
        </div>

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
                    background: 'linear-gradient(135deg,#B07A2A,#d8a55a)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    fontWeight: 800,
                    flex: '0 0 auto',
                    boxShadow: '0 0 0 3px rgba(176,122,42,0.25)',
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
              {/* Avatar uploader — circular preview + "Change photo". The picked
                  image is downscaled to a JPEG data URL on a <canvas> and saved
                  inline with the rest of the form. */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 26,
                }}
              >
                <span style={{ ...labelStyle, marginBottom: 0 }}>{t('account.photo')}</span>
                {form.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.avatar_url}
                    alt={form.full_name || email || 'Avatar'}
                    width={96}
                    height={96}
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: 48,
                      objectFit: 'cover',
                      display: 'block',
                      boxShadow: '0 0 0 3px rgba(176,122,42,0.25)',
                    }}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: 48,
                      background: 'linear-gradient(135deg,#B07A2A,#d8a55a)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 34,
                      fontWeight: 800,
                      boxShadow: '0 0 0 3px rgba(176,122,42,0.25)',
                    }}
                  >
                    {(form.full_name || email || '?').trim().charAt(0).toUpperCase()}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePickPhoto}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  className="qk-press"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '9px 18px',
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: FONT,
                    color: COLORS.burgundy,
                    background: '#fff',
                    border: '1px solid rgba(91,15,22,0.3)',
                    borderRadius: 12,
                    cursor: 'pointer',
                  }}
                >
                  {t('account.changePhoto')}
                </button>
              </div>

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

                <label style={{ display: 'block' }}>
                  <span style={labelStyle}>{t('account.bio')}</span>
                  <textarea
                    style={{ ...inputStyle, minHeight: 110, resize: 'vertical', lineHeight: 1.5 }}
                    value={form.bio}
                    onChange={(e) => patch({ bio: e.target.value })}
                    placeholder={t('account.bioPlaceholder')}
                    rows={4}
                  />
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
                className={saving ? undefined : 'qk-press'}
                style={{
                  marginTop: 24,
                  padding: '13px 30px',
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: FONT,
                  color: '#fff',
                  background: GRAD_BURGUNDY,
                  border: 'none',
                  borderRadius: 14,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                  boxShadow: saving ? 'none' : '0 10px 24px rgba(91,15,22,0.28)',
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
                  <PasswordStrength value={newPassword} />
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
                disabled={pwSaving || !currentPassword || !passwordMeetsMin(newPassword)}
                className={
                  pwSaving || !currentPassword || !passwordMeetsMin(newPassword)
                    ? undefined
                    : 'qk-press'
                }
                style={{
                  marginTop: 24,
                  padding: '13px 30px',
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: FONT,
                  color: '#fff',
                  background: GRAD_BURGUNDY,
                  border: 'none',
                  borderRadius: 14,
                  cursor:
                    pwSaving || !currentPassword || !passwordMeetsMin(newPassword)
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    pwSaving || !currentPassword || !passwordMeetsMin(newPassword) ? 0.6 : 1,
                  boxShadow:
                    pwSaving || !currentPassword || !passwordMeetsMin(newPassword)
                      ? 'none'
                      : '0 10px 24px rgba(91,15,22,0.28)',
                }}
              >
                {pwSaving ? t('account.updating') : t('account.updatePassword')}
              </button>
            </form>
          </div>
        )}

        {/* Reviews about you — what hosts said about this guest (host → guest).
            Shown only when at least one review exists. */}
        {gate === 'ok' && guestReviews && guestReviews.length > 0 && (
          <GuestReviewsAboutYou reviews={guestReviews} />
        )}
      </section>
    </main>
  )
}

// "Reviews about you" card — the average rating + the list of reviews a guest
// has received from hosts. Rendered only when there's at least one review.
function GuestReviewsAboutYou({ reviews }: { reviews: GuestReview[] }) {
  const { t, lang } = useLanguage()
  const locale = lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US'
  const avg =
    reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviews.length

  function fmtDate(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function Stars({ n }: { n: number }) {
    const full = Math.max(0, Math.min(5, Math.round(n)))
    return (
      <span aria-hidden="true" style={{ letterSpacing: 1 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            style={{ color: i < full ? COLORS.gold : 'rgba(42,34,32,0.20)', fontSize: 15 }}
          >
            ★
          </span>
        ))}
      </span>
    )
  }

  return (
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
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: COLORS.ink }}>
        {t('reviews.aboutYou')}
      </h2>
      <p
        style={{
          margin: '0 0 18px',
          fontSize: 14,
          color: COLORS.muted,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <Stars n={avg} />
        <span style={{ fontWeight: 700, color: COLORS.ink }}>{avg.toFixed(1)}</span>
        <span>
          {t('reviews.guestRating')} ·{' '}
          {t(reviews.length === 1 ? 'reviews.countOne' : 'reviews.countMany', {
            count: reviews.length,
          })}
        </span>
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {reviews.map((r) => (
          <div
            key={r.id}
            style={{
              background: COLORS.cream,
              borderRadius: 16,
              border: '1px solid rgba(42,34,32,0.06)',
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <Stars n={r.rating} />
              {r.created_at && (
                <span style={{ fontSize: 12, color: COLORS.muted }}>{fmtDate(r.created_at)}</span>
              )}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 14, fontWeight: 700, color: COLORS.ink }}>
              {r.host_name || t('reviews.anonymousHost')}
            </p>
            {r.comment && (
              <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.6, color: COLORS.ink }}>
                {r.comment}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
