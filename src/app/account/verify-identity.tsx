'use client'

// "Verify your identity" card for the account page.
//
// States (driven by GET /api/local/verification → { status }):
//   • verified  → a green "Verified ✓" confirmation; no uploader.
//   • pending   → a neutral "Under review" note; no uploader.
//   • unverified / rejected → an uploader: pick an ID photo (downscaled to a
//     ~1024px JPEG data URL via the shared lib/image helper) → preview →
//     POST /api/local/verification { doc } → flips to "pending".
//
// The card seeds its initial status from `initialStatus` (the account page
// already loads the profile, which carries verification_status) to avoid a
// flash, then refreshes from the dedicated endpoint on mount. Localized +
// RTL-safe.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getToken,
  getVerification,
  submitVerification,
  type VerificationStatus,
} from '@/lib/api'
import { downscaleToDataUrl } from '@/lib/image'
import { useLanguage } from '@/lib/i18n/language-provider'

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  gold: '#B07A2A',
  green: '#0f5132',
}
const GRAD_BURGUNDY = 'linear-gradient(135deg,#5B0F16,#8a2530)'
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

// Status → { i18n label key, chip tone }. Mirrors the trust-badge palette.
const STATUS_META: Record<
  VerificationStatus,
  { labelKey: string; bg: string; fg: string }
> = {
  verified: { labelKey: 'trust.verified', bg: 'rgba(15,81,50,0.12)', fg: COLORS.green },
  pending: { labelKey: 'trust.pending', bg: 'rgba(176,122,42,0.16)', fg: COLORS.gold },
  rejected: { labelKey: 'trust.rejected', bg: 'rgba(91,15,22,0.10)', fg: COLORS.burgundy },
  unverified: { labelKey: 'trust.unverified', bg: COLORS.tan, fg: COLORS.muted },
}

function StatusChip({ status }: { status: VerificationStatus }) {
  const { t } = useLanguage()
  const meta = STATUS_META[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: meta.bg,
        color: meta.fg,
        fontSize: 12.5,
        fontWeight: 700,
        padding: '5px 12px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
      }}
    >
      {status === 'verified' && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
      {t(meta.labelKey)}
    </span>
  )
}

export default function VerifyIdentity({
  initialStatus,
}: {
  initialStatus?: VerificationStatus | null
}) {
  const { t } = useLanguage()
  const [status, setStatus] = useState<VerificationStatus>(
    initialStatus ?? 'unverified'
  )
  const [doc, setDoc] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Refresh the authoritative status from the dedicated endpoint on mount.
  const refresh = useCallback(async () => {
    const token = getToken()
    if (!token) return
    const state = await getVerification(token)
    setStatus(state.status)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setError(null)
    try {
      const dataUrl = await downscaleToDataUrl(file, 1024)
      setDoc(dataUrl)
    } catch {
      setError(t('trust.readError'))
    }
  }

  async function handleSubmit() {
    const token = getToken()
    if (!token || !doc) return
    setSubmitting(true)
    setError(null)
    try {
      const state = await submitVerification(token, doc)
      setStatus(state.status || 'pending')
      setDoc(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      // Backend returns 400 for missing/too-large — surface the size hint.
      setError(/large|size|400/i.test(msg) ? t('trust.tooLarge') : t('trust.submitError'))
    } finally {
      setSubmitting(false)
    }
  }

  // Whether the uploader is shown (unverified or rejected → can (re)submit).
  const canSubmit = status === 'unverified' || status === 'rejected'

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 4,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: COLORS.ink }}>
          {t('trust.verify')}
        </h2>
        <StatusChip status={status} />
      </div>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: COLORS.muted, lineHeight: 1.55 }}>
        {t('trust.verifyIntro')}
      </p>

      {/* Verified → confirmation only. */}
      {status === 'verified' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '13px 16px',
            borderRadius: 14,
            background: 'rgba(15,81,50,0.10)',
            border: '1px solid rgba(15,81,50,0.25)',
            color: COLORS.green,
            fontSize: 14.5,
            fontWeight: 600,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {t('trust.verifiedNote')}
        </div>
      )}

      {/* Pending → review note only. */}
      {status === 'pending' && (
        <div
          style={{
            padding: '13px 16px',
            borderRadius: 14,
            background: 'rgba(176,122,42,0.12)',
            border: '1px solid rgba(176,122,42,0.30)',
            color: COLORS.gold,
            fontSize: 14.5,
            fontWeight: 600,
            lineHeight: 1.5,
          }}
        >
          {t('trust.pendingNote')}
        </div>
      )}

      {/* Unverified / rejected → the uploader. */}
      {canSubmit && (
        <div>
          {status === 'rejected' && (
            <div
              style={{
                marginBottom: 18,
                padding: '12px 14px',
                borderRadius: 12,
                background: 'rgba(91,15,22,0.08)',
                border: '1px solid rgba(91,15,22,0.2)',
                fontSize: 14,
                color: COLORS.burgundy,
                fontWeight: 600,
                lineHeight: 1.5,
              }}
            >
              {t('trust.rejectedNote')}
            </div>
          )}

          {/* Hidden file input + preview. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePick}
            style={{ display: 'none' }}
          />

          {doc ? (
            <div style={{ marginBottom: 16 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: COLORS.muted, marginBottom: 8 }}>
                {t('trust.preview')}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={doc}
                alt={t('trust.preview')}
                style={{
                  display: 'block',
                  maxWidth: '100%',
                  width: 260,
                  borderRadius: 14,
                  border: `1px solid ${COLORS.tan}`,
                  boxShadow: '0 6px 18px rgba(42,34,32,0.12)',
                }}
              />
            </div>
          ) : null}

          {error && (
            <div
              style={{
                marginBottom: 16,
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

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="qk-press"
              style={{
                padding: '11px 20px',
                fontSize: 14.5,
                fontWeight: 700,
                fontFamily: FONT,
                color: COLORS.burgundy,
                background: '#fff',
                border: '1px solid rgba(91,15,22,0.3)',
                borderRadius: 14,
                cursor: 'pointer',
              }}
            >
              {doc ? t('trust.chooseAnother') : t('trust.uploadId')}
            </button>
            {doc && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className={submitting ? undefined : 'qk-press'}
                style={{
                  padding: '11px 24px',
                  fontSize: 14.5,
                  fontWeight: 700,
                  fontFamily: FONT,
                  color: '#fff',
                  background: submitting ? 'rgba(91,15,22,0.45)' : GRAD_BURGUNDY,
                  border: 'none',
                  borderRadius: 14,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  boxShadow: submitting ? 'none' : '0 10px 24px rgba(91,15,22,0.28)',
                }}
              >
                {submitting ? t('trust.submitting') : t('trust.submit')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
