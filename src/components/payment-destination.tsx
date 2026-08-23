'use client'

// Guest-facing payment destinations: the Instapay number/QR/link and the bank
// account an admin set in /ops/payments, read from GET /api/local/payment-config
// (World 1 — Neon, no Supabase).
//
// Which methods appear is the server's decision, not this component's: it renders
// a picker from `available_methods`, which the API derives from enabled AND
// configured. Hardcoding the list here is what would make an admin's toggle stop
// meaning anything.
//
// The picker only appears when there is a real choice. One method renders bare —
// a segmented control with a single segment is a decision the guest doesn't have.
//
// `onMethodChange` reports the selection up so the caller can post it as the
// proof's `method`, which is how the reviewer in /ops knows which account the
// money should have landed in. The read-only mount on /reservations omits it.
//
// Fetched lazily by the caller (mount it only once it is visible) because an
// uploaded QR travels inline as a base64 data URL.
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { QRCodeSVG } from 'qrcode.react'
import { ShimmerStyles, SkeletonBlock } from '@/components/ui/skeleton-block'
import type { PaymentConfig, PaymentMethod } from '@/lib/local/payment-config-core'

const C = { burgundy: '#5B0F16', cream: '#F6F1E6', tan: '#EFE6D8', ink: '#2A2220', muted: '#6B6055' }

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export function PaymentDestination({
  onMethodChange,
}: {
  onMethodChange?: (method: PaymentMethod | null) => void
}) {
  const t = useTranslations('instapay')
  const tm = useTranslations('payMethods')
  const [cfg, setCfg] = useState<PaymentConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

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

  const methods = cfg?.available_methods ?? []
  // What the picker highlights and what the caller is told, derived rather than
  // stored: until one is tapped there is no selection, and the default is simply
  // the first method offered. Deriving it means "the admin switched Instapay off"
  // needs no special case — the bank just becomes first.
  const active: PaymentMethod | null =
    method && methods.includes(method) ? method : (methods[0] ?? null)

  // Report the shown selection to the caller, including the initial default.
  useEffect(() => {
    onMethodChange?.(active)
    // onMethodChange is typically an inline arrow, so depending on it would fire
    // this on every parent render. The selection is the only thing that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  async function copy(value: string, key: string) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1600)
    } catch {
      // Clipboard blocked (insecure origin / permissions) — the value is
      // selectable on screen, so this is not worth surfacing as an error.
    }
  }

  function CopyButton({ value, name }: { value: string; name: string }) {
    const done = copiedKey === name
    return (
      <button
        type="button"
        onClick={() => copy(value, name)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: done ? '#177245' : C.burgundy,
          fontWeight: 700,
          fontSize: 13,
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        {done ? t('copied') : t('copy')}
      </button>
    )
  }

  /**
   * One "label / value / Copy" line — the shape of every bank field.
   *
   * `copyValue` exists for the IBAN: it is displayed in groups of four because
   * that is how a bank prints one, but a banking app's form wants it unspaced.
   */
  function Field({
    label,
    value,
    copyName,
    copyValue,
  }: {
    label: string
    value: string
    copyName?: string
    copyValue?: string
  }) {
    if (!value) return null
    return (
      <div style={{ marginTop: 10 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.muted }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: copyName ? 15 : 14.5,
              fontWeight: 700,
              color: C.ink,
              wordBreak: 'break-all',
              fontFamily: copyName ? MONO : 'inherit',
            }}
          >
            {value}
          </span>
          {copyName && <CopyButton value={copyValue ?? value} name={copyName} />}
        </div>
      </div>
    )
  }

  if (error) return <p style={{ margin: 0, fontSize: 13.5, color: '#b3261e' }}>{error}</p>

  // A guest reaches this holding their phone, mid-transfer. A line of text where
  // the QR belongs reads as "there is nothing to pay to"; the shape reads as "the
  // QR is coming". Matches the panel below: QR square, then handle and instructions.
  if (!cfg) {
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
        <ShimmerStyles />
        <SkeletonBlock width={132} height={132} radius={12} style={{ flex: '0 0 auto' }} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <SkeletonBlock width={96} height={10} radius={4} />
          <SkeletonBlock width="72%" height={19} radius={8} style={{ marginTop: 9 }} />
          <SkeletonBlock width="90%" height={12} style={{ marginTop: 16 }} />
          <SkeletonBlock width="64%" height={12} style={{ marginTop: 7 }} />
        </div>
      </div>
    )
  }

  if (methods.length === 0) {
    return <p style={{ margin: 0, fontSize: 13.5, color: C.muted }}>{t('notConfigured')}</p>
  }

  return (
    <div>
      {methods.length > 1 && (
        <div role="radiogroup" aria-label={tm('choose')} style={{ marginBottom: 14 }}>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.muted, marginBottom: 7 }}>
            {tm('choose')}
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {methods.map((m) => {
              const on = m === active
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMethod(m)}
                  style={{
                    borderRadius: 999,
                    padding: '9px 18px',
                    fontSize: 13.5,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    background: on ? C.burgundy : '#fff',
                    color: on ? '#fff' : C.ink,
                    border: `1px solid ${on ? C.burgundy : C.tan}`,
                  }}
                >
                  {tm(m === 'instapay' ? 'instapay' : 'bankTransfer')}
                </button>
              )
            })}
          </div>
        </div>
      )}

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
        {active === 'instapay' ? (
          <>
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
                        fontFamily: MONO,
                      }}
                    >
                      {cfg.instapay_handle}
                    </code>
                    <CopyButton value={cfg.instapay_handle} name="handle" />
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
                <p style={{ margin: '12px 0 0', fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                  {cfg.instructions}
                </p>
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.muted }}>{t('sendTo')}</span>
            <Field label={tm('bankName')} value={cfg.bank.bank_name} />
            <Field label={tm('accountName')} value={cfg.bank.account_name} />
            <Field label={tm('accountNumber')} value={cfg.bank.account_number} copyName="account" />
            <Field
              label={tm('iban')}
              value={cfg.bank.iban_formatted}
              copyName="iban"
              copyValue={cfg.bank.iban}
            />
            {cfg.bank.instructions.trim() && (
              <p style={{ margin: '14px 0 0', fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                {cfg.bank.instructions}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
