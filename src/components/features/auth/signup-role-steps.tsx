'use client'

// The role pages of the stepped signup, shared by /signup and /complete-account:
// the Guest / Host cards, the step indicator, the host-only hosting page and the
// money-destination page (a guest's optional refund details, a host's required
// payout). The rules — which steps, which errors belong where, the body — live
// in lib/local/signup-role-ui-core.ts.
//
// Boutique inline styles, like the signup card these sit in. The hosting inputs
// reuse the host application's copy (`hostApply.*`) and the destination reuses
// its PayoutFields, so the two forms can never drift.
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { PayoutFields, draftFromView, type PayoutDraft } from '@/app/account/payout-method-card'
import {
  EMPTY_HOSTING,
  SIGNUP_HOST_TYPES,
  SIGNUP_ROLE_STORAGE_KEY,
  checkHosting,
  isDestinationBlank,
  normalizeRole,
  roleBody,
  signupSteps,
  type HostingValues,
  type SignupRole,
  type SignupStep,
} from '@/lib/local/signup-role-ui-core'

const C = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: C.ink,
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: FONT,
  fontSize: 15,
  color: C.ink,
  background: C.cream,
  border: '1px solid rgba(42,34,32,0.14)',
  borderRadius: 18,
  padding: '12px 16px',
  outline: 'none',
}

const errorStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 6,
  fontSize: 13,
  lineHeight: 1.4,
  color: C.burgundy,
}

function FieldError({ id, text }: { id?: string; text?: string }) {
  return text ? (
    <span id={id} role="alert" style={errorStyle}>
      {text}
    </span>
  ) : null
}

function GuestIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7h18v13H3z" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function HostIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-5h4v5" />
    </svg>
  )
}

/** Guest / Host, Guest preselected by the caller — choosing is never required. */
export function RoleCards({ value, onChange }: { value: SignupRole; onChange: (r: SignupRole) => void }) {
  const t = useTranslations('signupRole')
  return (
    <div role="radiogroup" aria-label={t('chooseTitle')} style={{ display: 'grid', gap: 12 }}>
      {(['guest', 'host'] as const).map((r) => {
        const on = value === r
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={on}
            data-role={r}
            onClick={() => onChange(r)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              textAlign: 'start',
              fontFamily: FONT,
              background: on ? C.burgundy + '0d' : '#fff',
              border: on ? `2px solid ${C.burgundy}` : '1px solid rgba(42,34,32,0.16)',
              // Keep the box the same size whether selected or not.
              padding: on ? '15px 17px' : '16px 18px',
              borderRadius: 18,
              cursor: 'pointer',
              color: C.ink,
            }}
          >
            <span
              style={{
                flex: '0 0 auto',
                width: 40,
                height: 40,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: on ? C.burgundy : C.tan,
                color: on ? '#fff' : C.burgundy,
              }}
            >
              {r === 'guest' ? <GuestIcon /> : <HostIcon />}
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 16, fontWeight: 700 }}>{t(`roles.${r}.title`)}</span>
              <span style={{ display: 'block', marginTop: 3, fontSize: 13.5, lineHeight: 1.45, color: C.muted }}>
                {t(`roles.${r}.body`)}
              </span>
            </span>
            <span
              aria-hidden="true"
              style={{
                flex: '0 0 auto',
                marginTop: 2,
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: on ? `6px solid ${C.burgundy}` : '2px solid rgba(42,34,32,0.3)',
                boxSizing: 'border-box',
              }}
            />
          </button>
        )
      })}
      <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>{t('chooseHint')}</p>
    </div>
  )
}

/** "Step 2 of 4 · Phone & ID" over a segmented bar. */
export function StepIndicator({ steps, current }: { steps: readonly SignupStep[]; current: number }) {
  const t = useTranslations('signupRole')
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 8 }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, letterSpacing: '0.02em' }}>
          {t('stepOf', { current: current + 1, total: steps.length })}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{t(`steps.${steps[current]}`)}</span>
      </div>
      <ol
        aria-label={t('stepOf', { current: current + 1, total: steps.length })}
        style={{ display: 'flex', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}
      >
        {steps.map((s, i) => (
          <li
            key={s}
            aria-current={i === current ? 'step' : undefined}
            title={t(`steps.${s}`)}
            style={{
              flex: 1,
              height: 5,
              borderRadius: 999,
              background: i <= current ? C.burgundy : 'rgba(42,34,32,0.12)',
              transition: 'background 0.2s ease',
            }}
          />
        ))}
      </ol>
    </div>
  )
}

export type HostingErrors = Partial<Record<'host_type' | 'address' | 'company' | 'notes' | 'terms', string>>

