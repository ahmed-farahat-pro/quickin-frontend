'use client'

// The show/hide eye that sits inside a password field.
//
// Every password box on the site is a box you cannot proofread, and a guest who
// mistypes their new password only finds out from "passwords do not match" — or,
// worse, from a login that stops working. /login and /signup already offered the
// eye; /account's change-password form did not, so this is that same control
// pulled out where any form can use it.
//
// Place it inside a `position: relative` wrapper and leave room for it on the
// input with `paddingInlineEnd: 46`.

import { useTranslations } from 'next-intl'

const MUTED = '#6B6055'

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={MUTED}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {off ? (
        <>
          <path d="M9.88 4.24A9.12 9.12 0 0 1 12 4c5.52 0 9.27 4.86 10 7 0 0-.5 1.46-1.74 2.92" />
          <path d="M6.07 6.06C3.4 7.6 2 10.86 2 11c.73 2.14 4.48 7 10 7a9.7 9.7 0 0 0 4-0.83" />
          <line x1="3" y1="3" x2="21" y2="21" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </>
      ) : (
        <>
          <path d="M2 11s3.75-7 10-7 10 7 10 7-3.75 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="11" r="3" />
        </>
      )}
    </svg>
  )
}

export default function PasswordEyeToggle({
  shown,
  onToggle,
  controls,
}: {
  /** Whether the field it belongs to is currently showing plain text. */
  shown: boolean
  onToggle: () => void
  /** id of the input, so a screen reader knows which field this eye belongs to. */
  controls?: string
}) {
  const t = useTranslations('passwordPolicy')

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? t('toggle.hide') : t('toggle.show')}
      aria-pressed={shown}
      aria-controls={controls}
      style={{
        position: 'absolute',
        insetInlineEnd: 8,
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        padding: 0,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: MUTED,
      }}
    >
      <EyeIcon off={shown} />
    </button>
  )
}
