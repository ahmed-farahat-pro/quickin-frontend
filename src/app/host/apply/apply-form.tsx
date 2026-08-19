'use client'

// Host application form: collects the details an admin needs to review, then
// POSTs to /api/local/host/apply. This does NOT grant host — on success it shows
// a calm "submitted, pending review" panel. Mirrors the boutique style + patterns
// of host/new/new-listing-form.tsx (inline styles, inline validation/errors).
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { fileToCompressedDataUrl } from '@/lib/image'
import {
  DOC_TYPES,
  needsIdentityDocuments,
  type DocType,
  type VerificationStatus,
} from '@/lib/local/host-verification-core'
import { MAX_PHONE_CHARS, filterPhoneInput, isValidPhone } from '@/lib/local/phone-core'
import { checkName } from '@/lib/local/name-policy'

const C = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 13.5,
  fontWeight: 700,
  color: C.ink,
  marginBottom: 6,
}

const input: React.CSSProperties = {
  width: '100%',
  fontFamily: 'inherit',
  fontSize: 14.5,
  padding: '11px 14px',
  border: `1px solid ${C.tan}`,
  borderRadius: 14,
  background: '#fff',
  color: C.ink,
  boxSizing: 'border-box',
}

const fieldWrap: React.CSSProperties = { marginBottom: 18 }

/** Inline message under a single field; renders nothing when the field is fine. */
function FieldError({ text }: { text?: string }) {
  if (!text) return null
  return (
    <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#b3261e', fontWeight: 600 }}>{text}</p>
  )
}

/** The applicant's existing identity verification, resolved on the server.
 *  Identity is verified once from the profile and serves guest and host alike,
 *  so an applicant who already has an approved (or under-review) submission is
 *  never asked for the same documents again. */
export interface ApplicantIdentity {
  status: VerificationStatus
  /** The number on the submission we hold, if any. */
  idNumber: string | null
  docType: string | null
  /** The reviewer's reason, present when the last submission was rejected. */
  notes: string | null
}

/** Previous answers, so a rejected applicant reapplies by editing, not retyping. */
export interface PreviousApplication {
  national_id: string
  phone: string
  address: string
  company: string
  notes: string
}

/** Server `fields` keys → localized messages; anything unmapped falls back to the
 *  server's own text. The client validates first, so this is the safety net. */
const FIELD_ERROR_KEYS: Record<string, string> = {
  // full_name is deliberately absent: a refused name is localized from its
  // policy code in the `namePolicy` namespace, not from a message per field.
  national_id: 'errors.nationalIdRequired',
  // A blank phone can't reach the server (the field is required and checked
  // first), so a server refusal here is always about the format.
  phone: 'errors.phoneInvalid',
  address: 'errors.addressRequired',
  host_type: 'errors.hostTypeInvalid',
}

