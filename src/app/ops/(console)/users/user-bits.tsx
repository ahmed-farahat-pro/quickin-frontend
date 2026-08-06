'use client'

// Small pieces shared by the users list and the user profile. There is no shared
// Badge/Pill component in /ops — every screen has grown its own local helper — so
// this keeps the two Users screens agreeing with each other at least.
import { COLORS } from '../../ops-theme'
import { normalizeStatus, statusLabel, statusTone } from '@/lib/local/user-admin-core'

const TONE: Record<'green' | 'amber' | 'red', { bg: string; fg: string }> = {
  green: { bg: '#E4F3EC', fg: COLORS.green },
  amber: { bg: '#FDF0DC', fg: '#8A5A12' },
  red: { bg: '#FBE7E5', fg: COLORS.red },
}

export function pill(text: string, bg: string, color: string) {
  return (
    <span style={{ background: bg, color, borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

/** Active / Blocked / Removed, in the house colours. */
export function StatusPill({ status }: { status: string }) {
  const s = normalizeStatus(status)
  const tone = TONE[statusTone(s)]
  return pill(statusLabel(s), tone.bg, tone.fg)
}

/** '6 Aug 2026' — dates in /ops are day-precision everywhere. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** '6 Aug 2026, 14:32' — used where the exact moment matters (audit, messages). */
export function fmtMoment(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${fmtDay(iso)}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

/** status_changed_by holds `staff:<uuid>`; show the readable half. */
export function actorLabel(actor: string | null | undefined): string {
  if (!actor) return 'a member of staff'
  return actor.startsWith('staff:') ? `staff ${actor.slice(6, 14)}` : actor
}