/** The host-only page: host type, address, company, notes and the host terms. */
export function HostingFields({
  value,
  onChange,
  errors,
  idPrefix = 'hosting',
}: {
  value: HostingValues
  onChange: (next: HostingValues) => void
  errors: HostingErrors
  idPrefix?: string
}) {
  const t = useTranslations('hostApply')
  const tr = useTranslations('signupRole')
  const isBusiness = value.hostType === 'company' || value.hostType === 'brokerage'
  return (
    <>
      <p style={{ margin: '0 0 18px', fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>{tr('hostingHint')}</p>

      <div style={{ marginBottom: 18 }}>
        <span style={labelStyle}>{t('fields.hostType')}</span>
        <div role="radiogroup" aria-label={t('fields.hostType')} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SIGNUP_HOST_TYPES.map((ht) => {
            const on = value.hostType === ht
            return (
              <button
                key={ht}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange({ ...value, hostType: ht })}
                style={{
                  flex: '1 1 0',
                  minWidth: 96,
                  fontFamily: FONT,
                  fontSize: 14,
                  fontWeight: 600,
                  padding: '10px 12px',
                  borderRadius: 999,
                  cursor: 'pointer',
                  border: on ? `1px solid ${C.burgundy}` : '1px solid rgba(42,34,32,0.16)',
                  background: on ? C.burgundy : '#fff',
                  color: on ? '#fff' : C.ink,
                }}
              >
                {t(`hostTypes.${ht}`)}
              </button>
            )
          })}
        </div>
        <FieldError text={errors.host_type} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label htmlFor={`${idPrefix}-address`} style={labelStyle}>
          {t('fields.address')}
        </label>
        <input
          id={`${idPrefix}-address`}
          type="text"
          autoComplete="street-address"
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          placeholder={t('placeholders.address')}
          aria-invalid={errors.address ? true : undefined}
          style={errors.address ? { ...inputStyle, border: `1px solid ${C.burgundy}` } : inputStyle}
        />
        <FieldError text={errors.address} />
      </div>

      {isBusiness && (
        <div style={{ marginBottom: 16 }}>
          <label htmlFor={`${idPrefix}-company`} style={labelStyle}>
            {value.hostType === 'brokerage' ? t('fields.brokerageName') : t('fields.companyName')}
          </label>
          <input
            id={`${idPrefix}-company`}
            type="text"
            autoComplete="organization"
            value={value.company}
            onChange={(e) => onChange({ ...value, company: e.target.value })}
            placeholder={t('placeholders.company')}
            style={inputStyle}
          />
          <FieldError text={errors.company} />
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label htmlFor={`${idPrefix}-notes`} style={labelStyle}>
          {t('fields.notesOptional')}
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          rows={3}
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          placeholder={t('placeholders.notes')}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 84 }}
        />
        <FieldError text={errors.notes} />
      </div>

      <label
        htmlFor={`${idPrefix}-terms`}
        style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: C.ink, cursor: 'pointer' }}
      >
        <input
          id={`${idPrefix}-terms`}
          type="checkbox"
          checked={value.termsAccepted}
          onChange={(e) => onChange({ ...value, termsAccepted: e.target.checked })}
          aria-invalid={errors.terms ? true : undefined}
          aria-labelledby={`${idPrefix}-terms-text`}
          style={{ marginTop: 3, width: 18, height: 18, accentColor: C.burgundy }}
        />
        <span id={`${idPrefix}-terms-text`}>
          {t.rich('terms.label', {
            link: (chunks) => (
              <a href="/terms#host" target="_blank" rel="noreferrer" style={{ color: C.burgundy, fontWeight: 600 }}>
                {chunks}
              </a>
            ),
          })}
        </span>
      </label>
      <FieldError text={errors.terms} />
    </>
  )
}

/** The refund (guest, optional) or payout (host, required) destination page. */
export function DestinationStep({
  kind,
  value,
  onChange,
  error,
}: {
  kind: 'refund' | 'payout'
  value: PayoutDraft
  onChange: (next: PayoutDraft) => void
  error?: string
}) {
  const t = useTranslations('signupRole')
  return (
    <>
      <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: C.ink }}>
        {kind === 'refund' ? t('refundTitle') : t('payoutTitle')}
      </h2>
      <p style={{ margin: '0 0 18px', fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>
        {kind === 'refund' ? t('refundHint') : t('payoutHint')}
      </p>
      <PayoutFields value={value} onChange={onChange} />
      {error && (
        <div role="alert" style={{ ...errorStyle, marginTop: 0, marginBottom: 12 }}>
          {error}
        </div>
      )}
    </>
  )
}

