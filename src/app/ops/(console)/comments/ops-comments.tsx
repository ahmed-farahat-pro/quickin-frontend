'use client'

// Comments — every public listing comment, with the three things staff can do about
// one: remove it, remove the host's reply, or ban the author.
//
// A ban is the ordinary account block (the Moderation 'suspend' action), so it is
// lifted from /ops → Users like any other. While it lasts, every comment that author
// wrote is hidden from the listings — the "Hidden" tab — and they come back if the ban
// is lifted. Removing a comment is final and tells the author it happened.
import { useEffect, useState } from 'react'
import { COLORS, SERIF } from '../../ops-theme'
import { EmptyRow, adminGet, adminSend, btnBase, controlStyle, ghostBtn, pageStyle, panelStyle, td, th } from '../ops-ui'
import { waitingLabel } from '@/lib/local/activity-core'

/** "3 hours ago", but "just now" rather than "just now ago". */
function agoLabel(since: string, now: number): string {
  const label = waitingLabel(since, now)
  return label === 'just now' || label === '—' ? label : `${label} ago`
}

export type AdminComment = {
  id: string
  listing_id: string
  listing_title: string | null
  user_id: string
  author_name: string | null
  author_email: string | null
  author_status: string
  body: string
  created_at: string
  host_reply: string | null
  host_replied_at: string | null
  deleted_at: string | null
  deleted_by: string | null
  delete_reason: string | null
  state: 'visible' | 'hidden' | 'removed_by_author' | 'removed_by_staff'
}

const SCOPES = ['visible', 'hidden', 'removed', 'all'] as const
type Scope = (typeof SCOPES)[number]

const SCOPE_LABEL: Record<Scope, string> = {
  visible: 'Live',
  hidden: 'Hidden (author banned)',
  removed: 'Removed',
  all: 'All',
}

const STATE_LABEL: Record<AdminComment['state'], string> = {
  visible: 'Live',
  hidden: 'Hidden — author banned',
  removed_by_author: 'Deleted by author',
  removed_by_staff: 'Removed by staff',
}

function stateTone(state: AdminComment['state']): string {
  if (state === 'visible') return COLORS.green
  if (state === 'removed_by_staff' || state === 'hidden') return COLORS.red
  return COLORS.muted
}

const smallBtn: React.CSSProperties = { ...ghostBtn, padding: '6px 12px', fontSize: 12 }
const dangerBtn: React.CSSProperties = { ...smallBtn, color: COLORS.red, borderColor: COLORS.red }

