'use client'

// Staff table + create/edit dialog (A2, A3).
//
// Shape ported from src/app/admin/staff/ (the Supabase screen), including its
// self-protection: rows for your own account hide the destructive actions. That is
// cosmetic only — accounts/[id]/route.ts enforces the same rules, plus the
// last-super-admin guard, server-side.
//
// Styled with the /ops inline palette rather than shadcn/ui, matching the rest of the
// console. See ../../ops-theme.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { COLORS, FONT, SERIF, cardStyle, inputStyle, labelStyle } from '../../ops-theme'
import { EmptyRow } from '../ops-ui'

type Account = {
  id: string
  email: string
  full_name: string
  role: 'super_admin' | 'moderator'
  is_active: boolean
  last_login_at: string | null
  locked_until: string | null
  failed_login_attempts: number
  created_at: string
  created_by_email: string | null
  modules: string[]
  active_sessions: number
}

type ModuleDef = { key: string; label: string; description: string }

type Draft = {
  id: string | null
  email: string
  full_name: string
  role: 'super_admin' | 'moderator'
  password: string
  modules: string[]
}

const emptyDraft = (): Draft => ({
  id: null,
  email: '',
  full_name: '',
  role: 'moderator',
  password: '',
  modules: [],
})

const btn = (variant: 'solid' | 'ghost' | 'danger'): React.CSSProperties => ({
  padding: '8px 13px',
  borderRadius: 11,
  fontSize: 13,
  fontWeight: 700,
  fontFamily: FONT,
  cursor: 'pointer',
  border: variant === 'ghost' ? '1px solid rgba(42,34,32,0.16)' : 'none',
  background: variant === 'solid' ? COLORS.burgundy : variant === 'danger' ? COLORS.red : 'transparent',
  color: variant === 'ghost' ? COLORS.muted : COLORS.cream,
})

const pill = (bg: string, fg: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '3px 9px',
  borderRadius: 999,
  background: bg,
  color: fg,
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: 'nowrap',
})

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 12,
  fontWeight: 700,
  color: COLORS.muted,
  borderBottom: '1px solid rgba(42,34,32,0.08)',
  whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '12px',
  fontSize: 13,
  color: COLORS.ink,
  borderBottom: '1px solid rgba(42,34,32,0.05)',
  verticalAlign: 'top',
}