/** Back (secondary) + the primary action, side by side. */
export function StepNav({
  onBack,
  primaryLabel,
  primaryType = 'submit',
  onPrimary,
  disabled,
  backLabel,
}: {
  onBack?: () => void
  primaryLabel: string
  primaryType?: 'submit' | 'button'
  onPrimary?: () => void
  disabled?: boolean
  backLabel: string
}) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          disabled={disabled}
          style={{
            flex: '0 0 auto',
            fontFamily: FONT,
            fontSize: 15,
            fontWeight: 600,
            color: C.ink,
            background: '#fff',
            border: '1px solid rgba(42,34,32,0.2)',
            borderRadius: 20,
            padding: '13px 20px',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          {backLabel}
        </button>
      )}
      <button
        type={primaryType}
        onClick={onPrimary}
        disabled={disabled}
        style={{
          flex: 1,
          fontFamily: FONT,
          fontSize: 16,
          fontWeight: 600,
          color: '#fff',
          background: C.burgundy,
          border: 'none',
          borderRadius: 20,
          padding: '13px 16px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.7 : 1,
        }}
      >
        {primaryLabel}
      </button>
    </div>
  )
}

/** The role picked before a Google sign-up, read back on /complete-account. */
export function storedSignupRole(): SignupRole {
  try {
    return normalizeRole(window.sessionStorage.getItem(SIGNUP_ROLE_STORAGE_KEY))
  } catch {
    return 'guest'
  }
}

/**
 * State for the role pages, shared by /signup (`withAccount`) and
 * /complete-account (no account step). The page owns the account and identity
 * fields; this owns the role, the current step, the hosting page and the
 * destination, their local checks and how a 400's `fields` land on them.
 */
export function useSignupRoleFlow(withAccount: boolean, initialRole: SignupRole = 'guest') {
  const t = useTranslations('hostApply')
  const [role, setRoleState] = useState<SignupRole>(initialRole)
  /** False while the Guest / Host cards are showing. */
  const [started, setStarted] = useState(false)
  const [step, setStep] = useState(0)
  const [hosting, setHostingState] = useState<HostingValues>(EMPTY_HOSTING)
  const [hostingErrors, setHostingErrors] = useState<HostingErrors>({})
  const [destination, setDestinationState] = useState<PayoutDraft>(() => draftFromView(null))
  const [destinationError, setDestinationError] = useState<string | undefined>()

  const steps = signupSteps(role, withAccount)
  const current: SignupStep = steps[Math.min(step, steps.length - 1)]
  const isLast = step >= steps.length - 1

  function setRole(r: SignupRole) {
    setRoleState(r)
    // Remembered for a Google sign-up, which lands on /complete-account.
    try {
      window.sessionStorage.setItem(SIGNUP_ROLE_STORAGE_KEY, r)
    } catch {
      /* private mode — the completion page just opens on Guest */
    }
  }

  function setHosting(next: HostingValues) {
    setHostingState(next)
    setHostingErrors({})
  }

  function setDestination(next: PayoutDraft) {
    setDestinationState(next)
    setDestinationError(undefined)
  }

  function goTo(i: number) {
    setStep(Math.max(0, Math.min(i, steps.length - 1)))
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** Local checks for the role pages; true when `current` may move on. */
  function validateCurrent(): boolean {
    if (current === 'hosting') {
      const e: HostingErrors = {}
      for (const f of checkHosting(hosting)) {
        e[f] = f === 'host_type' ? t('errors.hostTypeInvalid') : f === 'address' ? t('errors.addressRequired') : t('errors.termsRequired')
      }
      setHostingErrors(e)
      return !Object.keys(e).length
    }
    if (current === 'payout' && isDestinationBlank(destination as unknown as Record<string, unknown>)) {
      setDestinationError(t('errors.payoutRequired'))
      return false
    }
    return true
  }

  /** Put a 400's role keys under their fields. The server's English is kept —
   *  it names the exact problem (a bad IBAN checksum, say). */
  function applyServerFields(fields: Record<string, string> | undefined) {
    if (!fields) return
    const e: HostingErrors = {}
    for (const k of ['host_type', 'address', 'company', 'notes', 'terms'] as const) {
      if (fields[k]) {
        e[k] = k === 'host_type' ? t('errors.hostTypeInvalid') : k === 'terms' ? t('errors.termsRequired') : fields[k]
      }
    }
    setHostingErrors(e)
    setDestinationError(fields.payout || fields.refund_method || undefined)
  }

  function body(refundSkipped = false) {
    return roleBody(role, hosting, destination as unknown as Record<string, unknown>, refundSkipped)
  }

  return {
    role, setRole, started, setStarted, step, steps, current, isLast, goTo,
    hosting, setHosting, hostingErrors,
    destination, setDestination, destinationError,
    validateCurrent, applyServerFields, body,
  }
}
