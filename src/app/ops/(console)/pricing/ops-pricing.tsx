'use client'

// Pricing ops (World 1) — the platform commission.
//
// One setting: the percentage added on top of every host's raw price to produce
// the price a guest sees and pays. GET/PUT /api/local/admin/settings/commission,
// cookie-authed (same-origin) and gated on the 'pricing' module server-side.
//
// `initial` is server-rendered by page.tsx and passed in, rather than fetched in
// an effect — several /ops screens have had client fetches that never populate,
// and the initial-prop pattern (see /ops/staff) is what reliably works here.
// Strings are hardcoded English, like the rest of /ops.
import { useMemo, useState } from 'react'
import {
  MAX_COMMISSION_PERCENT,
  MIN_COMMISSION_PERCENT,
  ROUNDING_STEP,
  withCommission,
} from '@/lib/local/commission-core'

const C = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 20,
  border: '1px solid rgba(42,34,32,0.06)',
  boxShadow: '0 6px 24px rgba(42,34,32,0.07)',
  padding: '20px 22px',
}

const primaryBtn: React.CSSProperties = {
  background: C.burgundy,
  color: '#fff',
  border: 'none',
  borderRadius: 999,
  padding: '9px 22px',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 12,
  border: `1px solid ${C.tan}`,
  fontSize: 15,
  fontFamily: 'inherit',
  color: C.ink,
  background: '#fff',
}

export interface CommissionView {
  rate: number
  percent: number
  updated_at: string | null
  updated_by: string | null
  impact: { listings: number; services: number }
}

const egp = (n: number) => `EGP ${Math.round(n).toLocaleString('en-US')}`

/** The prices an operator can sanity-check the rate against before saving. */
const SAMPLES = [1000, 2500, 5000]

export function OpsPricing({ initial }: { initial: CommissionView }) {
  const [saved, setSaved] = useState<CommissionView>(initial)
  const [percent, setPercent] = useState(String(initial.percent))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  // Preview the typed value, not the saved one — the operator needs to see what
  // they are about to do before they commit to repricing the whole catalogue.
  const typed = Number(percent)
  const previewValid = Number.isFinite(typed) && typed >= MIN_COMMISSION_PERCENT && typed <= MAX_COMMISSION_PERCENT
  const preview = useMemo(
    () => (previewValid ? SAMPLES.map((raw) => ({ raw, guest: withCommission(raw, typed / 100) ?? raw })) : []),
    [typed, previewValid]
  )
  const dirty = previewValid && typed !== saved.percent

  async function save() {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const res = await fetch('/api/local/admin/settings/commission', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percent }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Could not save the commission rate')
        return
      }
      setSaved(data as CommissionView)
      setPercent(String((data as CommissionView).percent))
      setNote('Saved — every listing and service is now priced at this rate.')
    } catch {
      setError('Could not reach the server')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section style={card}>
        <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: C.ink }}>
          Platform commission
        </h2>
        <p style={{ margin: '0 0 18px', fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
          Hosts enter the price they want to receive. Guests are quoted that price plus this
          percentage, rounded up to the nearest {ROUNDING_STEP} EGP. The commission is never
          shown to guests as a separate line — they see one inclusive price.
        </p>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 6 }}>
          Commission rate (%)
        </label>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 160 }}>
            <input
              type="number"
              inputMode="decimal"
              min={MIN_COMMISSION_PERCENT}
              max={MAX_COMMISSION_PERCENT}
              step="0.01"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              style={{ ...inputStyle, paddingRight: 30 }}
              aria-label="Commission rate percentage"
            />
            <span
              style={{ position: 'absolute', right: 12, top: 11, fontSize: 15, color: C.muted, pointerEvents: 'none' }}
            >
              %
            </span>
          </div>
          <button type="button" onClick={save} disabled={busy || !dirty} style={{ ...primaryBtn, opacity: busy || !dirty ? 0.5 : 1 }}>
            {busy ? 'Saving…' : 'Save rate'}
          </button>
          {dirty ? (
            <span style={{ fontSize: 13, color: C.muted }}>
              Currently live: {saved.percent}%
            </span>
          ) : null}
        </div>

        {!previewValid && percent.trim() !== '' ? (
          <p style={{ margin: '10px 0 0', fontSize: 13.5, color: '#b3261e' }}>
            Enter a number between {MIN_COMMISSION_PERCENT} and {MAX_COMMISSION_PERCENT}.
          </p>
        ) : null}
        {error ? <p style={{ margin: '10px 0 0', fontSize: 13.5, color: '#b3261e' }}>{error}</p> : null}
        {note ? <p style={{ margin: '10px 0 0', fontSize: 13.5, color: '#1e7a3c' }}>{note}</p> : null}

        <p style={{ margin: '16px 0 0', fontSize: 12.5, color: C.muted }}>
          {saved.updated_at
            ? `Last changed ${saved.updated_at.slice(0, 10)}${saved.updated_by ? ` by ${saved.updated_by}` : ''}.`
            : 'Never changed — running on the default rate.'}
        </p>
      </section>

      {preview.length > 0 ? (
        <section style={card}>
          <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: C.ink }}>
            What guests would see at {typed}%
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: 14, color: C.muted }}>
            Per night, before any length-of-stay discount.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {preview.map(({ raw, guest }) => (
              <div
                key={raw}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: C.cream,
                  fontSize: 14.5,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ color: C.muted }}>Host sets {egp(raw)}</span>
                <span style={{ fontWeight: 800, color: C.burgundy }}>
                  Guest pays {egp(guest)}
                  <span style={{ fontWeight: 500, color: C.muted, marginLeft: 8 }}>
                    (+{egp(guest - raw)})
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section style={{ ...card, background: '#FFF8E9', border: '1px solid rgba(180,130,20,0.25)' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 800, color: C.ink }}>
          Before you change this
        </h2>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: C.muted, lineHeight: 1.75 }}>
          <li>
            It reprices <strong>{saved.impact.listings.toLocaleString('en-US')} published listing
            {saved.impact.listings === 1 ? '' : 's'}</strong>
            {saved.impact.services > 0 ? (
              <> and <strong>{saved.impact.services.toLocaleString('en-US')} service
              {saved.impact.services === 1 ? '' : 's'}</strong></>
            ) : null}{' '}
            the moment you save — on the website and in both mobile apps.
          </li>
          <li>
            Existing reservations are <strong>not</strong> affected. Each one keeps the rate it was
            booked at, so a guest is never re-quoted after the fact.
          </li>
          <li>Hosts keep their full price either way — the commission is added on top, never deducted.</li>
          <li>Every change is written to the audit log with the old and new value.</li>
        </ul>
      </section>
    </div>
  )
}
