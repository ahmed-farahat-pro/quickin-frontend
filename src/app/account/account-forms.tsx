'use client'

// Profile-edit + change-password forms for /account.
//   - Profile : PATCH /api/local/users/[id]      { full_name?, age?, phone?, bio? }
//   - Password: POST  /api/auth/change-password  { currentPassword, newPassword }
// Inline success/error states; no global toast dependency.
//
// Age, phone and "about you" are here because they are on Edit profile in both
// apps and were on no web screen at all: someone who signed up on the site could
// not fill in the profile the site shows. The rules are the shared cores, so the
// message a guest gets before submitting is the one the API would have given.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { checkPassword } from '@/lib/local/password-policy'
import { checkName } from '@/lib/local/name-policy'
import PasswordChecklist from '@/components/features/auth/password-checklist'
import PasswordEyeToggle from '@/components/features/auth/password-eye-toggle'
import { MAX_PHONE_CHARS, filterPhoneInput, isValidPhone } from '@/lib/local/phone-core'
import {
  MAX_AGE,
  MAX_BIO_LENGTH,
  MIN_AGE,
  bioLength,
  checkAge,
  checkBio,
  filterBioInput,
  isBlankField,
  toAsciiDigits,
} from '@/lib/local/profile-core'

const C = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 22,
  border: '1px solid rgba(42,34,32,0.06)',
  boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
  padding: '24px',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 700,
  color: C.ink,
  marginBottom: 6,
}

/** "Optional" next to a label. These three fields genuinely are, and a form that
 *  doesn't say so reads as four things a guest has to hand over to save a name. */
const optionalStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: C.muted,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  borderRadius: 14,
  border: '1px solid rgba(42,34,32,0.16)',
  background: C.cream,
  color: C.ink,
  fontSize: 15,
  fontFamily: 'inherit',
  outline: 'none',
}

function buttonStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-block',
    color: '#fff',
    background: C.burgundy,
    border: 'none',
    fontWeight: 700,
    fontSize: 14,
    fontFamily: 'inherit',
    padding: '11px 26px',
    borderRadius: 999,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }
}

// Become-a-host is now an admin-reviewed APPLICATION, not an instant flip. This
// is a link-styled button that simply navigates to /host/apply; it no longer
// calls /api/local/host/become. Used on both /account and /host (signed-in intro).
export function BecomeHostButton({
  label,
  variant = 'primary',
}: {
  label: string
  variant?: 'primary' | 'large'
}) {
  const style: React.CSSProperties =
    variant === 'large'
      ? {
          display: 'inline-block',
          color: '#fff',
          background: C.burgundy,
          border: 'none',
          fontWeight: 700,
          fontFamily: 'inherit',
          padding: '13px 30px',
          borderRadius: 999,
          fontSize: 15,
          textDecoration: 'none',
          cursor: 'pointer',
        }
      : { ...buttonStyle(false), textDecoration: 'none' }

  return (
    <a href="/host/apply" style={style}>
      {label}
    </a>
  )
}

function Notice({ kind, text }: { kind: 'ok' | 'error'; text: string }) {
  const ok = kind === 'ok'
  return (
    <p
      role={ok ? 'status' : 'alert'}
      style={{
        margin: '14px 0 0',
        fontSize: 13.5,
        fontWeight: 600,
        color: ok ? '#177245' : '#b3261e',
      }}
    >
      {text}
    </p>
  )
}

function sectionTitle(text: string) {
  return (
    <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: C.ink }}>
      {text}
    </h2>
  )
}

/** The message under a field that failed, in the field's own place rather than
 *  in the form-wide notice — three optional fields share one Save button, and a
 *  single line at the bottom cannot say which one to fix. */
function FieldError({ text }: { text?: string }) {
  if (!text) return null
  return (
    <p role="alert" style={{ margin: '6px 0 0', fontSize: 12.5, fontWeight: 600, color: '#b3261e' }}>
      {text}
    </p>
  )
}

type ProfileField = 'full_name' | 'age' | 'phone' | 'bio'

