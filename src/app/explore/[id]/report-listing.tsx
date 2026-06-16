'use client'

// "Report this listing" — a small, branded reporting flow for the listing
// detail page.
//
//  • A subtle text/flag trigger under the host area.
//  • Clicking opens a modal: a reason <select> + optional details textarea.
//  • Signed-in users POST /api/local/reports { target_type:'listing', target_id }.
//    Anonymous visitors instead see a "sign in to report" prompt with a /login
//    link (so we never lose the report intent silently).
//  • On success the modal shows a thank-you, then auto-closes.
//
// Localized + RTL-safe (logical layout, no hardcoded copy).
import { useEffect, useState } from 'react'
import { createReport, getToken } from '@/lib/api'
import { useLanguage } from '@/lib/i18n/language-provider'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  green: '#0f5132',
}
const GRAD_BURGUNDY = 'linear-gradient(135deg,#5B0F16,#8a2530)'
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

// The reason values sent to the backend (stable, English) paired with the i18n
// key used to render each option's label.
const REASONS: { value: string; labelKey: string }[] = [
  { value: 'Inaccurate listing', labelKey: 'report.reasonInaccurate' },
  { value: 'Scam or fraud', labelKey: 'report.reasonScam' },
  { value: 'Offensive content', labelKey: 'report.reasonOffensive' },
  { value: 'Something else', labelKey: 'report.reasonOther' },
]

type Phase = 'idle' | 'submitting' | 'done'

export default function ReportListing({ listingId }: { listingId: string }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  // Resolve auth lazily (token lives in localStorage → client-only).
  useEffect(() => {
    if (!open) return
    setSignedIn(!!getToken())
  }, [open])

  // Close on Escape while the dialog is open.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function close() {
    setOpen(false)
    // Reset for next time (after the close animation would run).
    setReason('')
    setDetails('')
    setError(null)
    setPhase('idle')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const token = getToken()
    if (!token) {
      setSignedIn(false)
      return
    }
    if (!reason) return
    setPhase('submitting')
    try {
      await createReport(token, {
        target_type: 'listing',
        target_id: listingId,
        reason,
        details: details.trim() || undefined,
      })
      setPhase('done')
      // Auto-close shortly after the thank-you shows.
      setTimeout(() => close(), 1800)
    } catch {
      setError(t('report.error'))
      setPhase('idle')
    }
  }

  return (
    <>
      {/* Trigger — a quiet flag link, set apart from the host block. */}
      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="qk-press"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            appearance: 'none',
            border: 'none',
            background: 'transparent',
            color: COLORS.muted,
            fontSize: 13.5,
            fontWeight: 600,
            fontFamily: FONT,
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
          {t('report.reportListing')}
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('report.title')}
          onClick={close}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(20,12,10,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 440,
              background: '#fff',
              borderRadius: 28,
              border: '1px solid rgba(42,34,32,0.06)',
              boxShadow: '0 24px 60px rgba(42,34,32,0.28)',
              fontFamily: FONT,
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                background: GRAD_BURGUNDY,
                padding: '18px 22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>
                {signedIn === false ? t('report.signInTitle') : t('report.title')}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={t('report.cancel')}
                className="qk-press"
                style={{
                  flex: '0 0 auto',
                  appearance: 'none',
                  border: '1px solid rgba(246,241,230,0.5)',
                  background: 'rgba(246,241,230,0.12)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 16,
                  lineHeight: 1,
                  borderRadius: 999,
                  width: 32,
                  height: 32,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '20px 22px 24px' }}>
              {/* Anonymous → prompt sign-in. */}
              {signedIn === false ? (
                <>
                  <p style={{ margin: '0 0 18px', fontSize: 14.5, color: COLORS.muted, lineHeight: 1.5 }}>
                    {t('report.signInIntro')}
                  </p>
                  <a
                    href="/login"
                    className="qk-press"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '12px 24px',
                      borderRadius: 14,
                      background: GRAD_BURGUNDY,
                      color: '#fff',
                      fontSize: 15,
                      fontWeight: 700,
                      textDecoration: 'none',
                      boxShadow: '0 10px 24px rgba(91,15,22,0.28)',
                    }}
                  >
                    {t('report.signIn')}
                  </a>
                </>
              ) : phase === 'done' ? (
                <div style={{ textAlign: 'center', padding: '10px 0 6px' }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      background: 'rgba(15,81,50,0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 14px',
                      color: COLORS.green,
                    }}
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.ink, lineHeight: 1.5 }}>
                    {t('report.thanks')}
                  </p>
                </div>
              ) : (
                <form onSubmit={submit}>
                  <p style={{ margin: '0 0 18px', fontSize: 14, color: COLORS.muted, lineHeight: 1.5 }}>
                    {t('report.intro')}
                  </p>

                  <label style={{ display: 'block', marginBottom: 16 }}>
                    <span style={labelStyle}>{t('report.reason')}</span>
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      required
                      style={{ ...inputStyle, appearance: 'auto', cursor: 'pointer' }}
                    >
                      <option value="" disabled>
                        {t('report.reasonPlaceholder')}
                      </option>
                      {REASONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {t(r.labelKey)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: 'block' }}>
                    <span style={labelStyle}>{t('report.details')}</span>
                    <textarea
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      placeholder={t('report.detailsPlaceholder')}
                      rows={3}
                      maxLength={1000}
                      style={{ ...inputStyle, minHeight: 84, resize: 'vertical', lineHeight: 1.5 }}
                    />
                  </label>

                  {error && (
                    <div
                      style={{
                        marginTop: 16,
                        padding: '11px 14px',
                        borderRadius: 12,
                        background: 'rgba(91,15,22,0.08)',
                        border: '1px solid rgba(91,15,22,0.2)',
                        fontSize: 14,
                        color: COLORS.burgundy,
                        fontWeight: 600,
                      }}
                    >
                      {error}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                    <button
                      type="button"
                      onClick={close}
                      className="qk-press"
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: 14,
                        border: `1px solid ${COLORS.tan}`,
                        background: '#fff',
                        color: COLORS.ink,
                        fontWeight: 700,
                        fontSize: 14.5,
                        fontFamily: FONT,
                        cursor: 'pointer',
                      }}
                    >
                      {t('report.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={!reason || phase === 'submitting'}
                      className={!reason || phase === 'submitting' ? undefined : 'qk-press'}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: 14,
                        border: 'none',
                        background: !reason || phase === 'submitting' ? 'rgba(91,15,22,0.45)' : GRAD_BURGUNDY,
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 14.5,
                        fontFamily: FONT,
                        cursor: !reason || phase === 'submitting' ? 'not-allowed' : 'pointer',
                        boxShadow: !reason || phase === 'submitting' ? 'none' : '0 10px 24px rgba(91,15,22,0.28)',
                      }}
                    >
                      {phase === 'submitting' ? t('report.submitting') : t('report.submit')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

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
