'use client'

// Guest-facing Instapay destination: the number, QR code and link an admin set
// in /ops/payments, read from GET /api/local/payment-config (World 1 — Neon,
// no Supabase). The QR is whatever the admin uploaded; when they never uploaded
// one we draw it client-side from qr_payload, so a guest always has something to
// scan. Fetched lazily by the caller (mount it only once it is visible) because
// an uploaded QR travels inline as a base64 data URL.
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { QRCodeSVG } from 'qrcode.react'
import { isPaymentConfigured } from '@/lib/local/payment-config-core'
import type { PaymentConfig } from '@/lib/local/payment-config-core'

const C = { burgundy: '#5B0F16', cream: '#F6F1E6', tan: '#EFE6D8', ink: '#2A2220', muted: '#6B6055' }

export function InstapayDetails() {
  const t = useTranslations('instapay')
  const [cfg, setCfg] = useState<PaymentConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/local/payment-config', { credentials: 'same-origin' })
        if (!res.ok) throw new Error('failed')
        const data = (await res.json()) as PaymentConfig
        if (alive) setCfg(data)
      } catch {
        if (alive) setError(t('loadFailed'))
      }
    })()
    return () => {
      alive = false
    }
  }, [t])

  async function copyHandle() {
    if (!cfg?.instapay_handle) return
    try {
      await navigator.clipboard.writeText(cfg.instapay_handle)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard blocked (insecure origin / permissions) — the value is
      // selectable on screen, so this is not worth surfacing as an error.
    }
  }

  if (error) return <p style={{ margin: 0, fontSize: 13.5, color: '#b3261e' }}>{error}</p>
  if (!cfg) return <p style={{ margin: 0, fontSize: 13.5, color: C.muted }}>{t('loading')}</p>
  if (!isPaymentConfigured(cfg)) {
    return <p style={{ margin: 0, fontSize: 13.5, color: C.muted }}>{t('notConfigured')}</p>
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 18,
        padding: 16,
        borderRadius: 16,
        border: `1px solid ${C.tan}`,
        background: C.cream,
      }}
    >
      {(cfg.instapay_qr_image || cfg.qr_payload) && (
        <div style={{ flexShrink: 0, textAlign: 'center' }}>
          <div
            style={{
              width: 152,
              height: 152,
              borderRadius: 14,
              background: '#fff',
              border: `1px solid ${C.tan}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 8,
              boxSizing: 'border-box',
            }}
          >
            {cfg.instapay_qr_image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={cfg.instapay_qr_image}
                alt={t('title')}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
              />
            ) : (
              <QRCodeSVG value={cfg.qr_payload} size={132} level="M" marginSize={1} title={t('title')} />
            )}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: C.muted, maxWidth: 152 }}>{t('scanHint')}</p>
        </div>
      )}

      <div style={{ flex: '1 1 220px', minWidth: 200 }}>
        {cfg.instapay_handle && (
          <>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.muted }}>{t('sendTo')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
              <code
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: C.ink,
                  wordBreak: 'break-all',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              >
                {cfg.instapay_handle}
              </code>
              <button
                type="button"
                onClick={copyHandle}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: copied ? '#177245' : C.burgundy,
                  fontWeight: 700,
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
              >
                {copied ? t('copied') : t('copy')}
              </button>
            </div>
          </>
        )}

        {cfg.instapay_link && (
          <a
            href={cfg.instapay_link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              marginTop: 12,
              background: C.burgundy,
              color: '#fff',
              borderRadius: 999,
              padding: '8px 18px',
              fontWeight: 700,
              fontSize: 13.5,
              textDecoration: 'none',
            }}
          >
            {t('openInstapay')}
          </a>
        )}

        {cfg.instructions.trim() && (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{cfg.instructions}</p>
        )}
      </div>
    </div>
  )
}
