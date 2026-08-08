'use client'

// Abuse-report triage (F4).
//
// Reports are filed by real users about real people, so the target is resolved to a
// name server-side and linked — a moderator should never have to paste a uuid
// somewhere to find out who they're deciding about.
import { useCallback, useEffect, useState } from 'react'
import { COLORS, SERIF } from '../../ops-theme'
import { EmptyRow, adminGet, adminSend, btnBase, ghostBtn, pageStyle, panelStyle, solidBtn, td, th } from '../ops-ui'
import { waitingLabel } from '@/lib/local/activity-core'

type Report = {
  id: string
  reporter_id: string | null
  reporter_name: string | null
  reporter_email: string | null
  target_type: string
  target_id: string
  target_label: string | null
  reason: string | null
  details: string | null
  status: string
  created_at: string
  resolved_at: string | null
}

const FILTERS = ['open', 'resolved', 'dismissed', 'all'] as const

function targetHref(r: Report): string | null {
  if (r.target_type === 'user') return `/ops/users/${r.target_id}`
  if (r.target_type === 'listing') return `/explore/${r.target_id}`
  return null
}

export function OpsReports({ initial }: { initial: Report[] }) {
  const [reports, setReports] = useState<Report[]>(initial)
  const [status, setStatus] = useState<(typeof FILTERS)[number]>('open')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [now, setNow] = useState(() => 0)

  useEffect(() => { setNow(Date.now()) }, [reports])

  const load = useCallback(async (next: string) => {
    const res = await adminGet<{ reports: Report[] }>(`reports?status=${next}`)
    if (res === 'forbidden') { setError('Your account does not have the Reports module.'); return }
    if (!res) { setError('Could not load reports. Please retry.'); return }
    setError(null)
    setReports(res.reports ?? [])
  }, [])

  const primed = useState(() => ({ done: false }))[0]
  useEffect(() => {
    if (!primed.done) { primed.done = true; if (status === 'open') return }
    void load(status)
  }, [status, load, primed])

  const decide = async (r: Report, action: 'resolve' | 'dismiss') => {
    setBusy(r.id); setError(null)
    const res = await adminSend<{ ok?: boolean; error?: string }>('reports', 'POST', { id: r.id, action })
    setBusy(null)
    if (!res.ok) { setError((res.data as { error?: string })?.error ?? 'That did not work'); return }
    await load(status)
    setFlash(action === 'resolve' ? 'Report resolved' : 'Report dismissed')
    setTimeout(() => setFlash(null), 4000)
  }

  return (
    <main style={pageStyle}>
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 64px' }}>
        <h1 style={{ margin: '0 0 4px', fontFamily: SERIF, fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', color: COLORS.burgundy }}>
          Reports
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: COLORS.muted }}>
          Abuse reports filed by guests and hosts about a user, a listing or a review.
        </p>

        {flash && <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.green, fontSize: 13, fontWeight: 700 }}>{flash}</div>}
        {error && <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.red, fontSize: 13, fontWeight: 700 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatus(f)}
              style={{
                ...btnBase,
                background: status === f ? COLORS.burgundy : 'transparent',
                color: status === f ? COLORS.cream : COLORS.ink,
                border: `1px solid ${status === f ? COLORS.burgundy : COLORS.tan}`,
                textTransform: 'capitalize',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        <div style={panelStyle}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>Filed</th>
                  <th style={th}>Reported by</th>
                  <th style={th}>About</th>
                  <th style={th}>Reason</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, width: 1 }} />
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => {
                  const href = targetHref(r)
                  return (
                    <tr key={r.id}>
                      <td style={{ ...td, whiteSpace: 'nowrap', color: COLORS.muted }}>
                        {waitingLabel(r.created_at, now || Date.now())} ago
                      </td>
                      <td style={td}>
                        {r.reporter_id ? (
                          <a href={`/ops/users/${r.reporter_id}`} style={{ color: COLORS.burgundy, textDecoration: 'none' }}>
                            {r.reporter_name || r.reporter_email || '—'}
                          </a>
                        ) : (r.reporter_name || r.reporter_email || '—')}
                      </td>
                      <td style={td}>
                        <span style={{ color: COLORS.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                          {r.target_type}
                        </span>
                        <br />
                        {href ? (
                          <a href={href} style={{ color: COLORS.burgundy, textDecoration: 'none', fontWeight: 700 }}>
                            {r.target_label || r.target_id.slice(0, 8)}
                          </a>
                        ) : (r.target_label || r.target_id.slice(0, 8))}
                      </td>
                      <td style={td}>
                        <strong>{r.reason || '—'}</strong>
                        {r.details ? <p style={{ margin: '2px 0 0', color: COLORS.muted, whiteSpace: 'pre-wrap' }}>{r.details}</p> : null}
                      </td>
                      <td style={td}>{r.status}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {r.status === 'open' ? (
                          <span style={{ display: 'flex', gap: 8 }}>
                            <button type="button" disabled={busy === r.id} onClick={() => decide(r, 'resolve')} style={{ ...solidBtn, padding: '7px 14px', fontSize: 12 }}>
                              {busy === r.id ? 'Working…' : 'Resolve'}
                            </button>
                            <button type="button" disabled={busy === r.id} onClick={() => decide(r, 'dismiss')} style={{ ...ghostBtn, padding: '7px 14px', fontSize: 12 }}>
                              Dismiss
                            </button>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
                {reports.length === 0 && (
                  status === 'open' ? (
                    <EmptyRow
                      colSpan={6}
                      tone="clear"
                      title="Nothing to triage"
                      body="Every report guests have filed has been actioned or dismissed."
                    />
                  ) : (
                    <EmptyRow
                      colSpan={6}
                      tone="filtered"
                      title={`No ${status} reports`}
                      body="Switch the status above to see reports in another state."
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