export function AccountForms({
  userId,
  initialName,
  initialAge,
  initialPhone,
  initialBio,
}: {
  userId: string
  initialName: string
  initialAge: string
  initialPhone: string
  initialBio: string
}) {
  const router = useRouter()
  const t = useTranslations('accountPage')
  const tp = useTranslations('passwordPolicy')
  // The same namespace /signup reads, because it is the same rule and the same
  // four sentences — a name refused here should not read differently there.
  const tn = useTranslations('namePolicy')

  // ---- Profile form -----------------------------------------------------
  const [fullName, setFullName] = useState(initialName)
  const [age, setAge] = useState(initialAge)
  const [phone, setPhone] = useState(initialPhone)
  const [bio, setBio] = useState(initialBio)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProfileField, string>>>({})

  /** The localized reason each field is unacceptable, or {} when all are fine.
   *  Same cores the API runs, so this never refuses what the server would take
   *  (or promises to save what it would refuse). */
  function validateProfile(): Partial<Record<ProfileField, string>> {
    const invalid: Partial<Record<ProfileField, string>> = {}
    // The name is the one field here that is NOT optional, and the one this form
    // used to let through: `12345` is non-empty, so nothing stopped it before the
    // request, and the 400 that came back landed in the form-wide notice rather
    // than under the input. Same `checkName` the route runs, so the sentence a
    // guest reads here is the sentence the API would have sent.
    const nameProblem = checkName(fullName)
    if (nameProblem) {
      invalid.full_name = tn(`errors.${nameProblem.code}`)
    }
    const ageProblem = checkAge(age)
    // The bounds are passed for every code, not only the two that print one:
    // next-intl renders the key itself when a placeholder has no value, so a
    // message that names a bound and a call that doesn't supply it produce
    // `accountPage.profile.errors.age.tooYoung` on screen.
    if (ageProblem) {
      invalid.age = t(`profile.errors.age.${ageProblem.code}`, { min: MIN_AGE, max: MAX_AGE })
    }
    // Blank is not an error — every one of these is optional, and clearing one
    // is how it gets removed.
    if (!isBlankField(phone) && !isValidPhone(phone)) invalid.phone = t('profile.errors.phoneInvalid')
    if (checkBio(bio)) invalid.bio = t('profile.errors.bioTooLong', { max: MAX_BIO_LENGTH })
    return invalid
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileMsg(null)

    const invalid = validateProfile()
    setFieldErrors(invalid)
    if (Object.keys(invalid).length) return

    setSavingProfile(true)
    try {
      const res = await fetch(`/api/local/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          full_name: fullName.trim(),
          // Sent as empty strings when cleared; the route reads a blank field as
          // "remove this", which is what the person emptying it means.
          age: age.trim(),
          phone: phone.trim(),
          bio: bio,
        }),
      })
      if (res.status === 401) {
        router.push('/login')
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // The route names the field it refused (and the contact guard refuses a
        // bio without naming one). Put the reason under that input as well as in
        // the notice, so it is next to the thing to change.
        const field = data.field as ProfileField | undefined
        if (field && data.error) setFieldErrors({ [field]: String(data.error) })
        throw new Error(data.error || t('profile.error'))
      }
      setFieldErrors({})
      setProfileMsg({ kind: 'ok', text: t('profile.saved') })
      router.refresh()
    } catch (err) {
      setProfileMsg({
        kind: 'error',
        text: err instanceof Error ? err.message : t('profile.error'),
      })
    } finally {
      setSavingProfile(false)
    }
  }

  // ---- Password form ----------------------------------------------------
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  // One eye per field: the three boxes hold three different secrets, and
  // revealing the new one to proofread it should not also put the current one
  // on screen.
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordMsg(null)

    // The same policy signup and reset enforce (the route re-checks it, and also
    // against this account's email, which the form doesn't hold).
    const weak = checkPassword(newPassword)
    if (weak) {
      setPasswordMsg({ kind: 'error', text: tp(`errors.${weak.code}`) })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ kind: 'error', text: t('password.mismatch') })
      return
    }

    setSavingPassword(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.status === 401) {
        router.push('/login')
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || t('password.error'))
      }
      setPasswordMsg({ kind: 'ok', text: t('password.updated') })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      // Back to dots, so the next thing typed into an emptied box isn't on show.
      setShowCurrent(false)
      setShowNew(false)
      setShowConfirm(false)
    } catch (err) {
      setPasswordMsg({
        kind: 'error',
        text: err instanceof Error ? err.message : t('password.error'),
      })
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <>
      {/* Profile */}
      <form style={cardStyle} onSubmit={saveProfile}>
        {sectionTitle(t('profile.title'))}

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="acct-name" style={labelStyle}>
            {t('profile.fullName')}
          </label>
          <input
            id="acct-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t('profile.fullNamePlaceholder')}
            autoComplete="name"
            style={inputStyle}
          />
          <FieldError text={fieldErrors.full_name} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="acct-age" style={labelStyle}>
            {t('profile.age')} <span style={optionalStyle}>{t('profile.optional')}</span>
          </label>
          <input
            id="acct-age"
            // `inputMode` rather than type="number": a spinner on an age is
            // noise, and type="number" also hands back '' for anything it
            // dislikes, which would swallow what the guest typed.
            type="text"
            inputMode="numeric"
            value={age}
            // Folded to ASCII on the way in so an Arabic keyboard's ٣٤ shows as
            // the number it is, and capped at three digits so the field cannot
            // hold a year.
            onChange={(e) => setAge(toAsciiDigits(e.target.value).replace(/[^\d]/g, '').slice(0, 3))}
            placeholder={t('profile.agePlaceholder')}
            aria-describedby="acct-age-help"
            style={inputStyle}
          />
          <FieldError text={fieldErrors.age} />
          <p id="acct-age-help" style={{ margin: '6px 0 0', fontSize: 12.5, color: C.muted }}>
            {t('profile.ageHelp', { min: MIN_AGE, max: MAX_AGE })}
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="acct-phone" style={labelStyle}>
            {t('profile.phone')} <span style={optionalStyle}>{t('profile.optional')}</span>
          </label>
          <input
            id="acct-phone"
            type="tel"
            value={phone}
            // Filtered on every keystroke, the same as /host/apply: a letter
            // never appears in the field at all, which is quieter than typing a
            // word and being told about it on save.
            onChange={(e) => setPhone(filterPhoneInput(e.target.value))}
            placeholder={t('profile.phonePlaceholder')}
            autoComplete="tel"
            maxLength={MAX_PHONE_CHARS}
            aria-describedby="acct-phone-help"
            style={inputStyle}
          />
          <FieldError text={fieldErrors.phone} />
          <p id="acct-phone-help" style={{ margin: '6px 0 0', fontSize: 12.5, color: C.muted }}>
            {t('profile.phoneHelp')}
          </p>
        </div>

        <div style={{ marginBottom: 4 }}>
          <label htmlFor="acct-bio" style={labelStyle}>
            {t('profile.bio')} <span style={optionalStyle}>{t('profile.optional')}</span>
          </label>
          <textarea
            id="acct-bio"
            value={bio}
            onChange={(e) => setBio(filterBioInput(e.target.value))}
            placeholder={t('profile.bioPlaceholder')}
            rows={4}
            aria-describedby="acct-bio-count"
            style={{ ...inputStyle, minHeight: 108, resize: 'vertical', lineHeight: 1.55 }}
          />
          <FieldError text={fieldErrors.bio} />
          <p
            id="acct-bio-count"
            // Live, because a cap discovered on submit is a cap that already
            // cost someone their last paragraph.
            aria-live="polite"
            style={{
              margin: '6px 0 0',
              fontSize: 12.5,
              color: bioLength(bio) > MAX_BIO_LENGTH ? '#b3261e' : C.muted,
              textAlign: 'end',
            }}
          >
            {t('profile.bioCount', { count: bioLength(bio), max: MAX_BIO_LENGTH })}
          </p>
        </div>

        <div style={{ marginTop: 18 }}>
          <button type="submit" disabled={savingProfile} style={buttonStyle(savingProfile)}>
            {savingProfile ? t('profile.saving') : t('profile.save')}
          </button>
        </div>

        {profileMsg && <Notice kind={profileMsg.kind} text={profileMsg.text} />}
      </form>

      {/* Password */}
      <form style={cardStyle} onSubmit={changePassword}>
        {sectionTitle(t('password.title'))}

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="acct-current" style={labelStyle}>
            {t('password.current')}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="acct-current"
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              style={{ ...inputStyle, paddingInlineEnd: 46 }}
              required
            />
            <PasswordEyeToggle
              shown={showCurrent}
              onToggle={() => setShowCurrent((s) => !s)}
              controls="acct-current"
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="acct-new" style={labelStyle}>
            {t('password.new')}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="acct-new"
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              aria-describedby="acct-new-rules"
              style={{ ...inputStyle, paddingInlineEnd: 46 }}
              required
            />
            <PasswordEyeToggle
              shown={showNew}
              onToggle={() => setShowNew((s) => !s)}
              controls="acct-new"
            />
          </div>
          <PasswordChecklist id="acct-new-rules" password={newPassword} />
        </div>

        <div style={{ marginBottom: 4 }}>
          <label htmlFor="acct-confirm" style={labelStyle}>
            {t('password.confirm')}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="acct-confirm"
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              style={{ ...inputStyle, paddingInlineEnd: 46 }}
              required
            />
            <PasswordEyeToggle
              shown={showConfirm}
              onToggle={() => setShowConfirm((s) => !s)}
              controls="acct-confirm"
            />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <button type="submit" disabled={savingPassword} style={buttonStyle(savingPassword)}>
            {savingPassword ? t('password.updating') : t('password.update')}
          </button>
        </div>

        {passwordMsg && <Notice kind={passwordMsg.kind} text={passwordMsg.text} />}
      </form>
    </>
  )
}
