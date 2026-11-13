'use client'

// Host application form: collects the details an admin needs to review, then
// POSTs to /api/local/host/apply. Same account, no re-typing: name, phone and ID
// number come from the profile (shown read-only, edited from /account) and only
// what the profile is MISSING gets an input. On top: host type, address, a
// payout destination (unless one is on file) and the host terms. The body and
// the host-only checks live in lib/local/host-apply-core. This does NOT grant host — on success it shows
// a calm "submitted, pending review" panel. Mirrors the boutique style + patterns
// of host/new/new-listing-form.tsx (inline styles, inline validation/errors).
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { fileToCompressedDataUrl } from '@/lib/image'
import {
  DOC_TYPES,
  nationalIdForApplication,
  needsIdentityDocuments,
  type DocType,
  type VerificationStatus,
} from '@/lib/local/host-verification-core'
import { MAX_PHONE_CHARS, filterPhoneInput, isValidPhone } from '@/lib/local/phone-core'
import { checkName } from '@/lib/local/name-policy'
import {
  APPLY_FIELD_ERROR_KEYS,
  PROFILE_FIELDS,
  buildHostApplyBody,
  checkHostOnlyFields,
  isPayoutDraftEmpty,
  profileFieldsToAsk,
  type ProfileField,
} from '@/lib/local/host-apply-core'
import type { PayoutMethodView } from '@/lib/local/payout-method-core'
import {
  PayoutFields,
  PayoutSummary,
  draftFromView,
  type PayoutDraft,
} from '@/app/account/payout-method-card'

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

/** What GET /api/local/host/application says the profile already holds. */
export interface ApplicantProfileView {
  full_name: string | null
  phone: string | null
  national_id: string | null
  doc_type: string | null
  verification_status: string | null
  missing: string[]
}

