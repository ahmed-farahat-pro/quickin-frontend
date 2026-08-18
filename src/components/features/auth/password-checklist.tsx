'use client'

// The live requirement list under a new-password field (/signup, /login → reset).
//
// It is the same `passwordRuleStatus` the API decides with, so what the guest sees
// ticking off is literally the rule the server will apply — no second opinion, and
// no "create account" that fails on a rule nobody was shown.

import { useTranslations } from 'next-intl'
import { passwordRuleStatus, type PasswordRuleId } from '@/lib/local/password-policy'

const MET = '#2F7A47'
const UNMET = '#6B6055'

function Tick({ met }: { met: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke={met ? MET : UNMET} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      {met ? <path d="M20 6 9 17l-5-5" /> : <circle cx="12" cy="12" r="3.5" fill={UNMET} stroke="none" />}
    </svg>
  )
}

export default function PasswordChecklist({ password, id }: { password: string; id?: string }) {
  const t = useTranslations('passwordPolicy')
  const rules = passwordRuleStatus(password)

  return (
    <ul
      id={id}
      // Announced as it changes, so the list is usable without seeing the ticks.
      aria-live="polite"
      style={{
        listStyle: 'none',
        margin: '8px 0 0',
        padding: 0,
        display: 'grid',
        gap: 4,
      }}
    >
      {rules.map(({ id: rule, met }) => (
        <li
          key={rule}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 12.5,
            lineHeight: 1.4,
            color: met ? MET : UNMET,
          }}
        >
          <Tick met={met} />
          <span>{t(`rules.${rule as PasswordRuleId}`)}</span>
        </li>
      ))}
    </ul>
  )
}
