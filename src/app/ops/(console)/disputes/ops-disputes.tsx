'use client'

// Guest disputes (F6) — the queue, and what to do about each one.
//
// Expanding a row loads the full timeline: who filed it, every status change,
// each note. That history is the point — a dispute is a conversation with an
// outcome, and "who moved this to Resolved, when, and why" has to have an answer
// months later.
import { useCallback, useEffect, useState } from 'react'
import { COLORS, SERIF } from '../../ops-theme'
import { EmptyRow, adminGet, adminSend, btnBase, controlStyle, ghostBtn, pageStyle, panelStyle, solidBtn, td, th } from '../ops-ui'
import { waitingLabel } from '@/lib/local/activity-core'
import {
  DISPUTE_STATUSES,
  categoryLabel,
  disputeReference,
  eventSummary,
  needsAction,
  statusLabel,
  statusTone,
  canTransition,
  MAX_NOTE_CHARS,
} from '@/lib/local/disputes-core'

type Dispute = {
  id: string
  booking_id: string
  guest_id: string
  category: string
  description: string
  photos: string[]
  status: string
  resolution: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  guest_name: string | null
  guest_email: string
  listing_id: string | null
  listing_title: string | null
  host_id: string | null
  host_name: string | null
  reservation_code: string | null
  check_in: string | null
  check_out: string | null
  event_count: number
}

type DisputeEvent = {
  id: string
  from_status: string | null
  to_status: string
  note: string | null
  actor: string
  actor_name: string | null
  created_at: string
}

const FILTERS = ['needs_action', 'open', 'in_review', 'resolved', 'closed', 'all'] as const
type Filter = (typeof FILTERS)[number]

const FILTER_LABEL: Record<Filter, string> = {
  needs_action: 'Needs action',
  open: 'Open',
  in_review: 'In review',
  resolved: 'Resolved',
  closed: 'Closed',
  all: 'All',
}

const TONE_COLOR: Record<string, string> = {
  amber: '#B26A00',
  blue: '#1A56A8',
  green: COLORS.green,
  grey: COLORS.muted,
}

function toneOf(status: string): string {
  return TONE_COLOR[statusTone(status)] ?? COLORS.muted
}

