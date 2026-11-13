'use client'

// "Payment information" on /account — the host's payout method.
//
// Two states in one card: a PREVIEW of what is saved (so the host can confirm
// it went in correctly, which is the whole point of the section) and the FORM
// that adds or replaces it. A host with nothing saved lands straight on the
// form; a host with a method saved sees the preview and opts into editing.
//
// Every field is read back in full, including the IBAN and the account number:
// these are the payout destination, they are meant to be handed out, and a
// masked IBAN is one a host cannot check. See lib/local/payout-method-core.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  PAYOUT_METHODS,
  formatIban,
  isRetiredPayoutMethod,
  type ChoosablePayoutMethod,
  type PayoutMethod,
  type PayoutMethodView,
} from '@/lib/local/payout-method-core'

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

const ghostButtonStyle: React.CSSProperties = {
  display: 'inline-block',
  color: C.burgundy,
  background: 'transparent',
  border: '1px solid rgba(91,15,22,0.30)',
  fontWeight: 700,
  fontSize: 14,
  fontFamily: 'inherit',
  padding: '10px 22px',
  borderRadius: 999,
  cursor: 'pointer',
}

function Notice({ kind, text }: { kind: 'ok' | 'error'; text: string }) {
  const ok = kind === 'ok'
  return (
    <p
      role={ok ? 'status' : 'alert'}
      style={{ margin: '14px 0 0', fontSize: 13.5, fontWeight: 600, color: ok ? '#177245' : '#b3261e' }}
    >
      {text}
    </p>
  )
}

/** The choosable destinations, as the boutique pill toggle used elsewhere on the site. */
function MethodPicker({
  value,
  onChange,
  label,
  labelFor,
}: {
  value: ChoosablePayoutMethod
  onChange: (m: ChoosablePayoutMethod) => void
  label: string
  labelFor: (m: PayoutMethod) => string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{
        display: 'inline-flex',
        background: C.tan,
        borderRadius: 999,
        padding: 4,
        gap: 4,
        marginBottom: 20,
        maxWidth: '100%',
        flexWrap: 'wrap',
      }}
    >
      {PAYOUT_METHODS.map((m) => {
        const active = value === m.key
        return (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m.key)}
            style={{
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 700,
              padding: '9px 20px',
              borderRadius: 999,
              background: active ? '#fff' : 'transparent',
              color: active ? C.burgundy : C.muted,
              boxShadow: active ? '0 2px 8px rgba(42,34,32,0.10)' : 'none',
            }}
          >
            {labelFor(m.key)}
          </button>
        )
      })}
    </div>
  )
}

