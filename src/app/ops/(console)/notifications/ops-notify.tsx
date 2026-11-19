'use client'

// Send a notification to specific users or a segment.
//
// Every send writes an in-app notification (the bell) for each recipient, pushes to
// their registered iOS/Android devices, and optionally emails them. Search is
// server-side and debounced; the picked list survives new searches so an operator can
// gather several people one query at a time.
import { useEffect, useMemo, useState } from 'react'
import { COLORS, SERIF } from '../../ops-theme'
import { adminGet, adminSend, controlStyle, fieldLabel, ghostBtn, pageStyle, panelStyle, solidBtn } from '../ops-ui'

type Recipient = {
  id: string
  email: string | null
  full_name: string | null
  role: string
  phone: string | null
  device_count: number
}
type Mode = 'users' | 'all' | 'guests' | 'hosts'
type Result = { recipients: number; emailed: number; with_device: number; skipped: string[] }

const TITLE_MAX = 120
const BODY_MAX = 500
const MAX_USERS = 200

const MODE_LABEL: Record<Mode, string> = {
  users: 'Specific users',
  all: 'Everyone',
  guests: 'All guests',
  hosts: 'All hosts',
}

const roleLabel = (r: string) => (r === 'host' ? 'Host' : r === 'admin' ? 'Admin' : 'Guest')

