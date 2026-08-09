'use client'

// Moderation (F5) — the queue of users the content guard caught, and what to do
// about each one.
//
// The queue is people, not attempts: one user trying forty times is one decision
// to make, not forty rows. Expanding a row loads their full history — every
// attempt verbatim, because a count alone can't tell a determined evader from
// someone whose booking reference tripped the guard, and the difference decides
// whether they get warned or suspended.
import { useCallback, useEffect, useState } from 'react'
import { COLORS, SERIF } from '../../ops-theme'
import { EmptyRow, adminGet, adminSend, btnBase, controlStyle, ghostBtn, pageStyle, panelStyle, solidBtn, td, th } from '../ops-ui'
import { waitingLabel } from '@/lib/local/activity-core'
import {
  DEFAULT_WARNING,
  MAX_WARNING_CHARS,
  attemptsLabel,
  kindLabel,
  surfaceLabel,
  violationSummary,
} from '@/lib/local/moderation-core'

type FlaggedUser = {
  user_id: string
  full_name: string | null
  email: string
  role: string | null
  account_status: string
  total: number
  unreviewed: number
  kind_phone: number
  kind_email: number
  kind_social: number
  kind_url: number
  split_count: number
  last_at: string
  last_kind: string
  last_surface: string
  last_body: string
  warnings: number
  pending_warning: boolean
}

type Violation = {
  id: string
  kind: string
  surface: string
  body: string
  split: boolean
  context_type: string | null
  context_id: string | null
  created_at: string
  reviewed_at: string | null
  reviewed_by: string | null
}

type Warning = {
  id: string
  message: string
  issued_by: string
  issued_at: string
  acknowledged_at: string | null
}

const SCOPES = ['open', 'all'] as const
type Scope = (typeof SCOPES)[number]

const SCOPE_LABEL: Record<Scope, string> = {
  open: 'Needs review',
  all: 'Everyone ever flagged',
}

function statusTone(status: string): string {
  if (status === 'blocked') return COLORS.red
  if (status === 'removed') return COLORS.muted
  return COLORS.green
}