/** One saved fact, e.g. "Name on the account — Kareem El Adl". */
function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderTop: '1px solid rgba(42,34,32,0.07)' }}>
      <span style={{ fontSize: 13.5, color: C.muted, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 14.5, color: C.ink, fontWeight: 700, textAlign: 'end', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

/** What the payout form holds — the same body PUT /api/local/host/payout-method
 *  and POST /api/local/host/apply (`payout`) take. */
export interface PayoutDraft {
  method: ChoosablePayoutMethod
  account_name: string
  bank_name: string
  iban: string
  account_number: string
  swift_bic: string
  branch: string
  instapay_address: string
}

/** A form seeded from what is saved (or empty). A retired method (a wallet saved
 *  before it was withdrawn) can't be picked again, so editing one starts the
 *  host on a bank account instead. */
export function draftFromView(v: PayoutMethodView | null): PayoutDraft {
  const isBank = v?.method === 'bank_account'
  return {
    method: v && !isRetiredPayoutMethod(v.method) ? (v.method as ChoosablePayoutMethod) : 'bank_account',
    account_name: v?.account_name ?? '',
    bank_name: isBank ? v.bank_name : '',
    iban: isBank ? formatIban(v.iban) : '',
    account_number: isBank ? v.account_number : '',
    swift_bic: isBank ? v.swift_bic : '',
    branch: isBank ? v.branch : '',
    instapay_address: v?.method === 'instapay' ? v.account_ref : '',
  }
}

/** The saved method, read back in full. Shared by /account and the host application. */
export function PayoutSummary({ saved }: { saved: PayoutMethodView }) {
  const t = useTranslations('payoutMethod')
  return (
    <div
      style={{
        background: C.cream,
        borderRadius: 16,
        border: '1px solid rgba(42,34,32,0.08)',
        padding: '18px 20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.burgundy }}>
          {t(`methods.${saved.method}`)}
        </span>
        <span
          style={{
            display: 'inline-block',
            background: '#e7f5ec',
            color: '#177245',
            fontSize: 12,
            fontWeight: 700,
            padding: '4px 12px',
            borderRadius: 999,
          }}
        >
          {t('badgeAdded')}
        </span>
      </div>

      <div style={{ margin: '10px 0 14px', fontSize: 20, fontWeight: 700, color: C.ink, wordBreak: 'break-word' }}>
        {saved.display}
      </div>

      <PreviewRow label={t('fields.accountName')} value={saved.account_name} />
      {saved.method === 'bank_account' && saved.bank_name && (
        <PreviewRow label={t('fields.bank')} value={saved.bank_name} />
      )}
      {saved.method === 'bank_account' && saved.iban_formatted && (
        <PreviewRow label={t('fields.iban')} value={saved.iban_formatted} />
      )}
      {saved.method === 'bank_account' && saved.account_number && (
        <PreviewRow label={t('fields.accountNumber')} value={saved.account_number} />
      )}
      {saved.method === 'bank_account' && saved.swift_bic && (
        <PreviewRow label={t('fields.swift')} value={saved.swift_bic} />
      )}
      {saved.method === 'bank_account' && saved.branch && (
        <PreviewRow label={t('fields.branch')} value={saved.branch} />
      )}
      {saved.updated_at && (
        <PreviewRow
          label={t('fields.updated')}
          value={new Date(saved.updated_at).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        />
      )}
    </div>
  )
}

/** The method picker + that method's inputs, controlled. No <form> of its own,
 *  so it can sit inside another form (the host application). */
export function PayoutFields({
  value,
  onChange,
}: {
  value: PayoutDraft
  onChange: (next: PayoutDraft) => void
}) {
  const t = useTranslations('payoutMethod')
  const set = (k: keyof PayoutDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value })
  return (
    <>
      <MethodPicker
        value={value.method}
        onChange={(m) => onChange({ ...value, method: m })}
        label={t('chooseMethod')}
        labelFor={(m: PayoutMethod) => t(`methods.${m}`)}
      />

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="payout-name" style={labelStyle}>
          {t('fields.accountName')}
        </label>
        <input
          id="payout-name"
          type="text"
          value={value.account_name}
          onChange={set('account_name')}
          placeholder={t('placeholders.accountName')}
          autoComplete="name"
          style={inputStyle}
        />
      </div>

      {value.method === 'bank_account' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="payout-bank" style={labelStyle}>
              {t('fields.bank')}
            </label>
            <input
              id="payout-bank"
              type="text"
              value={value.bank_name}
              onChange={set('bank_name')}
              placeholder={t('placeholders.bank')}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="payout-iban" style={labelStyle}>
              {t('fields.iban')}
            </label>
            <input
              id="payout-iban"
              type="text"
              value={value.iban}
              onChange={set('iban')}
              placeholder={t('placeholders.iban')}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              style={inputStyle}
            />
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
              {t('bankHint')}
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="payout-account-number" style={labelStyle}>
              {t('fields.accountNumber')}
            </label>
            <input
              id="payout-account-number"
              type="text"
              value={value.account_number}
              onChange={set('account_number')}
              placeholder={t('placeholders.accountNumber')}
              inputMode="numeric"
              autoCorrect="off"
              spellCheck={false}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ flex: '1 1 160px' }}>
              <label htmlFor="payout-swift" style={labelStyle}>
                {t('fields.swiftOptional')}
              </label>
              <input
                id="payout-swift"
                type="text"
                value={value.swift_bic}
                onChange={set('swift_bic')}
                placeholder={t('placeholders.swift')}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <label htmlFor="payout-branch" style={labelStyle}>
                {t('fields.branchOptional')}
              </label>
              <input
                id="payout-branch"
                type="text"
                value={value.branch}
                onChange={set('branch')}
                placeholder={t('placeholders.branch')}
                style={inputStyle}
              />
            </div>
          </div>
        </>
      )}

      {value.method === 'instapay' && (
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="payout-instapay" style={labelStyle}>
            {t('fields.instapayAddress')}
          </label>
          <input
            id="payout-instapay"
            type="text"
            value={value.instapay_address}
            onChange={set('instapay_address')}
            placeholder={t('placeholders.instapayAddress')}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={inputStyle}
          />
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
            {t('instapayHint')}
          </p>
        </div>
      )}
    </>
  )
}

export function PayoutMethodCard({ initial }: { initial: PayoutMethodView | null }) {
  const router = useRouter()
  const t = useTranslations('payoutMethod')

  const [saved, setSaved] = useState<PayoutMethodView | null>(initial)
  // A host with nothing saved has nothing to preview, so open on the form.
  const [editing, setEditing] = useState(initial === null)
  const [draft, setDraft] = useState<PayoutDraft>(() => draftFromView(initial))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/local/host/payout-method', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(draft),
      })
      if (res.status === 401) {
        router.push('/login')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('error'))
      const next: PayoutMethodView | null = data.payout_method ?? null
      setSaved(next)
      // Show the stored, normalised values rather than whatever was typed — an
      // IBAN entered without spaces should read back grouped.
      if (next?.method === 'bank_account') setDraft((d) => ({ ...d, iban: next.iban_formatted }))
      setEditing(false)
      setMsg({ kind: 'ok', text: t('saved') })
      router.refresh()
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : t('error') })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(t('removeConfirm'))) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/local/host/payout-method', {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (res.status === 401) {
        router.push('/login')
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || t('error'))
      }
      setSaved(null)
      setEditing(true)
      setMsg({ kind: 'ok', text: t('removed') })
      router.refresh()
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : t('error') })
    } finally {
      setBusy(false)
    }
  }

  const heading = (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: C.ink }}>{t('title')}</h2>
      <p style={{ margin: 0, fontSize: 14, color: C.muted, lineHeight: 1.55 }}>
        {saved ? t('subtitleSet') : t('subtitleEmpty')}
      </p>
    </div>
  )

  // ---- Preview: what is on file, so the host can confirm it landed ---------
  if (saved && !editing) {
    return (
      <section style={cardStyle}>
        {heading}

        <PayoutSummary saved={saved} />

        {isRetiredPayoutMethod(saved.method) && <Notice kind="error" text={t('retiredNotice')} />}

        <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setEditing(true)} style={buttonStyle(false)}>
            {t('change')}
          </button>
          <button type="button" onClick={remove} disabled={busy} style={{ ...ghostButtonStyle, opacity: busy ? 0.6 : 1 }}>
            {busy ? t('removing') : t('remove')}
          </button>
        </div>

        {msg && <Notice kind={msg.kind} text={msg.text} />}
      </section>
    )
  }

  // ---- Form: add or replace ------------------------------------------------
  return (
    <form style={cardStyle} onSubmit={save}>
      {heading}

      <PayoutFields value={draft} onChange={setDraft} />

      <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="submit" disabled={busy} style={buttonStyle(busy)}>
          {busy ? t('saving') : saved ? t('update') : t('save')}
        </button>
        {saved && (
          <button
            type="button"
            onClick={() => {
              setEditing(false)
              setMsg(null)
            }}
            style={ghostButtonStyle}
          >
            {t('cancel')}
          </button>
        )}
      </div>

      {msg && <Notice kind={msg.kind} text={msg.text} />}
    </form>
  )
}