function fmt(ts: string | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

export function StaffClient({
  initialAccounts,
  grantable,
  currentStaffId,
}: {
  initialAccounts: Account[]
  grantable: ModuleDef[]
  currentStaffId: string | null
}) {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Account | null>(null)

  const moduleLabels = useMemo(
    () => Object.fromEntries(grantable.map((m) => [m.key, m.label])),
    [grantable]
  )

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/local/staff/accounts', { credentials: 'same-origin', cache: 'no-store' })
      if (res.status === 401 || res.status === 403) {
        window.location.href = '/ops/login?reason=expired'
        return
      }
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data?.accounts)) setAccounts(data.accounts)
    } catch {
      /* keep whatever is on screen */
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const say = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(null), 4000)
  }

  /** One helper for every mutation: PATCH/POST/DELETE, then refresh. */
  const call = useCallback(
    async (url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, ok?: string) => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(url, {
          method,
          credentials: 'same-origin',
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data?.error ?? `Request failed (${res.status})`)
          return false
        }
        await refresh()
        if (ok) say(ok)
        return true
      } catch {
        setError('Network error. Please try again.')
        return false
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft) return
    if (draft.id) {
      const body: Record<string, unknown> = {
        full_name: draft.full_name,
        role: draft.role,
        modules: draft.modules,
      }
      // Only send a password when one was typed — an empty field means "leave it".
      if (draft.password) body.password = draft.password
      if (await call(`/api/local/staff/accounts/${draft.id}`, 'PATCH', body, 'Account updated')) {
        setDraft(null)
      }
    } else {
      const created = await call(
        '/api/local/staff/accounts',
        'POST',
        {
          email: draft.email,
          password: draft.password,
          full_name: draft.full_name,
          role: draft.role,
          modules: draft.modules,
        },
        'Moderator created'
      )
      if (created) setDraft(null)
    }
  }

  const toggleModule = (key: string) =>
    setDraft((d) =>
      d ? { ...d, modules: d.modules.includes(key) ? d.modules.filter((m) => m !== key) : [...d.modules, key] } : d
    )

  const allSelected = Boolean(draft && draft.modules.length === grantable.length)

  return (
    <main style={{ minHeight: '100vh', background: COLORS.cream, color: COLORS.ink, fontFamily: FONT }}>

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 72px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <h1
              style={{
                margin: '0 0 6px',
                fontFamily: SERIF,
                fontSize: 'clamp(24px, 4vw, 32px)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: COLORS.burgundy,
              }}
            >
              Staff &amp; permissions
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: COLORS.muted }}>
              Create moderators and choose exactly which modules each one can use.
            </p>
          </div>
          <button type="button" onClick={() => setDraft(emptyDraft())} style={{ ...btn('solid'), padding: '11px 18px', fontSize: 14 }}>
            + Add moderator
          </button>
        </div>

        {flash && (
          <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 12, background: 'rgba(46,125,91,0.10)', color: COLORS.green, fontSize: 13, fontWeight: 700 }}>
            {flash}
          </div>
        )}
        {error && (
          <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 12, background: 'rgba(179,38,30,0.08)', color: COLORS.red, fontSize: 13, fontWeight: 700 }}>
            {error}
          </div>
        )}

        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={th}>Account</th>
                  <th style={th}>Role</th>
                  <th style={th}>Modules</th>
                  <th style={th}>Status</th>
                  <th style={th}>Last sign-in</th>
                  <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.length === 0 && (
                  <EmptyRow
                    colSpan={6}
                    tone="blank"
                    title="Add your first moderator"
                    body="Moderators sign in at /ops with only the modules you grant them. Super admins always see everything."
                    action={{ label: 'Add moderator', onClick: () => setDraft(emptyDraft()) }}
                  />
                )}
                {accounts.map((a) => {
                  const self = currentStaffId === a.id
                  const locked = Boolean(a.locked_until && Date.parse(a.locked_until) > Date.now())
                  return (
                    <tr key={a.id}>
                      <td style={td}>
                        <div style={{ fontWeight: 700 }}>{a.full_name}</div>
                        <div style={{ color: COLORS.muted, fontSize: 12 }}>{a.email}</div>
                        {self && <div style={{ marginTop: 4 }}><span style={pill('rgba(91,15,22,0.08)', COLORS.burgundy)}>you</span></div>}
                      </td>
                      <td style={td}>
                        {a.role === 'super_admin' ? (
                          <span style={pill('rgba(91,15,22,0.10)', COLORS.burgundy)}>Super admin</span>
                        ) : (
                          <span style={pill('rgba(42,34,32,0.07)', COLORS.muted)}>Moderator</span>
                        )}
                      </td>
                      <td style={{ ...td, maxWidth: 280 }}>
                        {a.role === 'super_admin' ? (
                          <span style={{ color: COLORS.muted, fontSize: 12 }}>All modules</span>
                        ) : a.modules.length === 0 ? (
                          <span style={{ color: COLORS.red, fontSize: 12, fontWeight: 700 }}>No access</span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {a.modules.map((m) => (
                              <span key={m} style={pill('rgba(42,34,32,0.06)', COLORS.ink)}>
                                {moduleLabels[m] ?? m}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        {a.is_active ? (
                          <span style={pill('rgba(46,125,91,0.12)', COLORS.green)}>Active</span>
                        ) : (
                          <span style={pill('rgba(179,38,30,0.10)', COLORS.red)}>Inactive</span>
                        )}
                        {locked && (
                          <div style={{ marginTop: 4 }}>
                            <span style={pill('rgba(179,38,30,0.10)', COLORS.red)}>
                              locked · {a.failed_login_attempts} fails
                            </span>
                          </div>
                        )}
                        {a.active_sessions > 0 && (
                          <div style={{ marginTop: 4, color: COLORS.muted, fontSize: 11 }}>
                            {a.active_sessions} live session{a.active_sessions === 1 ? '' : 's'}
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, color: COLORS.muted, fontSize: 12 }}>{fmt(a.last_login_at)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setDraft({
                                id: a.id,
                                email: a.email,
                                full_name: a.full_name,
                                role: a.role,
                                password: '',
                                modules: [...a.modules],
                              })
                            }
                            style={btn('ghost')}
                          >
                            Edit
                          </button>
                          {locked && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => call(`/api/local/staff/accounts/${a.id}`, 'PATCH', { is_active: true }, 'Lock cleared')}
                              style={btn('ghost')}
                              title="Clearing the lock resets the failed-attempt counter"
                            >
                              Unlock
                            </button>
                          )}
                          {a.active_sessions > 0 && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => call(`/api/local/staff/accounts/${a.id}`, 'PATCH', { action: 'force_logout' }, 'Sessions revoked')}
                              style={btn('ghost')}
                            >
                              Force logout
                            </button>
                          )}
                          {/* Self-protection: mirrors the server-side guard. */}
                          {!self && (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  call(
                                    `/api/local/staff/accounts/${a.id}`,
                                    'PATCH',
                                    { is_active: !a.is_active },
                                    a.is_active ? 'Account deactivated' : 'Account activated'
                                  )
                                }
                                style={btn('ghost')}
                              >
                                {a.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                              <button type="button" disabled={busy} onClick={() => setConfirmDelete(a)} style={btn('danger')}>
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p style={{ margin: '18px 0 0', fontSize: 12, color: COLORS.muted, lineHeight: 1.6 }}>
          Deactivating an account, changing its password, or forcing a logout ends its live
          sessions immediately. Changing modules takes effect on the moderator&apos;s next action —
          no sign-out needed. You cannot deactivate, demote or delete your own account, or remove
          the last active super admin.
        </p>
      </section>

      {/* ---- Create / edit dialog ---- */}
      {draft && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={draft.id ? 'Edit staff account' : 'Add moderator'}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(42,34,32,0.45)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '5vh 16px',
            overflowY: 'auto',
            zIndex: 50,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setDraft(null) }}
        >
          <form
            onSubmit={save}
            style={{ ...cardStyle, width: '100%', maxWidth: 560, padding: '26px 24px' }}
          >
            <h2 style={{ margin: '0 0 4px', fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: COLORS.burgundy }}>
              {draft.id ? 'Edit account' : 'Add moderator'}
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: COLORS.muted }}>
              {draft.id ? draft.email : 'They will sign in at /ops/login with these credentials.'}
            </p>

            {!draft.id && (
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="d-email" style={labelStyle}>Email</label>
                <input
                  id="d-email"
                  type="email"
                  required
                  autoFocus
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  style={inputStyle}
                />
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label htmlFor="d-name" style={labelStyle}>Full name</label>
              <input
                id="d-name"
                required
                value={draft.full_name}
                onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label htmlFor="d-password" style={labelStyle}>
                {draft.id ? 'New password (leave blank to keep the current one)' : 'Password'}
              </label>
              <input
                id="d-password"
                type="password"
                required={!draft.id}
                autoComplete="new-password"
                value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                style={inputStyle}
              />
              <p style={{ margin: '6px 0 0', fontSize: 12, color: COLORS.muted }}>
                At least 10 characters, with a letter and a digit.
                {draft.id ? ' Changing it signs this account out everywhere.' : ''}
              </p>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label htmlFor="d-role" style={labelStyle}>Role</label>
              <select
                id="d-role"
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value === 'super_admin' ? 'super_admin' : 'moderator' })}
                style={inputStyle}
              >
                <option value="moderator">Moderator — only the modules you pick</option>
                <option value="super_admin">Super admin — full access to everything</option>
              </select>
            </div>

            {/* ---- The permission picker (A3) ---- */}
            {draft.role === 'moderator' ? (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ ...labelStyle, marginBottom: 0 }}>Modules</span>
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, modules: allSelected ? [] : grantable.map((m) => m.key) })}
                    style={{ ...btn('ghost'), padding: '5px 10px', fontSize: 12 }}
                  >
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 8,
                    maxHeight: 260,
                    overflowY: 'auto',
                    padding: 4,
                  }}
                >
                  {grantable.map((m) => {
                    const on = draft.modules.includes(m.key)
                    return (
                      <label
                        key={m.key}
                        style={{
                          display: 'flex',
                          gap: 9,
                          alignItems: 'flex-start',
                          padding: '10px 11px',
                          borderRadius: 12,
                          border: `1px solid ${on ? COLORS.burgundy : 'rgba(42,34,32,0.12)'}`,
                          background: on ? 'rgba(91,15,22,0.04)' : '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleModule(m.key)}
                          style={{ marginTop: 2, accentColor: COLORS.burgundy }}
                        />
                        <span>
                          <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{m.label}</span>
                          <span style={{ display: 'block', fontSize: 11, color: COLORS.muted, lineHeight: 1.4 }}>
                            {m.description}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
                {draft.modules.length === 0 && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: COLORS.red, fontWeight: 700 }}>
                    With no modules selected this account can sign in but see nothing.
                  </p>
                )}
              </div>
            ) : (
              <p style={{ margin: '0 0 20px', fontSize: 13, color: COLORS.muted }}>
                Super admins have access to every module, including staff management.
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setDraft(null)} style={{ ...btn('ghost'), padding: '11px 18px', fontSize: 14 }}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                style={{ ...btn('solid'), padding: '11px 20px', fontSize: 14, opacity: busy ? 0.6 : 1 }}
              >
                {busy ? 'Saving…' : draft.id ? 'Save changes' : 'Create moderator'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---- Delete confirmation ---- */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(42,34,32,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 60,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null) }}
        >
          <div style={{ ...cardStyle, width: '100%', maxWidth: 420, padding: '24px' }}>
            <h2 style={{ margin: '0 0 8px', fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: COLORS.burgundy }}>
              Delete this account?
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: COLORS.muted, lineHeight: 1.6 }}>
              <strong style={{ color: COLORS.ink }}>{confirmDelete.email}</strong> will be removed
              along with its permissions and sessions. Its entries in the audit log are kept.
              Deactivating instead preserves the account.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setConfirmDelete(null)} style={{ ...btn('ghost'), padding: '11px 18px', fontSize: 14 }}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const id = confirmDelete.id
                  setConfirmDelete(null)
                  await call(`/api/local/staff/accounts/${id}`, 'DELETE', undefined, 'Account deleted')
                }}
                style={{ ...btn('danger'), padding: '11px 18px', fontSize: 14, opacity: busy ? 0.6 : 1 }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