export function ApplyForm({
  initialName,
  reapply = false,
  previous = null,
  identity,
}: {
  initialName: string
  reapply?: boolean
  previous?: PreviousApplication | null
  identity: ApplicantIdentity
}) {
  const router = useRouter()
  const t = useTranslations('hostApply')
  // Shared with signup: one set of name messages, keyed by the policy's codes.
  const tn = useTranslations('namePolicy')

  const [fullName, setFullName] = useState(initialName)
  const [hostType, setHostType] = useState<'individual' | 'company' | 'brokerage'>(
    previous?.company ? 'company' : 'individual'
  )
  // The number on a verified ID is the one an admin already approved, so it is
  // shown rather than asked for, and locked: an application that contradicts the
  // approved document would put the reviewer between two different numbers.
  // A pending submission is only seeded — nothing has been approved yet.
  const verifiedIdNumber = identity.status === 'verified' ? identity.idNumber?.trim() || '' : ''
  const nationalIdLocked = verifiedIdNumber !== ''
  const [nationalId, setNationalId] = useState(
    verifiedIdNumber || previous?.national_id || identity.idNumber?.trim() || ''
  )
  const [phone, setPhone] = useState(previous?.phone ?? '')
  const [address, setAddress] = useState(previous?.address ?? '')
  const [company, setCompany] = useState(previous?.company ?? '')
  const [notes, setNotes] = useState(previous?.notes ?? '')
  const isBusiness = hostType === 'company' || hostType === 'brokerage'

  // Whether this applicant has to upload documents at all. Same rule the server
  // applies in submitHostApplication, so the form can never ask for a photo the
  // API would ignore — nor omit one it would demand.
  const needsId = needsIdentityDocuments(identity.status)

  // ID photos (data URLs) — required so admins can verify the host, same as /verify-id.
  const [idFront, setIdFront] = useState<string | null>(null)
  const [idBack, setIdBack] = useState<string | null>(null)
  // Which document these photos are. The reviewer checks the images against it,
  // so it is submitted rather than inferred.
  const [docType, setDocType] = useState<DocType>('national_id')
  const frontInputRef = useRef<HTMLInputElement>(null)
  const backInputRef = useRef<HTMLInputElement>(null)

  async function onPickId(side: 'front' | 'back', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    try {
      const url = await fileToCompressedDataUrl(file)
      if (side === 'front') setIdFront(url)
      else setIdBack(url)
    } catch {
      setError(t('errors.idRequired'))
    }
  }

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    // Same required set as the API: everything but company + notes.
    const invalid: Record<string, string> = {}
    if (!fullName.trim()) invalid.full_name = t('errors.fullNameRequired')
    else {
      // An admin reads this name against the ID photos, so it has to be a name.
      // Same policy — and the same localized copy — as the one signup applies.
      const nameProblem = checkName(fullName)
      if (nameProblem) invalid.full_name = tn(`errors.${nameProblem.code}`)
    }
    if (!nationalId.trim()) invalid.national_id = t('errors.nationalIdRequired')
    if (!phone.trim()) invalid.phone = t('errors.phoneRequired')
    // Typing already keeps letters out; this catches what is still not a number —
    // too few digits, or a field holding nothing but separators.
    else if (!isValidPhone(phone)) invalid.phone = t('errors.phoneInvalid')
    if (!address.trim()) invalid.address = t('errors.addressRequired')
    if (Object.keys(invalid).length) {
      setFieldErrors(invalid)
      setError(t('errors.checkFields'))
      return
    }
    if (needsId && (!idFront || !idBack)) {
      setError(t('errors.idRequired'))
      return
    }

    setBusy(true)
    try {
      const res = await fetch('/api/local/host/apply', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          host_type: hostType,
          national_id: nationalId.trim(),
          phone: phone.trim(),
          address: address.trim(),
          company: isBusiness ? company.trim() || undefined : undefined,
          notes: notes.trim() || undefined,
          // Identity documents ride WITH the application. They used to be a second
          // request made after it was accepted, so a failure there (a 413 from an
          // oversized photo, most often) left an application on file with no ID
          // attached and nothing linking the two. One admin decision now approves
          // both, and one failure fails the whole submission.
          //
          // Omitted entirely when the applicant is already verified or under
          // review: the server links their existing submission to this
          // application instead of taking a second copy of the same ID.
          ...(needsId ? { doc_type: docType, id_front: idFront, id_back: idBack } : {}),
        }),
      })
      if (res.status === 401) {
        router.push('/login')
        return
      }
      // 409 = already a host, or an application is already under review. The page
      // is server-rendered from host_status, so refresh it into the right state.
      if (res.status === 409) {
        setBusy(false)
        setError(t('errors.conflict'))
        router.refresh()
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        // 400 with per-field messages → surface them inline, next to each input.
        if (err.fields && typeof err.fields === 'object') {
          const mapped: Record<string, string> = {}
          for (const [name, msg] of Object.entries(err.fields as Record<string, string>)) {
            mapped[name] = FIELD_ERROR_KEYS[name] ? t(FIELD_ERROR_KEYS[name]) : String(msg)
          }
          // The name is localized from its policy code: the API echoes one when
          // it has it, and otherwise the same rule run here says what it was.
          if (mapped.full_name) {
            const code = err.nameProblem?.code ?? checkName(fullName)?.code
            if (code) mapped.full_name = tn(`errors.${code}`)
          }
          setFieldErrors(mapped)
          throw new Error(t('errors.checkFields'))
        }
        throw new Error(err.error || t('errors.submitFailed'))
      }

      setSubmitted(true)
      router.refresh()
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : t('errors.submitFailed'))
    }
  }

  if (submitted) {
    return (
      <div
        style={{
          background: '#fff',
          borderRadius: 22,
          border: `1px solid rgba(42,34,32,0.06)`,
          boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
          padding: '32px 28px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            background: '#e7f5ec',
            color: '#177245',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            fontWeight: 800,
            margin: '0 auto 16px',
          }}
          aria-hidden="true"
        >
          ✓
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: C.ink }}>
          {t('success.title')}
        </h2>
        <p style={{ margin: '0 auto 22px', fontSize: 14.5, color: C.muted, lineHeight: 1.6, maxWidth: 420 }}>
          {t('success.body')}
        </p>
        <a
          href="/account"
          style={{
            display: 'inline-block',
            color: '#fff',
            background: C.burgundy,
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: 14.5,
            padding: '12px 28px',
            borderRadius: 999,
          }}
        >
          {t('success.backToAccount')}
        </a>
      </div>
    )
  }

  return (
    <form
      onSubmit={submit}
      style={{
        background: '#fff',
        borderRadius: 24,
        border: `1px solid rgba(42,34,32,0.06)`,
        boxShadow: '0 6px 24px rgba(42,34,32,0.07)',
        padding: '28px 26px',
      }}
    >
      <div style={fieldWrap}>
        <label style={label}>{t('fields.hostType')}</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['individual', 'company', 'brokerage'] as const).map((ht) => {
            const on = hostType === ht
            return (
              <button
                key={ht}
                type="button"
                onClick={() => setHostType(ht)}
                aria-pressed={on}
                style={{
                  padding: '9px 16px',
                  borderRadius: 999,
                  fontSize: 13.5,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  border: `1px solid ${on ? C.burgundy : 'rgba(42,34,32,0.16)'}`,
                  background: on ? C.burgundy : '#fff',
                  color: on ? '#fff' : C.ink,
                }}
              >
                {t(`hostTypes.${ht}`)}
              </button>
            )
          })}
        </div>
        <FieldError text={fieldErrors.host_type} />
      </div>

      <div style={fieldWrap}>
        <label style={label} htmlFor="apply-name">
          {t('fields.fullName')} <span style={{ color: C.burgundy }}>*</span>
        </label>
        <input
          id="apply-name"
          style={input}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={t('placeholders.fullName')}
          autoComplete="name"
          required
        />
        <FieldError text={fieldErrors.full_name} />
      </div>

      <div style={fieldWrap}>
        <label style={label} htmlFor="apply-national-id">
          {t('fields.nationalId')} <span style={{ color: C.burgundy }}>*</span>
        </label>
        <input
          id="apply-national-id"
          style={nationalIdLocked ? { ...input, background: C.cream, color: C.muted } : input}
          value={nationalId}
          onChange={(e) => setNationalId(e.target.value)}
          placeholder={t('placeholders.nationalId')}
          // readOnly, not disabled: the value still has to reach the request,
          // and a disabled field is skipped by assistive technology.
          readOnly={nationalIdLocked}
          aria-readonly={nationalIdLocked || undefined}
          required
        />
        {nationalIdLocked && (
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
            {t('identity.nationalIdLocked')}
          </p>
        )}
        <FieldError text={fieldErrors.national_id} />
      </div>

      <div style={fieldWrap}>
        <label style={label} htmlFor="apply-phone">
          {t('fields.phone')} <span style={{ color: C.burgundy }}>*</span>
        </label>
        <input
          id="apply-phone"
          style={input}
          type="tel"
          inputMode="tel"
          maxLength={MAX_PHONE_CHARS}
          value={phone}
          // Letters are dropped as they are typed rather than reported on submit:
          // `type="tel"` is a keyboard hint, not a filter, so a browser will
          // happily hold a word in it.
          onChange={(e) => setPhone(filterPhoneInput(e.target.value))}
          placeholder={t('placeholders.phone')}
          autoComplete="tel"
          required
        />
        <FieldError text={fieldErrors.phone} />
      </div>

      <div style={fieldWrap}>
        <label style={label} htmlFor="apply-address">
          {t('fields.address')} <span style={{ color: C.burgundy }}>*</span>
        </label>
        <textarea
          id="apply-address"
          style={{ ...input, minHeight: 84, resize: 'vertical' }}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t('placeholders.address')}
          autoComplete="street-address"
          required
        />
        <FieldError text={fieldErrors.address} />
      </div>

      {/* Identity. One verification serves guest and host alike, so the documents
          are asked for only when nothing usable is on file. Someone who verified
          from their profile — or whose submission is still under review — sees
          what we already hold instead of a second upload of the same ID. */}
      {needsId ? (
        <>
          {identity.status === 'rejected' && (
            <div
              style={{
                ...fieldWrap,
                background: '#fdecea',
                border: '1px solid rgba(179,38,30,0.22)',
                borderRadius: 16,
                padding: '14px 16px',
              }}
            >
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#b3261e' }}>
                {t('identity.rejectedTitle')}
              </p>
              {identity.notes && (
                <p style={{ margin: '6px 0 0', fontSize: 13, color: C.ink, lineHeight: 1.55 }}>
                  <strong>{t('identity.reason')}:</strong> {identity.notes}
                </p>
              )}
              <p style={{ margin: '6px 0 0', fontSize: 13, color: C.muted, lineHeight: 1.55 }}>
                {t('identity.rejectedBody')}
              </p>
            </div>
          )}
        <div style={fieldWrap}>
          <label style={label} htmlFor="apply-doc-type">
            {t('fields.docType')} <span style={{ color: C.burgundy }}>*</span>
          </label>
          <select
            id="apply-doc-type"
            style={input}
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocType)}
          >
            {DOC_TYPES.map((d) => (
              <option key={d.key} value={d.key}>{t(`docTypes.${d.key}`)}</option>
            ))}
          </select>
          <FieldError text={fieldErrors.doc_type} />
        </div>

        <div style={fieldWrap}>
          <label style={label}>
            {t('fields.idPhotos')} <span style={{ color: C.burgundy }}>*</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {([
              { side: 'front' as const, value: idFront, ref: frontInputRef, clear: () => setIdFront(null), text: t('fields.idFront') },
              { side: 'back' as const, value: idBack, ref: backInputRef, clear: () => setIdBack(null), text: t('fields.idBack') },
            ]).map(({ side, value, ref, clear, text }) => (
              <div key={side}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.muted, marginBottom: 6 }}>{text}</div>
                <input
                  ref={ref}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => onPickId(side, e)}
                  style={{ display: 'none' }}
                  aria-label={text}
                />
                {value ? (
                  <div style={{ position: 'relative', width: '100%' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={value}
                      alt={text}
                      style={{
                        width: '100%',
                        aspectRatio: '1 / 1',
                        objectFit: 'cover',
                        borderRadius: 14,
                        border: `1px solid ${C.tan}`,
                        display: 'block',
                      }}
                    />
                    <button
                      type="button"
                      onClick={clear}
                      aria-label={t('idRemove')}
                      title={t('idRemove')}
                      style={{
                        position: 'absolute',
                        top: 8,
                        insetInlineEnd: 8,
                        width: 26,
                        height: 26,
                        borderRadius: 999,
                        border: 'none',
                        background: 'rgba(42,34,32,0.72)',
                        color: '#fff',
                        fontSize: 15,
                        lineHeight: 1,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'inherit',
                      }}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => ref.current?.click()}
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: 14,
                      border: `1px dashed ${C.tan}`,
                      background: C.cream,
                      color: C.muted,
                      fontSize: 12.5,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      padding: 10,
                      textAlign: 'center',
                      lineHeight: 1.4,
                    }}
                  >
                    {t('idChoose')}
                  </button>
                )}
              </div>
            ))}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
            {t('idHint')}
          </p>
        </div>
        </>
      ) : (
        <IdentityOnFile identity={identity} />
      )}

      {isBusiness && (
        <div style={fieldWrap}>
          <label style={label} htmlFor="apply-company">
            {hostType === 'brokerage' ? t('fields.brokerageName') : t('fields.companyName')}
          </label>
          <input
            id="apply-company"
            style={input}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder={t('placeholders.company')}
            autoComplete="organization"
          />
        </div>
      )}

      <div style={fieldWrap}>
        <label style={label} htmlFor="apply-notes">{t('fields.notesOptional')}</label>
        <textarea
          id="apply-notes"
          style={{ ...input, minHeight: 84, resize: 'vertical' }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('placeholders.notes')}
        />
      </div>

      {error && (
        <p role="alert" style={{ margin: '0 0 14px', fontSize: 13.5, color: '#b3261e', fontWeight: 600 }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="submit"
          disabled={busy}
          style={{
            background: C.burgundy,
            color: '#fff',
            border: 'none',
            borderRadius: 999,
            padding: '12px 30px',
            fontWeight: 700,
            fontSize: 15,
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.7 : 1,
            fontFamily: 'inherit',
          }}
        >
          {busy ? t('submitting') : reapply ? t('reapply') : t('submit')}
        </button>
        <a
          href="/account"
          style={{
            color: C.muted,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14.5,
          }}
        >
          {t('cancel')}
        </a>
      </div>
    </form>
  )
}

/** What we already hold, shown in place of the upload step. The applicant is
 *  told their identity travels with the application, so the missing uploader
 *  reads as "already done" rather than as a step that failed to render. */
function IdentityOnFile({ identity }: { identity: ApplicantIdentity }) {
  const t = useTranslations('hostApply')
  const verified = identity.status === 'verified'
  return (
    <div
      style={{
        ...fieldWrap,
        background: verified ? '#e7f5ec' : '#fff7e6',
        border: `1px solid ${verified ? 'rgba(23,114,69,0.20)' : 'rgba(154,107,0,0.20)'}`,
        borderRadius: 16,
        padding: '16px 18px',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 13.5,
          fontWeight: 700,
          color: verified ? '#177245' : '#9a6b00',
        }}
      >
        {verified ? `✓ ${t('identity.verifiedTitle')}` : t('identity.pendingTitle')}
      </p>
      <p style={{ margin: '6px 0 0', fontSize: 13.5, color: C.ink, lineHeight: 1.55 }}>
        {verified ? t('identity.verifiedBody') : t('identity.pendingBody')}
      </p>
      <a
        href="/verify-id"
        style={{
          display: 'inline-block',
          marginTop: 10,
          color: C.burgundy,
          fontSize: 13,
          fontWeight: 700,
          textDecoration: 'underline',
        }}
      >
        {t('identity.view')}
      </a>
    </div>
  )
}
