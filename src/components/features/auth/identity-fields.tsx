'use client'

// The phone + identity-document half of account creation, shared by the email
// signup form (/signup, before the OTP) and the Google "Complete your account"
// page (/complete-account). Both post the same five fields — `phone`, `doc_type`,
// `id_number`, `id_front`, `id_back` — so they render the same inputs and run
// the same checks.
//
// Boutique inline styles, like the signup card it sits in. The document picker
// and front/back photo tiles follow the host application form (apply-form.tsx).
import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { fileToCompressedDataUrl } from '@/lib/image'
import { DOC_TYPES, type DocType } from '@/lib/local/host-verification-core'
import { MAX_PHONE_CHARS, filterPhoneInput, normalizePhone } from '@/lib/local/phone-core'
import {
  MAX_SIGNUP_ID_PHOTO_CHARS,
  PHONE_TAKEN_MESSAGE,
  checkDocumentNumber,
  identityFieldErrors,
  type IdentityField,
} from '@/lib/local/signup-identity-ui-core'

const C = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

export interface IdentityValues {
  phone: string
  docType: DocType
  idNumber: string
  idFront: string | null
  idBack: string | null
}

export type IdentityErrors = Partial<Record<IdentityField, string>>

export const EMPTY_IDENTITY: IdentityValues = {
  phone: '',
  docType: 'national_id',
  idNumber: '',
  idFront: null,
  idBack: null,
}

/**
 * Successive compression passes for an ID photo. The first is the app-wide
 * default; the later ones only run for a photo that would push the request past
 * Vercel's body limit, which a modern phone camera can do on its own.
 */
const PASSES: Array<[number, number]> = [
  [1600, 0.72],
  [1200, 0.62],
  [900, 0.55],
]

async function compressIdPhoto(file: File): Promise<string | null> {
  for (const [dim, quality] of PASSES) {
    const url = await fileToCompressedDataUrl(file, dim, quality)
    if (url.length <= MAX_SIGNUP_ID_PHOTO_CHARS) return url
  }
  return null
}

/**
 * Localized checks for the five fields, run before submit. Returns an empty
 * object when everything is filled in properly.
 */
export function useIdentityValidation() {
  const t = useTranslations('signupIdentity')

  function validate(v: IdentityValues): IdentityErrors {
    const e: IdentityErrors = {}
    if (!v.phone.trim()) e.phone = t('errors.phoneRequired')
    else if (!normalizePhone(v.phone)) e.phone = t('errors.phoneInvalid')
    if (!v.docType) e.doc_type = t('errors.docTypeRequired')
    const num = checkDocumentNumber(v.idNumber, v.docType)
    if (num) e.id_number = t(`errors.idNumber.${num}`)
    if (!v.idFront) e.id_front = t('errors.frontRequired')
    if (!v.idBack) e.id_back = t('errors.backRequired')
    return e
  }

  /**
   * Turn a 400's `fields` map into localized messages. The server's English is
   * the fallback for a problem the client rules didn't predict.
   */
  function fromServer(fields: unknown, v: IdentityValues): IdentityErrors {
    const raw = identityFieldErrors(fields)
    const e: IdentityErrors = {}
    if (raw.phone) {
      e.phone = raw.phone === PHONE_TAKEN_MESSAGE
        ? t('errors.phoneTaken')
        : normalizePhone(v.phone) ? raw.phone : t('errors.phoneInvalid')
    }
    if (raw.doc_type) e.doc_type = t('errors.docTypeRequired')
    if (raw.id_number) {
      const num = checkDocumentNumber(v.idNumber, v.docType)
      e.id_number = num ? t(`errors.idNumber.${num}`) : raw.id_number
    }
    if (raw.id_front) e.id_front = t('errors.frontRequired')
    if (raw.id_back) e.id_back = t('errors.backRequired')
    return e
  }

  return { validate, fromServer }
}

/** The request-body fields, with the phone in its canonical form. */
export function identityPayload(v: IdentityValues) {
  return {
    phone: normalizePhone(v.phone) ?? v.phone.trim(),
    doc_type: v.docType,
    id_number: v.idNumber.trim(),
    id_front: v.idFront,
    id_back: v.idBack,
  }
}

interface Props {
  value: IdentityValues
  onChange: (next: IdentityValues) => void
  errors: IdentityErrors
  onClearError: (field: IdentityField) => void
  disabled?: boolean
  /** Prefix for element ids, so two instances never collide. */
  idPrefix?: string
}

