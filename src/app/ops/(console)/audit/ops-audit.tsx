'use client'

// The staff audit trail (F2) — who did what, when, and from where.
//
// Rows are never mutable and never deleted: this is the record you reach for when
// something went wrong, so it is deliberately read-only with no bulk actions.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { COLORS, SERIF } from '../../ops-theme'
import { ClearFilters, EmptyRow, adminGet, controlStyle, fieldLabel, ghostBtn, pageStyle, panelStyle, td, th } from '../ops-ui'
import {
  AUDIT_TARGET_TYPES,
  DEFAULT_ACTIVITY_LIMIT,
  actorLabel,
  auditActionLabel,
  isFailureAction,
} from '@/lib/local/activity-core'

type AuditEntry = {
  id: string
  at: string
  staff_id: string | null
  staff_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  detail: unknown
  ip: string | null
}

type Filters = { q: string; action: string; targetType: string; from: string; to: string; offset: number }

function fmt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** The detail blob, flattened to something skimmable. Full JSON on hover. */
function summarise(detail: unknown): string {
  if (!detail || typeof detail !== 'object') return ''
  const entries = Object.entries(detail as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
  return entries.join(' · ')
}

export function OpsAudit({
  initial,
  actions,
}: {
  initial: { entries: AuditEntry[]; hasMore: boolean }
  actions: string[]
}) {
  const [entries, setEntries] = useState<AuditEntry[]>(initial.entries)
  const [hasMore, setHasMore] = useState(initial.hasMore)
  const [actionList, setActionList] = useState<string[]>(actions)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>({ q: '', action: '', targetType: '', from: '', to: '', offset: 0 })

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === search.trim() ? f : { ...f, q: search.trim(), offset: 0 }))
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const set = useCallback((patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch, offset: patch.offset ?? 0 }))
  }, [])

  /** An untouched audit log and a filtered-to-nothing one look identical in a table
   *  but mean opposite things, so the empty state asks which one this is. */
  const narrowed =
    filters.q !== '' || filters.action !== '' || filters.targetType !== '' || filters.from !== '' || filters.to !== ''

  const clearFilters = useCallback(() => {
    setSearch('')
    setFilters({ q: '', action: '', targetType: '', from: '', to: '', offset: 0 })
  }, [])

  const query = useMemo(() => {
    const p = new URLSearchParams({ limit: String(DEFAULT_ACTIVITY_LIMIT), offset: String(filters.offset) })
    if (filters.q) p.set('q', filters.q)
    if (filters.action) p.set('action', filters.action)
    if (filters.targetType) p.set('target_type', filters.targetType)
    if (filters.from) p.set('from', filters.from)
    if (filters.to) p.set('to', filters.to)
    return p.toString()
  }, [filters])

  const primed = useRef(false)
  useEffect(() => {
    if (!primed.current) {
      primed.current = true
      if (query === `limit=${DEFAULT_ACTIVITY_LIMIT}&offset=0`) return
    }
    let cancelled = false
    setLoading(true)
    adminGet<{ entries: AuditEntry[]; hasMore: boolean; actions: string[]; error?: string }>(`audit?${query}`).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res === 'forbidden') { setError('The audit log is restricted to super admins.'); return }
      if (!res) { setError('Could not load the audit log. Please retry.'); return }
      setError(null)
      setEntries(res.entries ?? [])
      setHasMore(Boolean(res.hasMore))
      if (res.actions?.length) setActionList(res.actions)
    })
    return () => { cancelled = true }
  }, [query])

  const from = entries.length ? filters.offset + 1 : 0
  const to = filters.offset + entries.length

  return (
    <main style={pageStyle}>
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 20px 64px' }}>
        <h1 style={{ margin: '0 0 4px', fontFamily: SERIF, fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', color: COLORS.burgundy }}>
          Audit log
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: COLORS.muted }}>
          Every action taken in this console — who did it, when, and from where. Read-only,
          and never deleted.
        </p>

        {error && <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.red, fontSize: 13, fontWeight: 700 }}>{error}</div>}

        <div style={{ ...panelStyle, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ flex: '2 1 200px' }}>
            <span style={fieldLabel}>Staff member</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Email" style={controlStyle} />
          </label>
          <label style={{ flex: '1 1 200px' }}>
            <span style={fieldLabel}>Action</span>
            <select value={filters.action} onChange={(e) => set({ action: e.target.value })} style={controlStyle}>
              <option value="">Any action</option>
              {actionList.map((a) => <option key={a} value={a}>{auditActionLabel(a)}</option>)}
            </select>
          </label>
          <label style={{ flex: '1 1 140px' }}>
            <span style={fieldLabel}>Target</span>
            <select value={filters.targetType} onChange={(e) => set({ targetType: e.target.value })} style={controlStyle}>
              <option value="">Anything</option>
              {AUDIT_TARGET_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label style={{ flex: '1 1 130px' }}>
            <span style={fieldLabel}>From</span>
            <input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} style={controlStyle} />
          </label>
          <label style={{ flex: '1 1 130px' }}>
            <span style={fieldLabel}>To</span>
            <input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} style={controlStyle} />
          </label>
        </div>

        <div style={{ ...panelStyle, marginTop: 14, opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>When</th>
                  <th style={th}>Who</th>
                  <th style={th}>Action</th>
                  <th style={th}>Target</th>
                  <th style={th}>Detail</th>
                  <th style={th}>IP</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: COLORS.muted }}>{fmt(e.at)}</td>
                    <td style={td}>{e.staff_email || actorLabel(e.staff_id)}</td>
                    <td style={{ ...td, fontWeight: 700, color: isFailureAction(e.action) ? COLORS.red : COLORS.ink }}>
                      {auditActionLabel(e.action)}
                    </td>
                    <td style={td}>
                      {e.target_type === 'user' && e.target_id ? (
                        <a href={`/ops/users/${e.target_id}`} style={{ color: COLORS.burgundy, textDecoration: 'none' }}>
                          user · {e.target_id.slice(0, 8)}
                        </a>
                      ) : e.target_type ? (
                        <span style={{ color: COLORS.muted }}>
                          {e.target_type.replace(/_/g, ' ')}{e.target_id ? ` · ${e.target_id.slice(0, 8)}` : ''}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ ...td, maxWidth: 320, color: COLORS.muted }} title={e.detail ? JSON.stringify(e.detail) : ''}>
                      {summarise(e.detail) || '—'}
                    </td>
                    <td style={{ ...td, color: COLORS.muted, whiteSpace: 'nowrap' }}>{e.ip || '—'}</td>
                  </tr>
                ))}
                {entries.length === 0 && !loading && (
                  narrowed ? (
                    <EmptyRow
                      colSpan={6}
                      tone="filtered"
                      title="No entries match these filters"
                      body="The log has entries outside the action, target or date range you picked."
                      meta={<ClearFilters onClear={clearFilters} />}
                    />
                  ) : (
                    <EmptyRow
                      colSpan={6}
                      tone="blank"
                      title="No staff actions logged yet"
                      body="Every approval, ban and settings change a moderator makes is recorded here."
                    />
                  )
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: COLORS.muted }}>
              {entries.length === 0 ? 'No entries' : `Showing ${from}–${to}`}
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={filters.offset === 0 || loading}
                onClick={() => setFilters((f) => ({ ...f, offset: Math.max(0, f.offset - DEFAULT_ACTIVITY_LIMIT) }))}
                style={{ ...ghostBtn, opacity: filters.offset === 0 ? 0.4 : 1 }}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!hasMore || loading}
                onClick={() => setFilters((f) => ({ ...f, offset: f.offset + DEFAULT_ACTIVITY_LIMIT }))}
                style={{ ...ghostBtn, opacity: hasMore ? 1 : 0.4 }}
              >
                Next
              </button>
            </span>
          </div>
        </div>
      </section>
    </main>
  )
}
