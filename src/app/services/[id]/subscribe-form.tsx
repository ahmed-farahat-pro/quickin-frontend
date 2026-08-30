'use client'

// The guest's "request this service" form: POSTs /api/local/service-requests
// and reports what came back. The host answers from /host/services, and the
// guest tracks it from /account/subscriptions.
//
// Signed-out visitors get a sign-in link instead of a form — the button would
// only 401, and sending them to /login with no explanation is the version of
// this people abandon.
import { useState } from 'react'
import { useTranslations } from 'next-intl'

const C = {
  burgundy: '#5B0F16',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

export function SubscribeForm({
  serviceId,
  signedIn,
  isOwnService,
}: {
  serviceId: string
  signedIn: boolean
  /** The host looking at their own service. The backend rejects subscribing to
   *  it, so the form is replaced by a link into the management screen. */
  isOwnService: boolean
}) {
  const t = useTranslations('serviceDetail')
  const [preferredDate, setPreferredDate] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  if (isOwnService) {
    return (
      <Panel>
        <p style={{ margin: '0 0 12px', fontSize: 14.5, color: C.muted, lineHeight: 1.55 }}>
          {t('ownService')}
        </p>
        <a href="/host/services" style={linkButton}>
          {t('manageService')}
        </a>
      </Panel>
    )
  }

  if (!signedIn) {
    return (
      <Panel>
        <p style={{ margin: '0 0 12px', fontSize: 14.5, color: C.muted, lineHeight: 1.55 }}>
          {t('signInToRequest')}
        </p>
        <a href="/login" style={linkButton}>
          {t('signIn')}
        </a>
      </Panel>
    )
  }

  if (done) {
    return (
      <Panel>
        <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#177245' }}>
          {t('sent.title')}
        </p>
        <p style={{ margin: '0 0 6px', fontSize: 14.5, color: C.muted, lineHeight: 1.55 }}>
          {t('sent.body')}
        </p>
        {/* The code is what the guest quotes to the host on the day, so it is
            shown here rather than only on the subscriptions list. */}
        {done !== 'no-code' && (
          <p style={{ margin: '0 0 14px', fontSize: 14, color: C.ink, fontWeight: 700 }}>
            {t('sent.code', { code: done })}
          </p>
        )}
        <a href="/account/subscriptions" style={linkButton}>
          {t('sent.viewRequests')}
        </a>
      </Panel>
    )
  }

  async function submit() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/local/service-requests', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: serviceId,
          preferred_date: preferredDate || null,
          note: note.trim() || null,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        // The backend distinguishes "you already asked for this one" from a
        // real failure, and that message is worth showing verbatim.
        throw new Error(body?.error || t('failed'))
      }
      setDone(body?.request_code || 'no-code')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed'))
      setSaving(false)
    }
  }

  return (
    <Panel>
      <p style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: C.ink }}>
        {t('requestTitle')}
      </p>

      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={labelStyle}>{t('preferredDate')}</span>
        <input
          type="date"
          value={preferredDate}
          onChange={(e) => setPreferredDate(e.target.value)}
          disabled={saving}
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={labelStyle}>{t('note')}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={saving}
          rows={3}
          placeholder={t('notePlaceholder')}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </label>

      {error && (
        <p style={{ margin: '0 0 12px', fontSize: 13.5, color: C.burgundy }} role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        style={{
          border: 0,
          borderRadius: 999,
          padding: '11px 24px',
          fontSize: 15,
          fontWeight: 700,
          fontFamily: 'inherit',
          color: '#fff',
          background: saving ? 'rgba(91,15,22,0.35)' : C.burgundy,
          cursor: saving ? 'wait' : 'pointer',
          width: '100%',
        }}
      >
        {saving ? t('sending') : t('request')}
      </button>

      <p style={{ margin: '10px 0 0', fontSize: 12.5, color: C.muted, textAlign: 'center' }}>
        {t('noChargeYet')}
      </p>
    </Panel>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 20,
        border: `1px solid ${C.tan}`,
        boxShadow: '0 6px 24px rgba(42,34,32,0.07)',
        padding: '20px 22px',
      }}
    >
      {children}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13.5,
  fontWeight: 700,
  color: C.ink,
  marginBottom: 5,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: 12,
  border: '1px solid rgba(42,34,32,0.14)',
  padding: '10px 12px',
  fontSize: 14.5,
  fontFamily: 'inherit',
  color: C.ink,
  background: '#fff',
}

const linkButton: React.CSSProperties = {
  display: 'inline-block',
  borderRadius: 999,
  padding: '10px 22px',
  fontSize: 14.5,
  fontWeight: 700,
  color: '#fff',
  background: C.burgundy,
  textDecoration: 'none',
}
