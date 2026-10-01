'use client'

// "Questions & comments" — public Q&A on a listing, which replaced host ⇄ guest
// messaging (2026-10-02). Contract: LISTING-COMMENTS-CONTRACT.md at the repo root.
//
//   GET    /api/local/listings/:id/comments                 → { comments, is_host, can_comment }
//   POST   /api/local/listings/:id/comments { body }        → 201 { comment }
//   DELETE /api/local/listings/:id/comments/:cid            → { ok }   (the author)
//   PUT    /api/local/listings/:id/comments/:cid/reply      → { comment } (the host)
//   DELETE /api/local/listings/:id/comments/:cid/reply      → { comment } (the host)
//
// Two consumers: the listing detail page (ListingComments, the whole section) and
// the host's "Guest questions" page (CommentItem + PolicyWarningGate, one row per
// question across all their listings). The server enforces every rule — contact
// details, length, rate limit, who may reply — and its wording is shown verbatim.
import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRelativeTime } from '@/lib/use-relative-time'
import {
  COMMENT_MAX,
  commentFailure,
  type ListingComment,
  type ListingCommentsResponse,
  type PolicyWarning,
} from '@/lib/local/listing-comments-ui-core'
// The same module the server enforces with — imported only so the writer gets the
// answer instantly and keeps their text. The server still checks; this is never the gate.
import { inspectContent } from '@/lib/local/contentguard'

const C = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
  error: '#b3261e',
}

const base = (listingId: string) => `/api/local/listings/${encodeURIComponent(listingId)}/comments`

/** Outcome of a write: the parsed JSON on success, or a failure the UI acts on. */
type WriteResult<T> =
  | { ok: true; data: T }
  | { ok: false; signin: true }
  | { ok: false; warning: PolicyWarning }
  | { ok: false; message: string | null }

async function write<T>(url: string, method: string, body?: unknown): Promise<WriteResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await res.json().catch(() => null)
    if (res.ok) return { ok: true, data: data as T }
    const f = commentFailure(res.status, data)
    if (f.kind === 'signin') return { ok: false, signin: true }
    if (f.kind === 'warning') return { ok: false, warning: f.warning }
    return { ok: false, message: f.message }
  } catch {
    return { ok: false, message: null }
  }
}

/** Shared handlers a row needs from whoever owns the list. */
interface RowContext {
  /** A write was refused until a policy warning is acknowledged. */
  onWarning: (w: PolicyWarning) => void
  /** True while a warning is waiting — every write button is held. */
  gated: boolean
}

// ── Policy warning gate ─────────────────────────────────────────────────────────

/**
 * A moderator's warning the user must read before they can post again (the 409 gate).
 * Acknowledging calls POST /api/local/policy-warning and only then lifts the gate —
 * clearing it locally on a failed call would just bounce the next post off the same 409.
 * The typed text is never cleared, so the retry is one tap.
 */
export function PolicyWarningGate({ warning, onCleared }: { warning: PolicyWarning; onCleared: () => void }) {
  const t = useTranslations('listingComments')
  const [acking, setAcking] = useState(false)
  const [failed, setFailed] = useState(false)

  async function ack() {
    setAcking(true)
    setFailed(false)
    try {
      const res = await fetch('/api/local/policy-warning', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: warning.id }),
      })
      if (res.ok) onCleared()
      else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setAcking(false)
    }
  }

  return (
    <div role="alert" style={{ background: '#FDECEA', border: '1px solid #F3C0BA', borderRadius: 14, padding: '13px 15px', margin: '0 0 14px' }}>
      <p style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 700, color: '#8C1D18' }}>{t('warningTitle')}</p>
      <p style={{ margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.5, color: C.ink, whiteSpace: 'pre-wrap' }}>
        {warning.message}
      </p>
      {failed && <p style={{ margin: '0 0 8px', fontSize: 12.5, color: C.error }}>{t('warningAckFailed')}</p>}
      <button type="button" disabled={acking} onClick={ack} style={pillButton(acking)}>
        {acking ? t('saving') : t('warningAck')}
      </button>
    </div>
  )
}

// ── One comment (+ the host's reply) ────────────────────────────────────────────

