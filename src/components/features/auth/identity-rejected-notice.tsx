// "Your ID was not approved" — shown to an account that signed up under the
// identity requirement and whose document was rejected. Such an account can
// browse but cannot book until it uploads a new document, so the notice always
// carries the reviewer's reason and the way to fix it (the /verify-id upload).
//
// No 'use client' and no hooks beyond useTranslations: it renders inside the
// server-rendered /account page and inside the client reserve panel alike.
import { useTranslations } from 'next-intl'
import { ID_REUPLOAD_PATH } from '@/lib/local/signup-identity-ui-core'

export function IdentityRejectedNotice({
  note,
  message,
  style,
}: {
  /** The reviewer's reason (`verification_note`). */
  note?: string | null
  /** A server message to show instead of the generic body (a booking refusal,
   *  which already includes the reason). */
  message?: string | null
  style?: React.CSSProperties
}) {
  const t = useTranslations('signupIdentity')
  return (
    <div
      role="alert"
      style={{
        background: '#fdecea',
        border: '1px solid rgba(179,38,30,0.22)',
        borderRadius: 16,
        padding: '14px 16px',
        ...style,
      }}
    >
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#b3261e' }}>
        {t('rejected.title')}
      </p>
      {message ? (
        <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#2A2220', lineHeight: 1.55 }}>{message}</p>
      ) : (
        <>
          {note && (
            <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#2A2220', lineHeight: 1.55 }}>
              <strong>{t('rejected.reason')}:</strong> {note}
            </p>
          )}
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6B6055', lineHeight: 1.55 }}>
            {t('rejected.body')}
          </p>
        </>
      )}
      <a
        href={ID_REUPLOAD_PATH}
        style={{
          display: 'inline-block',
          marginTop: 10,
          fontSize: 13.5,
          fontWeight: 700,
          color: '#5B0F16',
          textDecoration: 'none',
        }}
      >
        {t('rejected.cta')} →
      </a>
    </div>
  )
}
