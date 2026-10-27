'use client'

// Host response — the queue of booking requests hosts left unanswered for 24h+.
//
// One row per request. "Open" is the work: call or message the host, then mark it
// handled with what you did. An alert also closes by itself once the host answers
// or the check-in date passes, so nothing here needs closing by hand.
import { useCallback, useEffect, useState } from 'react'
import { COLORS, SERIF } from '../../ops-theme'
import { EmptyRow, adminGet, adminSend, btnBase, controlStyle, pageStyle, panelStyle, solidBtn, td, th } from '../ops-ui'
import { waitingLabel } from '@/lib/local/activity-core'
import {
  HANDLED_NOTE_MAX,
  LIST_FILTERS,
  closedReasonLabel,
  type ListFilter,
} from '@/lib/local/host-response-alerts-core'

type HostAlert = {
  id: string
  booking_id: string
  status: string
  first_flagged_at: string
  nudge_count: number
  last_nudged_at: string | null
  handled_by_name: string | null
  handled_at: string | null
  handled_note: string | null
  closed_at: string | null
  closed_reason: string | null
  requested_at: string
  check_in: string
  check_out: string
  guests: number
  total_price: number
  listing_id: string
  listing_title: string | null
  host_id: string | null
  host_name: string | null
  host_email: string | null
  host_phone: string | null
  guest_name: string | null
  host_alert_count: number
}

const FILTER_LABEL: Record<ListFilter, string> = {
  open: 'Open',
  handled: 'Handled',
  closed: 'Closed',
  all: 'All',
}

const STATUS_COLOR: Record<string, string> = {
  open: '#B26A00',
  handled: '#1A56A8',
  resolved: COLORS.green,
  expired: COLORS.muted,
}

