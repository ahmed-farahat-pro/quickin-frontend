'use client'

// "Complete your account" — the blocking step for an account created by a first
// Google sign-in. Google hands us a name and an email but no phone or identity
// document, both of which every new account owes; until they are on file the
// IdentityGate in the root layout keeps sending the user back here.
//
//   POST /api/local/account/identity { phone, doc_type, id_number, id_front, id_back,
//        role, …role pages }
//     → 200 the new identity + host state | 400 { error, fields } | 409 nothing owed
//
// It walks the same role pages as /signup minus the account one (Google made the
// account): Guest / Host cards (Guest preselected, or the card picked on /signup
// before the Google button), then Phone & ID → refund (optional) | hosting → payout.
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  EMPTY_IDENTITY,
  IdentityFields,
  identityPayload,
  useIdentityValidation,
  type IdentityErrors,
  type IdentityValues,
} from '@/components/features/auth/identity-fields'
import { loadMe } from '@/components/features/auth/identity-gate'
import { needsAccountCompletion } from '@/lib/local/signup-identity-ui-core'
import {
  DestinationStep,
  HostingFields,
  RoleCards,
  StepIndicator,
  StepNav,
  storedSignupRole,
  useSignupRoleFlow,
} from '@/components/features/auth/signup-role-steps'
import { firstStepWithError } from '@/lib/local/signup-role-ui-core'

const C = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

export default function CompleteAccountPage() {
  const t = useTranslations('signupIdentity')
  const tr = useTranslations('signupRole')
  const check = useIdentityValidation()
  const flow = useSignupRoleFlow(false)
  const [email, setEmail] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [identity, setIdentity] = useState<IdentityValues>(EMPTY_IDENTITY)
  const [errors, setErrors] = useState<IdentityErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Signed out → sign in; nothing owed → on to the app. Only an account that
  // still owes its identity sees the form.
  useEffect(() => {
    let live = true
    loadMe(true).then((me) => {
      if (!live) return
      if (!me) {
        window.location.replace('/login')
        return
      }
      if (!needsAccountCompletion(me)) {
        window.location.replace('/explore')
        return
      }
      setEmail(typeof me.email === 'string' ? me.email : null)
      // The card picked on /signup before the Google button, if any.
      flow.setRole(storedSignupRole())
      setReady(true)
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Next on every page but the last; the last one posts everything. */
  function handleStep(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (flow.current === 'identity') {
      const found = check.validate(identity)
      setErrors(found)
      if (Object.keys(found).length) return
    } else if (!flow.validateCurrent()) {
      return
    }
    if (!flow.isLast) {
      flow.goTo(flow.step + 1)
      return
    }
    void submit(false)
  }

  async function submit(refundSkipped: boolean) {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/local/account/identity', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...identityPayload(identity), ...flow.body(refundSkipped) }),
      })
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      // 409: already complete (another tab, another device) — nothing to do here.
      if (res.ok || res.status === 409) {
        await loadMe(true)
        window.location.href = '/explore'
        return
      }
      if (res.status === 413) {
        setError(t('errors.tooLarge'))
        flow.goTo(flow.steps.indexOf('identity'))
        setLoading(false)
        return
      }
      const data = await res.json().catch(() => ({}))
      const fromServer = check.fromServer(data?.fields, identity)
      if (Object.keys(fromServer).length) setErrors(fromServer)
      flow.applyServerFields(data?.fields)
      const at = firstStepWithError(flow.steps, Object.keys(data?.fields ?? {}))
      if (at !== -1) flow.goTo(at)
      else setError(data?.error || t('complete.failed'))
      setLoading(false)
    } catch {
      setError(t('errors.network'))
      setLoading(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: C.cream,
        color: C.ink,
        fontFamily: FONT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: '#fff',
          borderRadius: 28,
          boxShadow: '0 12px 48px rgba(42,34,32,0.12)',
          border: '1px solid rgba(42,34,32,0.06)',
          padding: '36px 28px 32px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Quick In" style={{ height: 50, width: 'auto', margin: '0 auto', display: 'block' }} />
          <h1
            style={{
              margin: '16px 0 6px',
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 26,
              fontWeight: 700,
              color: C.burgundy,
            }}
          >
            {t('complete.title')}
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: C.muted }}>
            {t('complete.subtitle')}
          </p>
          {email && (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: C.muted, wordBreak: 'break-all' }}>
              {t('complete.signedInAs', { email })}
            </p>
          )}
        </div>

        {error && (
          <div
            role="alert"
            style={{
              background: 'rgba(91,15,22,0.06)',
              border: '1px solid rgba(91,15,22,0.18)',
              color: C.burgundy,
              fontSize: 14,
              borderRadius: 14,
              padding: '10px 14px',
              marginBottom: 18,
            }}
          >
            {error}
          </div>
        )}

        {!ready ? (
          <p style={{ textAlign: 'center', fontSize: 14, color: C.muted }}>{t('complete.loading')}</p>
        ) : (
          !flow.started ? (
            <div>
              <h2 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: C.ink, textAlign: 'center' }}>
                {tr('chooseTitle')}
              </h2>
              <RoleCards value={flow.role} onChange={flow.setRole} />
              <StepNav
                primaryType="button"
                primaryLabel={tr('next')}
                backLabel={tr('back')}
                onPrimary={() => {
                  flow.setStarted(true)
                  flow.goTo(0)
                }}
              />
            </div>
          ) : (
          <form onSubmit={handleStep} noValidate>
            <StepIndicator steps={flow.steps} current={flow.step} />
            {flow.current === 'identity' && (
              <IdentityFields
                idPrefix="complete"
                value={identity}
                onChange={setIdentity}
                errors={errors}
                onClearError={(f) => setErrors((e) => ({ ...e, [f]: undefined }))}
                disabled={loading}
              />
            )}
            {flow.current === 'hosting' && (
              <HostingFields idPrefix="complete-hosting" value={flow.hosting} onChange={flow.setHosting} errors={flow.hostingErrors} />
            )}
            {(flow.current === 'refund' || flow.current === 'payout') && (
              <DestinationStep
                kind={flow.current}
                value={flow.destination}
                onChange={flow.setDestination}
                error={flow.destinationError}
              />
            )}
            <StepNav
              backLabel={tr('back')}
              onBack={() => (flow.step === 0 ? flow.setStarted(false) : flow.goTo(flow.step - 1))}
              disabled={loading}
              primaryLabel={
                loading
                  ? t('complete.submitting')
                  : !flow.isLast
                    ? tr('next')
                    : flow.role === 'host'
                      ? tr('completeHost')
                      : tr('completeGuest')
              }
            />
            {flow.current === 'refund' && (
              <p style={{ margin: '14px 0 0', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => void submit(true)}
                  disabled={loading}
                  style={{ background: 'none', border: 'none', padding: 0, color: C.burgundy, fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                >
                  {tr('skip')}
                </button>
              </p>
            )}
          </form>
          )
        )}

        <p style={{ margin: '20px 0 0', textAlign: 'center', fontSize: 14 }}>
          <a href="/api/auth/logout" style={{ color: C.burgundy, fontWeight: 600, textDecoration: 'none' }}>
            {t('complete.signOut')}
          </a>
        </p>
      </div>
    </main>
  )
}