export function CommentItem({
  comment,
  listingId,
  isHost,
  ctx,
  onUpdated,
  onDeleted,
  now,
}: {
  comment: ListingComment
  listingId: string
  /** The viewer hosts this listing → Reply / Edit reply / Delete reply. */
  isHost: boolean
  ctx: RowContext
  onUpdated: (c: ListingComment) => void
  onDeleted: () => void
  /** Clock for relative times; 0 until mounted so SSR and hydration agree. */
  now: number
}) {
  const t = useTranslations('listingComments')
  const locale = useLocale()
  const relativeTime = useRelativeTime(locale)
  const [replying, setReplying] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fail = (r: Exclude<WriteResult<unknown>, { ok: true }>) => {
    if ('signin' in r) setError(t('signedOut'))
    else if ('warning' in r) ctx.onWarning(r.warning)
    else setError(r.message ?? t('genericError'))
  }

  async function removeComment() {
    if (busy || !window.confirm(t('confirmDelete'))) return
    setBusy(true)
    setError(null)
    const r = await write<{ ok: boolean }>(`${base(listingId)}/${encodeURIComponent(comment.id)}`, 'DELETE')
    setBusy(false)
    if (r.ok) onDeleted()
    else fail(r)
  }

  async function saveReply() {
    const body = draft.trim()
    if (!body || busy || ctx.gated) return
    const verdict = inspectContent(body, 'comment')
    if (verdict.blocked) { setError(verdict.message ?? t('genericError')); return }
    setBusy(true)
    setError(null)
    const r = await write<{ comment: ListingComment }>(
      `${base(listingId)}/${encodeURIComponent(comment.id)}/reply`, 'PUT', { body })
    setBusy(false)
    if (r.ok && r.data?.comment) {
      onUpdated(r.data.comment)
      setReplying(false)
      setDraft('')
    } else if (!r.ok) fail(r)
  }

  async function removeReply() {
    if (busy || !window.confirm(t('confirmDeleteReply'))) return
    setBusy(true)
    setError(null)
    const r = await write<{ comment: ListingComment }>(
      `${base(listingId)}/${encodeURIComponent(comment.id)}/reply`, 'DELETE')
    setBusy(false)
    if (r.ok && r.data?.comment) onUpdated(r.data.comment)
    else if (!r.ok) fail(r)
  }

  const when = relativeTime(comment.created_at, now)
  const replyWhen = comment.reply ? relativeTime(comment.reply.created_at, now) : ''

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(42,34,32,0.06)', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Avatar name={comment.author_name} url={comment.author_avatar} />
        <strong style={{ fontSize: 14.5, color: C.ink, minWidth: 0, overflowWrap: 'anywhere' }}>
          {comment.author_name || t('guest')}
        </strong>
        {comment.mine && <span style={chip}>{t('you')}</span>}
        {when && (
          <time dateTime={comment.created_at} style={{ fontSize: 12, color: C.muted, marginInlineStart: 'auto', whiteSpace: 'nowrap' }}>
            {when}
          </time>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: C.ink, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {comment.body}
      </p>

      {/* The host's answer, indented under the question. */}
      {comment.reply && !replying && (
        <div
          style={{
            marginTop: 12,
            marginInlineStart: 18,
            paddingInlineStart: 12,
            borderInlineStart: `3px solid ${C.tan}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ ...chip, background: C.burgundy, color: '#fff' }}>{t('hostLabel')}</span>
            {replyWhen && (
              <time dateTime={comment.reply.created_at} style={{ fontSize: 12, color: C.muted }}>{replyWhen}</time>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: C.ink, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {comment.reply.body}
          </p>
        </div>
      )}

      {replying && (
        <div style={{ marginTop: 12, marginInlineStart: 18 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={COMMENT_MAX}
            rows={3}
            disabled={busy}
            placeholder={t('replyPlaceholder')}
            aria-label={t('replyPlaceholder')}
            style={textarea(busy)}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={saveReply} disabled={busy || ctx.gated || !draft.trim()} style={pillButton(busy || ctx.gated || !draft.trim())}>
              {busy ? t('saving') : t('saveReply')}
            </button>
            <button type="button" onClick={() => { setReplying(false); setError(null) }} disabled={busy} style={linkButton}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" style={{ margin: '10px 0 0', fontSize: 13, color: C.error }}>{error}</p>}

      {(comment.mine || isHost) && !replying && (
        <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
          {isHost && (
            <button
              type="button"
              disabled={busy}
              onClick={() => { setDraft(comment.reply?.body ?? ''); setReplying(true); setError(null) }}
              style={linkButton}
            >
              {comment.reply ? t('editReply') : t('reply')}
            </button>
          )}
          {isHost && comment.reply && (
            <button type="button" disabled={busy} onClick={removeReply} style={linkButton}>
              {t('deleteReply')}
            </button>
          )}
          {comment.mine && (
            <button type="button" disabled={busy} onClick={removeComment} style={linkButton}>
              {t('delete')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── The listing page section ────────────────────────────────────────────────────

export default function ListingComments({
  listingId,
  initial,
  signedIn,
}: {
  listingId: string
  /** Server-rendered first load; null when that load failed (the client retries). */
  initial: ListingCommentsResponse | null
  signedIn: boolean
}) {
  const t = useTranslations('listingComments')
  const [data, setData] = useState<ListingCommentsResponse | null>(initial)
  const [loadFailed, setLoadFailed] = useState(false)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<PolicyWarning | null>(null)
  const [sessionGone, setSessionGone] = useState(false)
  // Sampled after mount only, so the server HTML and the first client render match.
  const [now, setNow] = useState(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch(base(listingId), { credentials: 'same-origin', cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as ListingCommentsResponse
      setData({
        comments: Array.isArray(body.comments) ? body.comments : [],
        is_host: Boolean(body.is_host),
        can_comment: Boolean(body.can_comment),
      })
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    }
  }, [listingId])

  useEffect(() => {
    setNow(Date.now())
    if (!initial) void load()
  }, [initial, load])

  async function post(e: React.FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || posting || warning) return
    const verdict = inspectContent(body, 'comment')
    if (verdict.blocked) { setError(verdict.message ?? t('genericError')); return }
    setPosting(true)
    setError(null)
    const r = await write<{ comment: ListingComment }>(base(listingId), 'POST', { body })
    setPosting(false)
    if (r.ok && r.data?.comment) {
      const c = r.data.comment
      setData((d) => (d ? { ...d, comments: [c, ...d.comments.filter((x) => x.id !== c.id)] } : d))
      setText('')
      setNow(Date.now())
    } else if (!r.ok) {
      if ('signin' in r) setSessionGone(true)
      else if ('warning' in r) setWarning(r.warning)
      else setError(r.message ?? t('genericError'))
    }
  }

  const comments = data?.comments ?? []
  const isHost = Boolean(data?.is_host)
  const canComment = Boolean(data?.can_comment) && !sessionGone
  const ctx: RowContext = { onWarning: setWarning, gated: Boolean(warning) }

  return (
    <section id="comments" style={{ marginTop: 26, scrollMarginTop: 24 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 19, fontWeight: 700, color: C.ink }}>
        {comments.length ? t('titleWithCount', { count: comments.length }) : t('title')}
      </h2>

      {warning && <PolicyWarningGate warning={warning} onCleared={() => setWarning(null)} />}

      {/* Composer: any signed-in visitor who is not this listing's host. */}
      {canComment && !warning && (
        <form onSubmit={post} style={{ marginBottom: 16 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={COMMENT_MAX}
            rows={3}
            disabled={posting}
            placeholder={t('placeholder')}
            aria-label={t('placeholder')}
            style={textarea(posting)}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: C.muted, flex: '1 1 240px' }}>{t('hint')}</span>
            <button type="submit" disabled={posting || !text.trim()} style={pillButton(posting || !text.trim())}>
              {posting ? t('posting') : t('post')}
            </button>
          </div>
          {error && <p role="alert" style={{ margin: '8px 0 0', fontSize: 13, color: C.error }}>{error}</p>}
        </form>
      )}

      {/* Signed out (or the session lapsed mid-visit): reading is open, asking is not. */}
      {(!signedIn || sessionGone) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            background: '#fff',
            border: '1px solid rgba(42,34,32,0.06)',
            borderRadius: 14,
            padding: '12px 16px',
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 14, color: C.ink }}>{sessionGone ? t('signedOut') : t('signInPrompt')}</span>
          <a href="/login" style={{ ...pillButton(false), textDecoration: 'none', display: 'inline-block' }}>
            {t('signIn')}
          </a>
        </div>
      )}

      {loadFailed && !data && <p style={{ margin: 0, fontSize: 14, color: C.muted }}>{t('loadFailed')}</p>}

      {data && comments.length === 0 && (
        <p style={{ margin: 0, fontSize: 15, color: C.muted }}>{isHost ? t('emptyHost') : t('empty')}</p>
      )}

      {comments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              listingId={listingId}
              isHost={isHost}
              ctx={ctx}
              now={now}
              onUpdated={(u) => setData((d) => (d ? { ...d, comments: d.comments.map((x) => (x.id === u.id ? u : x)) } : d))}
              onDeleted={() => setData((d) => (d ? { ...d, comments: d.comments.filter((x) => x.id !== c.id) } : d))}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ── Bits ────────────────────────────────────────────────────────────────────────

function Avatar({ name, url }: { name: string; url: string | null }) {
  const size = 30
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: 999, objectFit: 'cover', background: C.tan, flex: '0 0 auto' }} />
  }
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: '0 0 auto',
        borderRadius: 999,
        background: C.tan,
        color: C.burgundy,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: 13,
      }}
    >
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  )
}

const chip: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  color: C.burgundy,
  background: C.tan,
  borderRadius: 999,
  padding: '2px 8px',
  whiteSpace: 'nowrap',
}

const linkButton: CSSProperties = {
  appearance: 'none',
  border: 'none',
  background: 'transparent',
  padding: 0,
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  color: C.burgundy,
  cursor: 'pointer',
}

function pillButton(disabled: boolean): CSSProperties {
  return {
    border: 0,
    borderRadius: 999,
    padding: '9px 20px',
    fontSize: 14,
    fontWeight: 700,
    fontFamily: 'inherit',
    color: '#fff',
    background: disabled ? 'rgba(91,15,22,0.35)' : C.burgundy,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

function textarea(disabled: boolean): CSSProperties {
  return {
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    borderRadius: 12,
    border: '1px solid rgba(42,34,32,0.14)',
    padding: '10px 12px',
    fontSize: 14.5,
    fontFamily: 'inherit',
    color: C.ink,
    background: disabled ? '#faf8f5' : '#fff',
  }
}