export function OpsHostResponse({ initial }: { initial: HostAlert[] }) {
  const [alerts, setAlerts] = useState<HostAlert[]>(initial)
  const [filter, setFilter] = useState<ListFilter>('open')
  const [note, setNote] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [now, setNow] = useState(() => 0)

  // Date.now() only after mount, so the relative "waited" labels can't mismatch
  // the server render.
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const raf = requestAnimationFrame(tick)
    const id = setInterval(tick, 60_000)
    return () => { cancelAnimationFrame(raf); clearInterval(id) }
  }, [])

  const load = useCallback(async (next: ListFilter) => {
    const res = await adminGet<{ alerts: HostAlert[] }>(`host-response-alerts?status=${next}`)
    if (res === 'forbidden') { setError('Your account does not have the Bookings module.'); return }
    if (!res) { setError('Could not load alerts. Please retry.'); return }
    setError(null)
    setAlerts(res.alerts ?? [])
  }, [])

  const changeFilter = (next: ListFilter) => {
    if (next === filter) return
    setFilter(next)
    void load(next)
  }

  const markHandled = async (a: HostAlert) => {
    const text = note[a.id]?.trim()
    if (!text) { setError('Add a note saying what you did first (e.g. "called the host").'); return }
    setBusy(a.id); setError(null)
    const res = await adminSend<{ ok?: boolean; error?: string }>('host-response-alerts', 'POST', { id: a.id, note: text })
    setBusy(null)
    if (!res.ok) {
      setError((res.data as { error?: string })?.error ?? 'That did not work')
      if (res.status === 409) await load(filter)
      return
    }
    setNote((n) => ({ ...n, [a.id]: '' }))
    await load(filter)
    setFlash(`Marked handled — ${a.listing_title ?? 'request'}`)
    setTimeout(() => setFlash(null), 5000)
  }

  const clock = now || Date.now()

  return (
    <main style={pageStyle}>
      <section style={{ maxWidth: 1150, margin: '0 auto', padding: '24px 20px 64px' }}>
        <h1 style={{ margin: '0 0 4px', fontFamily: SERIF, fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', color: COLORS.burgundy }}>
          Host response
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: COLORS.muted }}>
          Booking requests a host has neither accepted nor declined after 24 hours. Checked every
          night around 3 AM Cairo; the host is reminded each night too. An alert closes by itself once
          the host answers or the check-in date passes.
        </p>

        {flash && <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.green, fontSize: 13, fontWeight: 700 }}>{flash}</div>}
        {error && <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.red, fontSize: 13, fontWeight: 700 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {LIST_FILTERS.map((f) => (
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
                  <th style={th}>Waiting</th>
                  <th style={th}>Host</th>
                  <th style={th}>Request</th>
                  <th style={th}>Reminders</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, minWidth: 260 }} />
                </tr>
              </thead>
              <tbody>
                {alerts.length === 0 ? (
                  <EmptyRow
                    colSpan={6}
                    tone={filter === 'open' ? 'clear' : 'filtered'}
                    title={filter === 'open' ? 'Every host has answered' : 'Nothing here'}
                    body={filter === 'open' ? 'No booking request has waited more than 24 hours as of the last nightly check.' : 'No alerts match this filter.'}
                  />
                ) : alerts.map((a) => (
                  <tr key={a.id}>
                    <td style={td}>
                      <strong>{waitingLabel(a.requested_at, clock)}</strong>
                      <div style={{ fontSize: 11, color: COLORS.muted }}>requested {a.requested_at.slice(0, 10)}</div>
                    </td>
                    <td style={td}>
                      <div style={{ fontWeight: 700 }}>{a.host_name || '—'}</div>
                      <div style={{ fontSize: 12, color: COLORS.muted }}>
                        {a.host_phone ? <a href={`tel:${a.host_phone}`}>{a.host_phone}</a> : null}
                        {a.host_phone && a.host_email ? ' · ' : null}
                        {a.host_email ? <a href={`mailto:${a.host_email}`}>{a.host_email}</a> : null}
                      </div>
                      {a.host_alert_count > 1 && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.red, marginTop: 2 }}>
                          {a.host_alert_count} unanswered requests so far
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      <div style={{ fontWeight: 700 }}>{a.listing_title || 'Listing'}</div>
                      <div style={{ fontSize: 12, color: COLORS.muted }}>
                        {a.check_in} → {a.check_out} · {a.guests} guest{a.guests === 1 ? '' : 's'}
                        {a.guest_name ? ` · ${a.guest_name}` : ''}
                      </div>
                    </td>
                    <td style={td}>{a.nudge_count}</td>
                    <td style={td}>
                      <span style={{ fontWeight: 700, color: STATUS_COLOR[a.status] ?? COLORS.muted, textTransform: 'capitalize' }}>
                        {a.status}
                      </span>
                      {a.closed_reason && (
                        <div style={{ fontSize: 11, color: COLORS.muted }}>{closedReasonLabel(a.closed_reason)}</div>
                      )}
                    </td>
                    <td style={td}>
                      {a.status === 'open' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            value={note[a.id] ?? ''}
                            onChange={(e) => setNote((n) => ({ ...n, [a.id]: e.target.value }))}
                            maxLength={HANDLED_NOTE_MAX}
                            placeholder="What did you do?"
                            aria-label="Handling note"
                            style={{ ...controlStyle, flex: 1, minWidth: 0 }}
                          />
                          <button
                            onClick={() => markHandled(a)}
                            disabled={busy === a.id}
                            style={{ ...solidBtn, opacity: busy === a.id ? 0.6 : 1 }}
                          >
                            {busy === a.id ? 'Saving…' : 'Mark handled'}
                          </button>
                        </div>
                      ) : a.handled_note ? (
                        <div style={{ fontSize: 12 }}>
                          “{a.handled_note}”
                          <div style={{ fontSize: 11, color: COLORS.muted }}>
                            {a.handled_by_name ?? 'staff'}{a.handled_at ? ` · ${a.handled_at.slice(0, 10)}` : ''}
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}