export function OpsNotify() {
  const [mode, setMode] = useState<Mode>('users')
  const [search, setSearch] = useState('')
  // Results are tagged with the query they answer, so "searching" is derived
  // (the answer is for an older query) rather than set inside the effect.
  const [found, setFound] = useState<{ q: string; users: Recipient[] }>({ q: '', users: [] })
  const [picked, setPicked] = useState<Recipient[]>([])

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [link, setLink] = useState('')
  const [push, setPush] = useState(true)
  const [email, setEmail] = useState(false)

  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  // Debounced server-side search. `cancelled` stops a slow early response from
  // overwriting a fast later one.
  const query = search.trim()
  useEffect(() => {
    if (query.length < 2) return
    let cancelled = false
    const t = setTimeout(() => {
      adminGet<{ users: Recipient[] }>(`notify/recipients?q=${encodeURIComponent(query)}`).then((res) => {
        if (cancelled) return
        if (res === 'forbidden') setError('Your account does not have the Broadcasts module.')
        setFound({ q: query, users: res && res !== 'forbidden' ? res.users ?? [] : [] })
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])
  const searching = query.length >= 2 && found.q !== query
  const results = found.users

  const pickedIds = useMemo(() => new Set(picked.map((p) => p.id)), [picked])
  const toggle = (u: Recipient) =>
    setPicked((list) => (list.some((p) => p.id === u.id) ? list.filter((p) => p.id !== u.id) : [...list, u]))

  const noDevice = picked.filter((p) => p.device_count === 0).length
  const canSend =
    !sending &&
    title.trim().length > 0 &&
    (mode !== 'users' || (picked.length > 0 && picked.length <= MAX_USERS))

  async function send() {
    if (!canSend) return
    const who =
      mode === 'users'
        ? `${picked.length} user${picked.length === 1 ? '' : 's'}`
        : MODE_LABEL[mode].toLowerCase()
    const channels = ['in-app', push && 'push', email && 'email'].filter(Boolean).join(' + ')
    if (!window.confirm(`Send “${title.trim()}” to ${who} (${channels})?`)) return

    setSending(true)
    setError(null)
    setResult(null)
    const payload: Record<string, unknown> = { title: title.trim(), body: body.trim(), link: link.trim(), push, email }
    if (mode === 'users') payload.user_ids = picked.map((p) => p.id)
    else payload.audience = mode
    const res = await adminSend<Result>('notify', 'POST', payload)
    setSending(false)
    if (!res.ok) {
      const msg = (res.data as { error?: string })?.error
      setError(res.status === 403 ? 'Your account does not have the Broadcasts module.' : msg || 'Could not send. Please retry.')
      return
    }
    setResult(res.data as Result)
  }

  function reset() {
    setResult(null)
    setTitle('')
    setBody('')
    setLink('')
    setPicked([])
    setSearch('')
  }

  const input: React.CSSProperties = { ...controlStyle, width: '100%', fontSize: 14, padding: '10px 12px', boxSizing: 'border-box' }

  return (
    <main style={pageStyle}>
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '24px 20px 64px' }}>
        <h1 style={{ margin: '0 0 4px', fontFamily: SERIF, fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', color: COLORS.burgundy }}>
          Notifications
        </h1>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: COLORS.muted }}>
          Send a push notification to specific users or a whole segment. Every recipient also gets it in their in-app
          notifications. Suspended and removed accounts are always skipped.
        </p>

        {result ? (
          <div style={{ ...panelStyle, borderLeft: `4px solid ${COLORS.green}` }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.green, marginBottom: 6 }}>Sent</div>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>
              Delivered in-app to <b>{result.recipients}</b> user{result.recipients === 1 ? '' : 's'}.
              {push && <> Pushed to <b>{result.with_device}</b> with a registered phone.</>}
              {email && <> Emailed <b>{result.emailed}</b>.</>}
            </div>
            {result.skipped.length > 0 && (
              <div style={{ fontSize: 13, color: COLORS.red, marginTop: 6 }}>
                {result.skipped.length} picked account{result.skipped.length === 1 ? ' was' : 's were'} skipped (suspended
                or removed).
              </div>
            )}
            <button type="button" onClick={reset} style={{ ...solidBtn, marginTop: 14 }}>Send another</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {/* Who */}
            <div style={panelStyle}>
              <span style={fieldLabel}>Send to</span>
              <div role="radiogroup" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: mode === 'users' ? 14 : 0 }}>
                {(Object.keys(MODE_LABEL) as Mode[]).map((m) => {
                  const on = mode === m
                  return (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setMode(m)}
                      style={on ? solidBtn : ghostBtn}
                    >
                      {MODE_LABEL[m]}
                    </button>
                  )
                })}
              </div>

              {mode === 'users' && (
                <>
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, email or phone"
                    aria-label="Search users"
                    style={input}
                  />
                  {search.trim().length >= 2 && (
                    <div style={{ marginTop: 8, border: '1px solid rgba(42,34,32,0.1)', borderRadius: 12, maxHeight: 280, overflowY: 'auto' }}>
                      {searching && results.length === 0 ? (
                        <div style={{ padding: 12, fontSize: 13, color: COLORS.muted }}>Searching…</div>
                      ) : results.length === 0 ? (
                        <div style={{ padding: 12, fontSize: 13, color: COLORS.muted }}>No active accounts match.</div>
                      ) : (
                        results.map((u) => {
                          const on = pickedIds.has(u.id)
                          return (
                            <label
                              key={u.id}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer',
                                borderBottom: '1px solid rgba(42,34,32,0.06)', background: on ? COLORS.tan : 'transparent',
                              }}
                            >
                              <input type="checkbox" checked={on} onChange={() => toggle(u)} />
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{u.full_name || u.email || u.id}</span>
                                <span style={{ display: 'block', fontSize: 12, color: COLORS.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {roleLabel(u.role)} · {u.email}
                                </span>
                              </span>
                              <DeviceTag n={u.device_count} />
                            </label>
                          )
                        })
                      )}
                    </div>
                  )}

                  <div style={{ marginTop: 14 }}>
                    <span style={fieldLabel}>Selected ({picked.length})</span>
                    {picked.length === 0 ? (
                      <div style={{ fontSize: 13, color: COLORS.muted }}>Nobody yet — search and tick users above.</div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {picked.map((u) => (
                          <span
                            key={u.id}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 6px 5px 11px',
                              borderRadius: 999, background: COLORS.tan, fontSize: 13,
                            }}
                          >
                            {u.full_name || u.email}
                            {u.device_count === 0 && <span title="No phone registered for push" style={{ color: COLORS.muted }}>· no phone</span>}
                            <button
                              type="button"
                              onClick={() => toggle(u)}
                              aria-label={`Remove ${u.full_name || u.email}`}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: COLORS.muted, fontSize: 15, lineHeight: 1, padding: '0 4px' }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {picked.length > MAX_USERS && (
                      <div style={{ fontSize: 12, color: COLORS.red, marginTop: 6 }}>
                        At most {MAX_USERS} users per send — use a segment for more.
                      </div>
                    )}
                    {push && noDevice > 0 && (
                      <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 6 }}>
                        {noDevice} of them {noDevice === 1 ? 'has' : 'have'} no phone registered — they&apos;ll only see it in-app
                        {email ? ' and by email' : ''}.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* What */}
            <div style={{ ...panelStyle, display: 'grid', gap: 12 }}>
              <div>
                <label style={fieldLabel} htmlFor="n-title">Title</label>
                <input id="n-title" value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} style={input} placeholder="Your stay is coming up" />
                <Counter n={title.length} max={TITLE_MAX} />
              </div>
              <div>
                <label style={fieldLabel} htmlFor="n-body">Message</label>
                <textarea id="n-body" value={body} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} rows={4} style={{ ...input, resize: 'vertical' }} placeholder="Optional" />
                <Counter n={body.length} max={BODY_MAX} />
              </div>
              <div>
                <label style={fieldLabel} htmlFor="n-link">Open on tap</label>
                <input id="n-link" value={link} onChange={(e) => setLink(e.target.value)} style={input} placeholder="Optional — /reservations or https://…" />
              </div>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} /> Push to phone
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Also email
                </label>
              </div>
            </div>

            {error && <div style={{ ...panelStyle, color: COLORS.red, fontSize: 13, fontWeight: 700 }}>{error}</div>}

            <div>
              <button
                type="button"
                onClick={send}
                disabled={!canSend}
                style={{ ...solidBtn, padding: '11px 20px', fontSize: 14, opacity: canSend ? 1 : 0.5, cursor: canSend ? 'pointer' : 'not-allowed' }}
              >
                {sending ? 'Sending…' : mode === 'users' ? `Send to ${picked.length} user${picked.length === 1 ? '' : 's'}` : `Send to ${MODE_LABEL[mode].toLowerCase()}`}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

function Counter({ n, max }: { n: number; max: number }) {
  return <div style={{ fontSize: 11, color: COLORS.muted, textAlign: 'right', marginTop: 3 }}>{n}/{max}</div>
}

function DeviceTag({ n }: { n: number }) {
  return (
    <span
      title={n ? `${n} registered device${n === 1 ? '' : 's'}` : 'No phone registered for push'}
      style={{
        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap',
        background: n ? 'rgba(46,125,91,0.12)' : 'rgba(42,34,32,0.06)',
        color: n ? COLORS.green : COLORS.muted,
      }}
    >
      {n ? `📱 ${n}` : 'no phone'}
    </span>
  )
}