export function ApplyForm({
  initialName,
  reapply = false,
  previous = null,
  identity,
  profile = null,
  payoutOnFile = null,
}: {
  initialName: string
  reapply?: boolean
  previous?: PreviousApplication | null
  identity: ApplicantIdentity
  /** null when the profile could not be read — every field is then asked for. */
  profile?: ApplicantProfileView | null
  payoutOnFile?: PayoutMethodView | null
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
  // A pending submission is only seeded — nothing has been approved yet. The
  // rule lives in host-verification-core because iOS and Android render it too.
  const idField = nationalIdForApplication({
    status: identity.status,
    submittedIdNumber: identity.idNumber,
    previousNationalId: previous?.national_id,
  })
  const nationalIdLocked = idField.locked
  const [nationalId, setNationalId] = useState(idField.value)
  const [phone, setPhone] = useState(previous?.phone ?? '')
  const [address, setAddress] = useState(previous?.address ?? '')
  const [company, setCompany] = useState(previous?.company ?? '')
  const [notes, setNotes] = useState(previous?.notes ?? '')
  const isBusiness = hostType === 'company' || hostType === 'brokerage'

  // Only what the profile can't supply is asked for; the rest is shown
  // read-only and NOT sent (the server takes it from the profile regardless).
  const ask = profileFieldsToAsk(profile)
  const asks = (f: ProfileField) => ask.includes(f)
  const onFile = PROFILE_FIELDS.filter((f) => !asks(f) && profile?.[f])

  // Payout: required unless one is on file. A re-applicant who keeps one may
  // still replace it from here — the account page only shows the payout card
  // to approved hosts.
  const [payout, setPayout] = useState<PayoutDraft>(() => draftFromView(null))
  const [replacePayout, setReplacePayout] = useState(false)
  const payoutRequired = !payoutOnFile
  const showPayoutFields = payoutRequired || replacePayout
  const [termsAccepted, setTermsAccepted] = useState(false)

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

    // Same required set as the API: everything but company + notes. Profile
    // fields are checked only when asked for — the rest come from the profile.
    const invalid: Record<string, string> = {}
    if (asks('full_name')) {
      if (!fullName.trim()) invalid.full_name = t('errors.fullNameRequired')
      else {
        // An admin reads this name against the ID photos, so it has to be a name.
        // Same policy — and the same localized copy — as the one signup applies.
        const nameProblem = checkName(fullName)
        if (nameProblem) invalid.full_name = tn(`errors.${nameProblem.code}`)
      }
    }
    if (asks('national_id') && !nationalId.trim()) invalid.national_id = t('errors.nationalIdRequired')
    if (asks('phone')) {
      if (!phone.trim()) invalid.phone = t('errors.phoneRequired')
      // Typing already keeps letters out; this catches what is still not a number —
      // too few digits, or a field holding nothing but separators.
      else if (!isValidPhone(phone)) invalid.phone = t('errors.phoneInvalid')
    }
    for (const k of checkHostOnlyFields({
      address,
      termsAccepted,
      payoutOnFile: !payoutRequired,
      payout: showPayoutFields ? payout : null,
    })) {
      invalid[k] =
        k === 'address' ? t('errors.addressRequired') : k === 'terms' ? t('errors.termsRequired') : t('errors.payoutRequired')
    }
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
        // Identity documents ride WITH the application (one admin decision
        // approves both; one failure fails the whole submission). They are
        // omitted when the applicant is already verified or under review: the
        // server links their existing submission instead of taking a second copy.
        body: JSON.stringify(
          buildHostApplyBody({
            ask,
            values: { full_name: fullName, phone, national_id: nationalId },
            hostType,
            address,
            company,
            notes,
            termsAccepted,
            payoutOnFile: !payoutRequired,
            payout: showPayoutFields ? payout : null,
            identityDocs: needsId ? { doc_type: docType, id_front: idFront, id_back: idBack } : null,
          })
        ),
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
            mapped[name] = APPLY_FIELD_ERROR_KEYS[name] ? t(APPLY_FIELD_ERROR_KEYS[name]) : String(msg)
          }
          // Payout: nothing typed → ask for one; something typed but refused →
          // say so, with the validator's reason (an IBAN checksum, say) beneath.
          if (mapped.payout) {
            const detail = String((err.fields as Record<string, string>).payout ?? '')
            mapped.payout = isPayoutDraftEmpty(showPayoutFields ? payout : null)
              ? t('errors.payoutRequired')
              : detail
                ? `${t('errors.payoutInvalid')} ${detail}`
                : t('errors.payoutInvalid')
          }
          // The name is localized from its policy code: the API echoes one when
          // it has it, and otherwise the same rule run here says what it was.
          if (mapped.full_name && asks('full_name')) {
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
      {/* From your profile: what the account already holds, read-only. Changing
          it is an edit to the profile, not to this application. */}
      {onFile.length > 0 && (
        <ProfileOnFile
          profile={profile as ApplicantProfileView}
          fields={onFile}
          errors={fieldErrors}
        />
      )}
      {ask.length > 0 && onFile.length > 0 && (
        <p style={{ margin: '0 0 14px', fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
          {t('profile.missingNote')}
        </p>
      )}

      {asks('full_name') && (
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
      )}

      {asks('phone') && (
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
      )}

      {asks('national_id') && (
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
      )}

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

      {/* Where Quick In sends this host's earnings. The same fields as the
          account page's payout card; asked for here only when none is on file. */}
      <div
        style={{
          ...fieldWrap,
          borderTop: '1px solid rgba(42,34,32,0.08)',
          paddingTop: 20,
        }}
      >
        <p style={{ ...label, fontSize: 15, marginBottom: 4 }}>
          {t('payout.title')} {payoutRequired && <span style={{ color: C.burgundy }}>*</span>}
        </p>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
          {payoutOnFile ? t('payout.subtitleOnFile') : t('payout.subtitle')}
        </p>
        {payoutOnFile && !replacePayout ? (
          <>
            <PayoutSummary saved={payoutOnFile} />
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
              {t('payout.onFileNote')}{' '}
              <button
                type="button"
                onClick={() => setReplacePayout(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: C.burgundy,
                  fontWeight: 700,
                  fontSize: 12.5,
                  fontFamily: 'inherit',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                {t('payout.replace')}
              </button>
            </p>
          </>
        ) : (
          <>
            <PayoutFields value={payout} onChange={setPayout} />
            {payoutOnFile && (
              <button
                type="button"
                onClick={() => {
                  setReplacePayout(false)
                  setPayout(draftFromView(null))
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: C.burgundy,
                  fontWeight: 700,
                  fontSize: 12.5,
                  fontFamily: 'inherit',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                {t('payout.keep')}
              </button>
            )}
          </>
        )}
        <FieldError text={fieldErrors.payout} />
      </div>

      {/* The host terms — required, and recorded with the application. */}
      <div style={fieldWrap}>
        <label
          htmlFor="apply-terms"
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: C.ink, lineHeight: 1.5, cursor: 'pointer' }}
        >
          <input
            id="apply-terms"
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            aria-invalid={fieldErrors.terms ? true : undefined}
            style={{ marginTop: 3, width: 17, height: 17, accentColor: C.burgundy, flexShrink: 0 }}
          />
          <span>
            {t.rich('terms.label', {
              link: (chunks) => (
                <a
                  href="/terms#host"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: C.burgundy, fontWeight: 700, textDecoration: 'underline' }}
                >
                  {chunks}
                </a>
              ),
            })}
          </span>
        </label>
        <FieldError text={fieldErrors.terms} />
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


/** "From your profile": the name, phone and ID number this application is filed
 *  under, read-only. They are edited from /account, never from here — the
 *  server takes them from the profile and ignores anything this form sends. */
function ProfileOnFile({
  profile,
  fields,
  errors,
}: {
  profile: ApplicantProfileView
  fields: ProfileField[]
  errors: Record<string, string>
}) {
  const t = useTranslations('hostApply')
  const docKey = DOC_TYPES.some((d) => d.key === profile.doc_type) ? profile.doc_type : null
  const labels: Record<ProfileField, string> = {
    full_name: t('fields.fullName'),
    phone: t('fields.phone'),
    national_id: t('profile.idNumber'),
  }
  return (
    <div
      style={{
        ...fieldWrap,
        background: C.cream,
        border: '1px solid rgba(42,34,32,0.08)',
        borderRadius: 16,
        padding: '16px 18px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: C.ink }}>{t('profile.title')}</p>
        <a
          href="/account"
          style={{ color: C.burgundy, fontSize: 13, fontWeight: 700, textDecoration: 'underline' }}
        >
          {t('profile.edit')}
        </a>
      </div>
      <p style={{ margin: '4px 0 10px', fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{t('profile.body')}</p>
      <dl style={{ margin: 0, display: 'grid', gap: 10 }}>
        {fields.map((f) => (
          <div key={f} style={{ display: 'grid', gap: 2 }}>
            <dt style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.02em' }}>{labels[f]}</dt>
            <dd style={{ margin: 0, fontSize: 14.5, color: C.ink, wordBreak: 'break-word' }}>
              {profile[f]}
              {f === 'national_id' && docKey && (
                <span style={{ color: C.muted, fontSize: 13 }}> · {t(`docTypes.${docKey}`)}</span>
              )}
            </dd>
            <FieldError text={errors[f]} />
          </div>
        ))}
      </dl>
    </div>
  )
}
