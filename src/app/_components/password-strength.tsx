'use client'

// Animated password-strength meter + requirements checklist.
//
// Shown beneath any "new password" field (signup, password reset, change
// password). It computes which rules a password satisfies, renders a strength
// bar whose width + colour transition smoothly, and a checklist whose icons
// animate from a grey ○ to a drawn ✓ as each rule is met.
//
// `passwordMeetsMin(pw)` is the gate the calling forms use to enable their
// submit button: length ≥ 8 + upper + lower + number (a special char is bonus,
// not required). The whole widget hides when `value` is empty.

import { useLanguage } from '@/lib/i18n/language-provider'

const COLORS = {
  ink: '#2A2220',
  muted: '#6B6055',
  burgundy: '#5B0F16',
  weak: '#c0392b',
  fair: '#B07A2A',
  good: '#0f5132',
  strong: '#0f5132',
  track: 'rgba(42,34,32,0.10)',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

// ---- Rule evaluation --------------------------------------------------------

export function hasUpper(pw: string): boolean {
  return /[A-Z]/.test(pw)
}
export function hasLower(pw: string): boolean {
  return /[a-z]/.test(pw)
}
export function hasNumber(pw: string): boolean {
  return /[0-9]/.test(pw)
}
export function hasSpecial(pw: string): boolean {
  return /[^A-Za-z0-9]/.test(pw)
}
export function hasMinLength(pw: string): boolean {
  return pw.length >= 8
}

interface Rule {
  id: 'length' | 'upper' | 'lower' | 'number' | 'special'
  labelKey: string
  test: (pw: string) => boolean
}

const RULES: Rule[] = [
  { id: 'length', labelKey: 'pw.req.length', test: hasMinLength },
  { id: 'upper', labelKey: 'pw.req.upper', test: hasUpper },
  { id: 'lower', labelKey: 'pw.req.lower', test: hasLower },
  { id: 'number', labelKey: 'pw.req.number', test: hasNumber },
  { id: 'special', labelKey: 'pw.req.special', test: hasSpecial },
]

// Minimum-strength gate used by the forms. Special char is a bonus, not required.
export function passwordMeetsMin(pw: string): boolean {
  return hasMinLength(pw) && hasUpper(pw) && hasLower(pw) && hasNumber(pw)
}

// Map a 0–5 score to a label key + colour. 0–2 weak, 3 fair, 4 good, 5 strong.
function strengthFor(score: number): { labelKey: string; color: string } {
  if (score <= 2) return { labelKey: 'pw.weak', color: COLORS.weak }
  if (score === 3) return { labelKey: 'pw.fair', color: COLORS.fair }
  if (score === 4) return { labelKey: 'pw.good', color: COLORS.good }
  return { labelKey: 'pw.strong', color: COLORS.strong }
}

// ---- Animated check icon ----------------------------------------------------

function CheckIcon({ met }: { met: boolean }) {
  // An empty grey ring when unmet; a drawn check (qkDraw) in a filled disc when
  // met. The colour/background transition smoothly; the tick stroke animates in.
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        flex: '0 0 auto',
        width: 18,
        height: 18,
        borderRadius: 9,
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: met ? '1.5px solid transparent' : `1.5px solid ${COLORS.muted}`,
        background: met ? COLORS.good : 'transparent',
        transition:
          'background 0.35s ease, border-color 0.35s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        transform: met ? 'scale(1)' : 'scale(0.92)',
      }}
    >
      {met && (
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d="M20 6 9 17l-5-5"
            style={{
              strokeDasharray: 40,
              animation: 'qkDraw 0.4s ease forwards',
            }}
          />
        </svg>
      )}
    </span>
  )
}

// ---- Widget -----------------------------------------------------------------

export default function PasswordStrength({ value }: { value: string }) {
  const { t } = useLanguage()

  // Empty → render nothing (keeps the form compact until the user types).
  if (!value) return null

  const checks = RULES.map((r) => ({ rule: r, met: r.test(value) }))
  const score = checks.reduce((n, c) => (c.met ? n + 1 : n), 0)
  const { labelKey, color } = strengthFor(score)
  const widthPct = (score / RULES.length) * 100

  return (
    <div
      style={{ marginTop: 10, fontFamily: FONT }}
      aria-live="polite"
    >
      {/* Strength bar + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            flex: 1,
            height: 6,
            borderRadius: 999,
            background: COLORS.track,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${widthPct}%`,
              height: '100%',
              borderRadius: 999,
              background: color,
              transition: 'width 0.35s ease, background 0.35s ease',
            }}
          />
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color,
            minWidth: 44,
            textAlign: 'end',
            transition: 'color 0.35s ease',
          }}
        >
          {t(labelKey)}
        </span>
      </div>

      {/* Requirements checklist */}
      <ul
        style={{
          listStyle: 'none',
          margin: '10px 0 0',
          padding: 0,
          display: 'grid',
          gap: 6,
        }}
      >
        {checks.map(({ rule, met }) => (
          <li
            key={rule.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12.5,
              color: met ? COLORS.ink : COLORS.muted,
              transition: 'color 0.3s ease',
            }}
          >
            <CheckIcon met={met} />
            <span>{t(rule.labelKey)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