export function OpsModeration({ initial }: { initial: FlaggedUser[] }) {
  const [users, setUsers] = useState<FlaggedUser[]>(initial)
  const [scope, setScope] = useState<Scope>('open')
  const [open, setOpen] = useState<string | null>(null)
  const [detail, setDetail] = useState<Record<string, { violations: Violation[]; warnings: Warning[] }>>({})
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [now, setNow] = useState(() => 0)

  // Date.now() only after mount: the server render has a different clock, and a
  // relative timestamp computed in both places is a hydration mismatch. The first
  // tick is deferred out of the effect body rather than called synchronously, and
  // the interval then keeps "3 days ago" honest on a screen left open all day.
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const raf = requestAnimationFrame(tick)
    const id = setInterval(tick, 60_000)
    return () => { cancelAnimationFrame(raf); clearInterval(id) }
  }, [])

  const load = useCallback(async (next: Scope) => {
    const res = await adminGet<{ users: FlaggedUser[] }>(`moderation?scope=${next}`)
    if (res === 'forbidden') { setError('Your account does not have the Moderation module.'); return }
    if (!res) { setError('Could not load the queue. Please retry.'); return }
    setError(null)
    setUsers(res.users ?? [])
  }, [])

  // Switching scope is a user event, so it fetches in the handler rather than in
  // an effect watching `scope`. That also means the server-rendered 'open' list is
  // simply kept — no first-run guard needed to stop it re-fetching what it has.
  const changeScope = (next: Scope) => {
    if (next === scope) return
    setScope(next)
    void load(next)
  }

  const toggle = async (u: FlaggedUser) => {
    if (open === u.user_id) { setOpen(null); return }
    setOpen(u.user_id)
    if (detail[u.user_id]) return
    const res = await adminGet<{ violations: Violation[]; warnings: Warning[] }>(
      `moderation?userId=${encodeURIComponent(u.user_id)}`,
    )
    if (res === 'forbidden' || !res) { setError('Could not load this history.'); return }
    setDetail((d) => ({ ...d, [u.user_id]: { violations: res.violations ?? [], warnings: res.warnings ?? [] } }))
  }

  const act = async (u: FlaggedUser, action: 'warn' | 'suspend' | 'dismiss') => {
    if (action === 'suspend' && !confirm(
      `Suspend ${u.full_name || u.email}?\n\nThey will be signed out, their published listings hidden, and they cannot sign back in until this is lifted from /ops → Users.`
    )) return
    setBusy(u.user_id); setError(null)
    const payload: Record<string, unknown> = { userId: u.user_id, action }
    if (action === 'warn') payload.message = draft[u.user_id] ?? DEFAULT_WARNING
    const res = await adminSend<{ ok?: boolean; error?: string; alreadyPending?: boolean }>('moderation', 'POST', payload)
    setBusy(null)
    if (!res.ok) { setError((res.data as { error?: string })?.error ?? 'That did not work'); return }
    setDetail((d) => { const n = { ...d }; delete n[u.user_id]; return n })
    await load(scope)
    setFlash(
      action === 'warn'
        ? ((res.data as { alreadyPending?: boolean })?.alreadyPending
            ? 'They already have an unacknowledged warning — queue cleared instead'
            : 'Warning issued. They must acknowledge it before they can send another message.')
        : action === 'suspend'
          ? 'Account suspended and listings hidden'
          : 'Cleared without action',
    )
    setTimeout(() => setFlash(null), 6000)
  }

  return (
    <main style={pageStyle}>
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 64px' }}>
        <h1 style={{ margin: '0 0 4px', fontFamily: SERIF, fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', color: COLORS.burgundy }}>
          Moderation
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: COLORS.muted }}>
          Guests and hosts whose message, review, listing or profile was blocked for carrying contact
          details. The message was never delivered — this is the record that they tried.
        </p>

        {flash && <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.green, fontSize: 13, fontWeight: 700 }}>{flash}</div>}
        {error && <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.red, fontSize: 13, fontWeight: 700 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {SCOPES.map((s) => (
            <button
              key={s}
              onClick={() => changeScope(s)}
              style={{
                ...btnBase,
                background: scope === s ? COLORS.burgundy : 'transparent',
                color: scope === s ? COLORS.cream : COLORS.ink,
                border: `1px solid ${scope === s ? COLORS.burgundy : COLORS.tan}`,
              }}
            >
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>

        <div style={panelStyle}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>Last attempt</th>
                  <th style={th}>User</th>
                  <th style={th}>Attempts</th>
                  <th style={th}>Most recent</th>
                  <th style={th}>Account</th>
                  <th style={{ ...th, width: 1 }} />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const expanded = open === u.user_id
                  const d = detail[u.user_id]
                  return (
                    <>
                      <tr key={u.user_id}>
                        <td style={{ ...td, whiteSpace: 'nowrap', color: COLORS.muted }}>
                          {now ? `${waitingLabel(u.last_at, now)} ago` : '—'}
                        </td>
                        <td style={td}>
                          <a href={`/ops/users/${u.user_id}`} style={{ color: COLORS.burgundy, textDecoration: 'none', fontWeight: 700 }}>
                            {u.full_name || u.email}
                          </a>
                          <div style={{ color: COLORS.muted, fontSize: 11.5 }}>
                            {u.email}{u.role ? ` · ${u.role}` : ''}
                          </div>
                        </td>
                        <td style={td}>
                          <strong>{attemptsLabel(u.total)}</strong>
                          {u.unreviewed > 0 && (
                            <span style={{ color: COLORS.red, fontWeight: 700 }}> · {u.unreviewed} new</span>
                          )}
                          <div style={{ color: COLORS.muted, fontSize: 11.5 }}>
                            {violationSummary({
                              phone: u.kind_phone, email: u.kind_email, social: u.kind_social, url: u.kind_url,
                            })}
                          </div>
                          {u.split_count > 0 && (
                            // Worth calling out: spreading a number over several
                            // messages is not something anyone does by accident.
                            <div style={{ color: COLORS.red, fontSize: 11.5 }}>
                              {u.split_count} split across messages
                            </div>
                          )}
                        </td>
                        <td style={{ ...td, maxWidth: 320 }}>
                          <span style={{ color: COLORS.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                            {kindLabel(u.last_kind)} · {surfaceLabel(u.last_surface)}
                          </span>
                          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {u.last_body.length > 140 ? u.last_body.slice(0, 140) + '…' : u.last_body}
                          </div>
                        </td>
                        <td style={td}>
                          <span style={{ color: statusTone(u.account_status), fontWeight: 700, textTransform: 'capitalize' }}>
                            {u.account_status}
                          </span>
                          {u.pending_warning && (
                            <div style={{ color: COLORS.red, fontSize: 11.5 }}>Warning unread — chat gated</div>
                          )}
                          {!u.pending_warning && u.warnings > 0 && (
                            <div style={{ color: COLORS.muted, fontSize: 11.5 }}>
                              {u.warnings} warning{u.warnings === 1 ? '' : 's'} acknowledged
                            </div>
                          )}
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          <button type="button" onClick={() => toggle(u)} style={{ ...ghostBtn, padding: '7px 14px', fontSize: 12 }}>
                            {expanded ? 'Hide' : 'Review'}
                          </button>
                        </td>
                      </tr>

                      {expanded && (
                        <tr key={`${u.user_id}-detail`}>
                          <td colSpan={6} style={{ ...td, background: COLORS.cream }}>
                            {!d ? (
                              <p style={{ margin: 0, color: COLORS.muted }}>Loading history…</p>
                            ) : (
                              <div style={{ display: 'grid', gap: 16 }}>
                                <div>
                                  <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: COLORS.burgundy }}>
                                    Every attempt ({d.violations.length})
                                  </h3>
                                  <div style={{ display: 'grid', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                                    {d.violations.map((v) => (
                                      <div key={v.id} style={{ background: '#fff', borderRadius: 10, border: `1px solid ${COLORS.tan}`, padding: '8px 10px' }}>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                                          <strong style={{ fontSize: 12 }}>{kindLabel(v.kind)}</strong>
                                          <span style={{ color: COLORS.muted, fontSize: 11.5 }}>
                                            {surfaceLabel(v.surface)} · {new Date(v.created_at).toLocaleString()}
                                          </span>
                                          {v.split && (
                                            <span style={{ color: COLORS.red, fontSize: 11.5, fontWeight: 700 }}>
                                              split across messages
                                            </span>
                                          )}
                                          {v.reviewed_at && (
                                            <span style={{ color: COLORS.muted, fontSize: 11.5 }}>reviewed</span>
                                          )}
                                        </div>
                                        <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{v.body}</p>
                                      </div>
                                    ))}
                                    {d.violations.length === 0 && (
                                      <p style={{ margin: 0, color: COLORS.muted }}>Nothing recorded.</p>
                                    )}
                                  </div>
                                </div>

                                {d.warnings.length > 0 && (
                                  <div>
                                    <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: COLORS.burgundy }}>
                                      Warnings
                                    </h3>
                                    <div style={{ display: 'grid', gap: 8 }}>
                                      {d.warnings.map((w) => (
                                        <div key={w.id} style={{ background: '#fff', borderRadius: 10, border: `1px solid ${COLORS.tan}`, padding: '8px 10px' }}>
                                          <div style={{ color: COLORS.muted, fontSize: 11.5 }}>
                                            {new Date(w.issued_at).toLocaleString()} ·{' '}
                                            {w.acknowledged_at
                                              ? `acknowledged ${new Date(w.acknowledged_at).toLocaleString()}`
                                              : 'not yet read — their chat is gated'}
                                          </div>
                                          <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{w.message}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div>
                                  <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: COLORS.burgundy }}>
                                    Act
                                  </h3>
                                  <label style={{ display: 'block', fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>
                                    Warning text — they must read and acknowledge this before they can send another message.
                                  </label>
                                  <textarea
                                    value={draft[u.user_id] ?? DEFAULT_WARNING}
                                    maxLength={MAX_WARNING_CHARS}
                                    onChange={(e) => setDraft((s) => ({ ...s, [u.user_id]: e.target.value }))}
                                    rows={4}
                                    style={{ ...controlStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                                  />
                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                    <button type="button" disabled={busy === u.user_id} onClick={() => act(u, 'warn')} style={{ ...solidBtn, padding: '7px 14px', fontSize: 12 }}>
                                      {busy === u.user_id ? 'Working…' : 'Send warning'}
                                    </button>
                                    <button type="button" disabled={busy === u.user_id || u.account_status !== 'active'} onClick={() => act(u, 'suspend')} style={{ ...ghostBtn, padding: '7px 14px', fontSize: 12, color: COLORS.red, borderColor: COLORS.red }}>
                                      {u.account_status === 'active' ? 'Suspend account' : `Already ${u.account_status}`}
                                    </button>
                                    <button type="button" disabled={busy === u.user_id} onClick={() => act(u, 'dismiss')} style={{ ...ghostBtn, padding: '7px 14px', fontSize: 12 }}>
                                      Clear without action
                                    </button>
                                  </div>
                                  <p style={{ margin: '8px 0 0', fontSize: 11.5, color: COLORS.muted }}>
                                    Suspending is reversible from /ops → Users. Permanently removing an account is
                                    deliberately not available here.
                                  </p>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
                {users.length === 0 && (
                  scope === 'open' ? (
                    <EmptyRow
                      colSpan={6}
                      tone="clear"
                      title="Nobody to review"
                      body="No blocked attempt is waiting on a decision. The guard is still running on every message, review, listing and profile."
                    />
                  ) : (
                    <EmptyRow
                      colSpan={6}
                      tone="blank"
                      title="Nothing recorded yet"
                      body="Nobody has tried to share contact details since this started being recorded."
                    />
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}