export function OpsComments({ initial }: { initial: AdminComment[] }) {
  const [comments, setComments] = useState<AdminComment[]>(initial)
  const [scope, setScope] = useState<Scope>('visible')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [now, setNow] = useState(0)

  // Date.now() only after mount, so the server and client renders agree.
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const raf = requestAnimationFrame(tick)
    const id = setInterval(tick, 60_000)
    return () => { cancelAnimationFrame(raf); clearInterval(id) }
  }, [])

  const load = async (nextScope: Scope, nextQ: string) => {
    const params = new URLSearchParams({ scope: nextScope })
    if (nextQ.trim()) params.set('q', nextQ.trim())
    const res = await adminGet<{ comments: AdminComment[] }>(`comments?${params}`)
    if (res === 'forbidden') { setError('Your account does not have the Moderation module.'); return }
    if (!res) { setError('Could not load comments. Please retry.'); return }
    setError(null)
    setComments(res.comments ?? [])
  }

  const changeScope = (next: Scope) => {
    if (next === scope) return
    setScope(next)
    void load(next, q)
  }

  const say = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(null), 6000)
  }

  const removeComment = async (c: AdminComment) => {
    const reason = prompt(
      `Remove this comment by ${c.author_name || c.author_email}?\n\n“${c.body.slice(0, 160)}”\n\n` +
      'They will be notified that it was removed for breaking the rules. ' +
      'Optional reason for the audit log (not shown to them):',
      '',
    )
    if (reason === null) return
    setBusy(c.id); setError(null)
    const res = await adminSend<{ error?: string }>(`comments/${c.id}`, 'DELETE', { reason })
    setBusy(null)
    if (!res.ok) { setError((res.data as { error?: string })?.error ?? 'That did not work'); return }
    await load(scope, q)
    say('Comment removed and the author notified')
  }

  const removeReply = async (c: AdminComment) => {
    if (!confirm(`Remove the host’s reply on “${c.listing_title ?? 'this listing'}”? The question stays up.`)) return
    setBusy(c.id); setError(null)
    const res = await adminSend<{ error?: string }>(`comments/${c.id}?part=reply`, 'DELETE')
    setBusy(null)
    if (!res.ok) { setError((res.data as { error?: string })?.error ?? 'That did not work'); return }
    await load(scope, q)
    say('Host reply removed')
  }

  const ban = async (c: AdminComment) => {
    const who = c.author_name || c.author_email || 'this user'
    const reason = prompt(
      `Ban ${who}?\n\nThey will be signed out and cannot sign back in, their published listings are hidden, ` +
      'and every comment they wrote is hidden from the listings. Reversible from /ops → Users.\n\nReason:',
      'Broke the community rules in listing comments',
    )
    if (reason === null) return
    setBusy(c.id); setError(null)
    const res = await adminSend<{ error?: string }>('moderation', 'POST', { userId: c.user_id, action: 'suspend', reason })
    setBusy(null)
    if (!res.ok) { setError((res.data as { error?: string })?.error ?? 'That did not work'); return }
    await load(scope, q)
    say(`${who} is banned and their comments are hidden`)
  }

  return (
    <main style={pageStyle}>
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 20px 64px' }}>
        <h1 style={{ margin: '0 0 4px', fontFamily: SERIF, fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', color: COLORS.burgundy }}>
          Comments
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: COLORS.muted }}>
          Public questions guests post on listings, and the hosts’ replies. Contact details are already
          blocked before they are posted — this is for everything else.
        </p>

        {flash && <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.green, fontSize: 13, fontWeight: 700 }}>{flash}</div>}
        {error && <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.red, fontSize: 13, fontWeight: 700 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
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
          <form
            onSubmit={(e) => { e.preventDefault(); void load(scope, q) }}
            style={{ display: 'flex', gap: 8, marginLeft: 'auto', flex: '1 1 260px', maxWidth: 420 }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search text, author, email or listing"
              style={{ ...controlStyle, flex: 1, minWidth: 0 }}
            />
            <button type="submit" style={smallBtn}>Search</button>
          </form>
        </div>

        <div style={panelStyle}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>Posted</th>
                  <th style={th}>Author</th>
                  <th style={th}>Listing</th>
                  <th style={th}>Comment &amp; reply</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, width: 1 }} />
                </tr>
              </thead>
              <tbody>
                {comments.map((c) => {
                  const live = !c.deleted_at
                  return (
                    <tr key={c.id}>
                      <td style={{ ...td, whiteSpace: 'nowrap', color: COLORS.muted }}>
                        {now ? agoLabel(c.created_at, now) : '—'}
                      </td>
                      <td style={td}>
                        <a href={`/ops/users/${c.user_id}`} style={{ color: COLORS.burgundy, textDecoration: 'none', fontWeight: 700 }}>
                          {c.author_name || c.author_email || 'Unknown'}
                        </a>
                        <div style={{ color: COLORS.muted, fontSize: 11.5 }}>{c.author_email}</div>
                        {c.author_status !== 'active' && (
                          <div style={{ color: COLORS.red, fontSize: 11.5, fontWeight: 700, textTransform: 'capitalize' }}>
                            {c.author_status}
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, maxWidth: 200 }}>
                        <a href={`/explore/${c.listing_id}#comments`} target="_blank" rel="noreferrer" style={{ color: COLORS.burgundy, textDecoration: 'none' }}>
                          {c.listing_title || 'Listing'} ↗
                        </a>
                      </td>
                      <td style={{ ...td, maxWidth: 420 }}>
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.body}</div>
                        {c.host_reply && (
                          <div style={{ marginTop: 6, paddingLeft: 10, borderLeft: `3px solid ${COLORS.tan}` }}>
                            <span style={{ color: COLORS.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Host reply</span>
                            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.host_reply}</div>
                          </div>
                        )}
                        {c.delete_reason && (
                          <div style={{ marginTop: 6, color: COLORS.muted, fontSize: 11.5 }}>Reason: {c.delete_reason}</div>
                        )}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <span style={{ color: stateTone(c.state), fontWeight: 700 }}>{STATE_LABEL[c.state]}</span>
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'grid', gap: 6 }}>
                          {live && (
                            <button type="button" disabled={busy === c.id} onClick={() => removeComment(c)} style={dangerBtn}>
                              Remove comment
                            </button>
                          )}
                          {live && c.host_reply && (
                            <button type="button" disabled={busy === c.id} onClick={() => removeReply(c)} style={smallBtn}>
                              Remove reply
                            </button>
                          )}
                          {c.author_status === 'active' ? (
                            <button type="button" disabled={busy === c.id} onClick={() => ban(c)} style={dangerBtn}>
                              Ban author
                            </button>
                          ) : (
                            <a href={`/ops/users/${c.user_id}`} style={{ ...smallBtn, textDecoration: 'none', textAlign: 'center' }}>
                              Manage ban
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {comments.length === 0 && (
                  <EmptyRow
                    colSpan={6}
                    tone={q.trim() ? 'filtered' : 'blank'}
                    title={q.trim() ? 'No comments match' : 'No comments here'}
                    body={
                      q.trim()
                        ? 'Try a different search, or switch tabs.'
                        : scope === 'hidden'
                          ? 'No banned user has comments on a listing.'
                          : scope === 'removed'
                            ? 'Nothing has been removed yet.'
                            : 'Nobody has commented on a listing yet.'
                    }
                  />
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}