export function OpsDisputes({ initial }: { initial: Dispute[] }) {
  const [disputes, setDisputes] = useState<Dispute[]>(initial)
  const [filter, setFilter] = useState<Filter>('needs_action')
  const [open, setOpen] = useState<string | null>(null)
  const [events, setEvents] = useState<Record<string, DisputeEvent[]>>({})
  const [note, setNote] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [now, setNow] = useState(() => 0)

  // Date.now() only after mount: the server render has a different clock, and a
  // relative timestamp computed in both places is a hydration mismatch. Deferred
  // out of the effect body, then ticking so "3 days" stays honest.
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const raf = requestAnimationFrame(tick)
    const id = setInterval(tick, 60_000)
    return () => { cancelAnimationFrame(raf); clearInterval(id) }
  }, [])

  const load = useCallback(async (next: Filter) => {
    const res = await adminGet<{ disputes: Dispute[] }>(`disputes?status=${next}`)
    if (res === 'forbidden') { setError('Your account does not have the Guest disputes module.'); return }
    if (!res) { setError('Could not load disputes. Please retry.'); return }
    setError(null)
    setDisputes(res.disputes ?? [])
  }, [])

  // Changing the filter is a user event, so it fetches in the handler rather
  // than in an effect watching state. The server-rendered list is simply kept.
  const changeFilter = (next: Filter) => {
    if (next === filter) return
    setFilter(next)
    void load(next)
  }

  const toggle = async (d: Dispute) => {
    if (open === d.id) { setOpen(null); return }
    setOpen(d.id)
    if (events[d.id]) return
    const res = await adminGet<{ events: DisputeEvent[] }>(`disputes?id=${encodeURIComponent(d.id)}`)
    if (res === 'forbidden' || !res) { setError('Could not load this history.'); return }
    setEvents((e) => ({ ...e, [d.id]: res.events ?? [] }))
  }

  const move = async (d: Dispute, to: string) => {
    if (to === 'closed' && !confirm(
      `Close ${disputeReference(d.id)}?\n\nClosed is final — it cannot be reopened, and the guest would have to file a new issue.`
    )) return
    setBusy(d.id); setError(null)
    const payload: Record<string, unknown> = { id: d.id, status: to }
    const text = note[d.id]?.trim()
    if (text) {
      payload.note = text
      // On a resolution the note IS what the guest is told, so it doubles as the
      // resolution rather than making the operator type it twice.
      if (to === 'resolved') payload.resolution = text
    }
    const res = await adminSend<{ ok?: boolean; error?: string; events?: DisputeEvent[] }>('disputes', 'POST', payload)
    setBusy(null)
    if (!res.ok) { setError((res.data as { error?: string })?.error ?? 'That did not work'); return }
    const fresh = (res.data as { events?: DisputeEvent[] })?.events
    if (fresh) setEvents((e) => ({ ...e, [d.id]: fresh }))
    setNote((n) => ({ ...n, [d.id]: '' }))
    await load(filter)
    setFlash(`${disputeReference(d.id)} → ${statusLabel(to)}`)
    setTimeout(() => setFlash(null), 5000)
  }

  return (
    <main style={pageStyle}>
      <section style={{ maxWidth: 1150, margin: '0 auto', padding: '24px 20px 64px' }}>
        <h1 style={{ margin: '0 0 4px', fontFamily: SERIF, fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', color: COLORS.burgundy }}>
          Guest disputes
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: COLORS.muted }}>
          Issues guests raised about a stay — before, during or after. A contested payment is in
          Payments; abuse about a listing or a person is in Reports.
        </p>

        {flash && <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.green, fontSize: 13, fontWeight: 700 }}>{flash}</div>}
        {error && <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.red, fontSize: 13, fontWeight: 700 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => changeFilter(f)}
              style={{
                ...btnBase,
                background: filter === f ? COLORS.burgundy : 'transparent',
                color: filter === f ? COLORS.cream : COLORS.ink,
                border: `1px solid ${filter === f ? COLORS.burgundy : COLORS.tan}`,
              }}
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>

        <div style={panelStyle}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>Filed</th>
                  <th style={th}>Ref</th>
                  <th style={th}>Guest</th>
                  <th style={th}>Stay</th>
                  <th style={th}>Issue</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, width: 1 }} />
                </tr>
              </thead>
              <tbody>
                {disputes.map((d) => {
                  const expanded = open === d.id
                  const timeline = events[d.id]
                  return (
                    <>
                      <tr key={d.id}>
                        <td style={{ ...td, whiteSpace: 'nowrap', color: COLORS.muted }}>
                          {now ? `${waitingLabel(d.created_at, now)} ago` : '—'}
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {disputeReference(d.id)}
                        </td>
                        <td style={td}>
                          <a href={`/ops/users/${d.guest_id}`} style={{ color: COLORS.burgundy, textDecoration: 'none', fontWeight: 700 }}>
                            {d.guest_name || d.guest_email}
                          </a>
                          <div style={{ color: COLORS.muted, fontSize: 11.5 }}>{d.guest_email}</div>
                        </td>
                        <td style={td}>
                          {d.listing_id ? (
                            <a href={`/explore/${d.listing_id}`} style={{ color: COLORS.burgundy, textDecoration: 'none' }}>
                              {d.listing_title || 'Listing'}
                            </a>
                          ) : (d.listing_title || '—')}
                          <div style={{ color: COLORS.muted, fontSize: 11.5 }}>
                            {d.reservation_code ? `${d.reservation_code} · ` : ''}{d.check_in} → {d.check_out}
                          </div>
                          {d.host_name && (
                            <div style={{ color: COLORS.muted, fontSize: 11.5 }}>Host: {d.host_name}</div>
                          )}
                        </td>
                        <td style={{ ...td, maxWidth: 300 }}>
                          <strong>{categoryLabel(d.category)}</strong>
                          <div style={{ color: COLORS.muted, marginTop: 2 }}>
                            {d.description.length > 120 ? d.description.slice(0, 120) + '…' : d.description}
                          </div>
                          {d.photos.length > 0 && (
                            <div style={{ color: COLORS.muted, fontSize: 11.5, marginTop: 2 }}>
                              {d.photos.length} photo{d.photos.length === 1 ? '' : 's'} attached
                            </div>
                          )}
                        </td>
                        <td style={td}>
                          <span style={{ color: toneOf(d.status), fontWeight: 700 }}>{statusLabel(d.status)}</span>
                          <div style={{ color: COLORS.muted, fontSize: 11.5 }}>
                            {d.event_count} update{d.event_count === 1 ? '' : 's'}
                          </div>
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          <button type="button" onClick={() => toggle(d)} style={{ ...ghostBtn, padding: '7px 14px', fontSize: 12 }}>
                            {expanded ? 'Hide' : 'Investigate'}
                          </button>
                        </td>
                      </tr>

                      {expanded && (
                        <tr key={`${d.id}-detail`}>
                          <td colSpan={7} style={{ ...td, background: COLORS.cream }}>
                            <div style={{ display: 'grid', gap: 16 }}>
                              <div>
                                <h3 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: COLORS.burgundy }}>
                                  What the guest wrote
                                </h3>
                                <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{d.description}</p>
                              </div>

                              {d.photos.length > 0 && (
                                <div>
                                  <h3 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: COLORS.burgundy }}>
                                    Attachments
                                  </h3>
                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {d.photos.map((src, i) => (
                                      <a key={i} href={src} target="_blank" rel="noopener noreferrer">
                                        {/* A data: URL, already in the payload — next/image
                                            would only add a proxy hop to bytes we hold. */}
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={src}
                                          alt={`Attachment ${i + 1}`}
                                          style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 10, border: `1px solid ${COLORS.tan}` }}
                                        />
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div>
                                <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: COLORS.burgundy }}>
                                  History
                                </h3>
                                {!timeline ? (
                                  <p style={{ margin: 0, color: COLORS.muted }}>Loading…</p>
                                ) : (
                                  <div style={{ display: 'grid', gap: 8 }}>
                                    {timeline.map((e) => (
                                      <div key={e.id} style={{ background: '#fff', borderRadius: 10, border: `1px solid ${COLORS.tan}`, padding: '8px 10px' }}>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                                          <strong style={{ fontSize: 12, color: toneOf(e.to_status) }}>{eventSummary(e)}</strong>
                                          <span style={{ color: COLORS.muted, fontSize: 11.5 }}>
                                            {e.actor_name || e.actor} · {new Date(e.created_at).toLocaleString()}
                                          </span>
                                        </div>
                                        {e.note && <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{e.note}</p>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {needsAction(d.status) || d.status === 'resolved' ? (
                                <div>
                                  <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: COLORS.burgundy }}>
                                    Update
                                  </h3>
                                  <label style={{ display: 'block', fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>
                                    Note — saved to the history, and shown to the guest. On “Resolved” this is the
                                    outcome they read.
                                  </label>
                                  <textarea
                                    value={note[d.id] ?? ''}
                                    maxLength={MAX_NOTE_CHARS}
                                    onChange={(e) => setNote((n) => ({ ...n, [d.id]: e.target.value }))}
                                    rows={3}
                                    style={{ ...controlStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                                  />
                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                    {DISPUTE_STATUSES.filter((s) => canTransition(d.status, s)).map((s) => (
                                      <button
                                        key={s}
                                        type="button"
                                        disabled={busy === d.id}
                                        onClick={() => move(d, s)}
                                        style={{
                                          ...(s === 'resolved' ? solidBtn : ghostBtn),
                                          padding: '7px 14px',
                                          fontSize: 12,
                                          ...(s === 'closed' ? { color: COLORS.red, borderColor: COLORS.red } : {}),
                                        }}
                                      >
                                        {busy === d.id ? 'Working…' : `Mark ${statusLabel(s).toLowerCase()}`}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <p style={{ margin: 0, fontSize: 12, color: COLORS.muted }}>
                                  This dispute is closed. Closed is final — the guest would need to file a new issue.
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
                {disputes.length === 0 && (
                  filter === 'needs_action' ? (
                    <EmptyRow
                      colSpan={7}
                      tone="clear"
                      title="Nothing to investigate"
                      body="Every dispute a guest has raised has been resolved or closed."
                    />
                  ) : (
                    <EmptyRow
                      colSpan={7}
                      tone="filtered"
                      title={`No ${FILTER_LABEL[filter].toLowerCase()} disputes`}
                      body="Switch the filter above to see disputes in another state."
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