export function IdentityFields({ value, onChange, errors, onClearError, disabled, idPrefix = 'identity' }: Props) {
  const t = useTranslations('signupIdentity')
  const frontRef = useRef<HTMLInputElement>(null)
  const backRef = useRef<HTMLInputElement>(null)
  const [busySide, setBusySide] = useState<'front' | 'back' | null>(null)
  const [photoError, setPhotoError] = useState<{ side: 'front' | 'back'; text: string } | null>(null)

  function set<K extends keyof IdentityValues>(key: K, v: IdentityValues[K]) {
    onChange({ ...value, [key]: v })
  }

  async function onPick(side: 'front' | 'back', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setPhotoError(null)
    setBusySide(side)
    try {
      const url = await compressIdPhoto(file)
      if (!url) {
        setPhotoError({ side, text: t('errors.photoTooLarge') })
        return
      }
      onClearError(side === 'front' ? 'id_front' : 'id_back')
      onChange({ ...value, [side === 'front' ? 'idFront' : 'idBack']: url })
    } catch {
      setPhotoError({ side, text: t('errors.photoUnreadable') })
    } finally {
      setBusySide(null)
    }
  }

  const nationalId = value.docType === 'national_id'

  return (
    <fieldset style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
      <legend style={{ padding: 0, marginBottom: 4, fontSize: 15, fontWeight: 700, color: C.ink }}>
        {t('sectionTitle')}
      </legend>
      <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5, color: C.muted }}>
        {t('sectionHint')}
      </p>

      <label style={wrap}>
        <span style={labelText}>{t('fields.phone')}</span>
        <input
          id={`${idPrefix}-phone`}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          maxLength={MAX_PHONE_CHARS}
          value={value.phone}
          disabled={disabled}
          onChange={(e) => {
            set('phone', filterPhoneInput(e.target.value))
            if (errors.phone) onClearError('phone')
          }}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={errors.phone ? `${idPrefix}-phone-error` : undefined}
          placeholder={t('fields.phonePlaceholder')}
          dir="ltr"
          style={inputFor(Boolean(errors.phone))}
        />
        <FieldError id={`${idPrefix}-phone-error`} text={errors.phone} />
      </label>

      <label style={wrap}>
        <span style={labelText}>{t('fields.docType')}</span>
        <select
          id={`${idPrefix}-doc-type`}
          value={value.docType}
          disabled={disabled}
          onChange={(e) => {
            set('docType', e.target.value as DocType)
            if (errors.doc_type) onClearError('doc_type')
            if (errors.id_number) onClearError('id_number')
          }}
          style={inputFor(Boolean(errors.doc_type))}
        >
          {DOC_TYPES.map((d) => (
            <option key={d.key} value={d.key}>{t(`docTypes.${d.key}`)}</option>
          ))}
        </select>
        <FieldError id={`${idPrefix}-doc-type-error`} text={errors.doc_type} />
      </label>

      <label style={wrap}>
        <span style={labelText}>{t('fields.idNumber')}</span>
        <input
          id={`${idPrefix}-id-number`}
          type="text"
          inputMode={nationalId ? 'numeric' : 'text'}
          autoComplete="off"
          autoCapitalize="characters"
          required
          maxLength={40}
          value={value.idNumber}
          disabled={disabled}
          onChange={(e) => {
            set('idNumber', e.target.value)
            if (errors.id_number) onClearError('id_number')
          }}
          aria-invalid={errors.id_number ? true : undefined}
          aria-describedby={errors.id_number ? `${idPrefix}-id-number-error` : undefined}
          placeholder={nationalId ? t('fields.idNumberPlaceholderNational') : t('fields.idNumberPlaceholderOther')}
          dir="ltr"
          style={inputFor(Boolean(errors.id_number))}
        />
        <FieldError id={`${idPrefix}-id-number-error`} text={errors.id_number} />
      </label>

      <div style={wrap}>
        <span style={labelText}>{t('fields.photos')}</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {([
            { side: 'front' as const, key: 'idFront' as const, err: errors.id_front, ref: frontRef, text: t('fields.idFront') },
            { side: 'back' as const, key: 'idBack' as const, err: errors.id_back, ref: backRef, text: t('fields.idBack') },
          ]).map(({ side, key, err, ref, text }) => {
            const url = value[key]
            const busy = busySide === side
            const sideError = photoError?.side === side ? photoError.text : err
            return (
              <div key={side}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.muted, marginBottom: 6 }}>{text}</div>
                <input
                  ref={ref}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => onPick(side, e)}
                  style={{ display: 'none' }}
                  aria-label={text}
                  disabled={disabled || busy}
                />
                {url ? (
                  <div style={{ position: 'relative', width: '100%' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={text}
                      style={{
                        width: '100%',
                        aspectRatio: '3 / 2',
                        objectFit: 'cover',
                        borderRadius: 14,
                        border: `1px solid ${C.tan}`,
                        display: 'block',
                      }}
                    />
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => onChange({ ...value, [key]: null })}
                        aria-label={t('photo.remove')}
                        title={t('photo.remove')}
                        style={removeButton}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => ref.current?.click()}
                    disabled={disabled || busy}
                    aria-describedby={sideError ? `${idPrefix}-${side}-error` : undefined}
                    style={{
                      width: '100%',
                      aspectRatio: '3 / 2',
                      borderRadius: 14,
                      border: `1px dashed ${sideError ? C.burgundy : 'rgba(42,34,32,0.24)'}`,
                      background: C.cream,
                      color: C.muted,
                      fontSize: 12.5,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: disabled || busy ? 'wait' : 'pointer',
                      padding: 10,
                      textAlign: 'center',
                      lineHeight: 1.4,
                    }}
                  >
                    {busy ? t('photo.processing') : t('photo.add')}
                  </button>
                )}
                <FieldError id={`${idPrefix}-${side}-error`} text={sideError} />
              </div>
            )
          })}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.45, color: C.muted }}>
          {t('photo.hint')}
        </p>
      </div>
    </fieldset>
  )
}

function FieldError({ id, text }: { id: string; text?: string }) {
  if (!text) return null
  return (
    <span
      id={id}
      role="alert"
      style={{ display: 'block', marginTop: 6, fontSize: 13, lineHeight: 1.4, color: C.burgundy }}
    >
      {text}
    </span>
  )
}

const wrap: React.CSSProperties = { display: 'block', marginBottom: 16 }

const labelText: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: C.ink,
  marginBottom: 6,
}

const baseInput: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: FONT,
  fontSize: 15,
  color: C.ink,
  background: C.cream,
  border: '1px solid rgba(42,34,32,0.14)',
  borderRadius: 18,
  padding: '12px 16px',
  outline: 'none',
}

// The whole `border` shorthand, not just borderColor — React warns when a
// shorthand and its longhand are mixed across renders.
function inputFor(invalid: boolean): React.CSSProperties {
  return invalid ? { ...baseInput, border: `1px solid ${C.burgundy}` } : baseInput
}

const removeButton: React.CSSProperties = {
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
}
