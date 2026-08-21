'use client'

// One user's profile (D2) and the account lifecycle controls (D3 block, D4 remove).
//
// Two things here are deliberate rather than incidental:
//
//  1. Message bodies are NOT part of this payload. Opening a thread is a separate,
//     audited request, and the notice above the table says so before the first click
//     rather than after.
//  2. Remove is described in the confirm dialog by what it actually does — hides N
//     listings, keeps the booking and payment history, reversible by a super admin —
//     because "permanently deactivate" reads like a delete and isn't one.
import { useCallback, useState } from 'react'
import type { Listing, Review } from '@/lib/types'
import Link from 'next/link'
import { COLORS, SERIF } from '../../../ops-theme'
import { Empty, EmptyRow, adminGet, adminSend, ghostBtn, money, numTd, pageStyle, panelStyle, solidBtn, td, th, Stat, StatGrid } from '../../ops-ui'
import { normalizeStatus, statusLabel, type AccountStatus, type UserStatusAction } from '@/lib/local/user-admin-core'
import { StatusPill, actorLabel, fmtDay, fmtMoment, pill } from '../user-bits'

type Detail = {
  user: {
    id: string; email: string; full_name: string | null; is_host: boolean; email_verified: boolean
    verification_status: string; provider: string; created_at: string
    listing_count: number; booking_count: number
    account_status: string; status_reason: string | null; status_changed_at: string | null; status_changed_by: string | null
    phone: string | null; country: string | null; bio: string | null; role: string | null
    avatar_url: string | null
    host_type: string | null; company: string | null; referral_code: string | null
  }
  listings: Array<{ id: string; title: string; is_published: boolean; approval_status: string; unpublished_by_admin: boolean; price_per_night: number; currency: string; created_at: string; booking_count: number }>
  bookings: Array<{ id: string; reservation_code: string | null; listing_title: string | null; status: string; payment_status: string; total_price: number; check_in: string; check_out: string; created_at: string }>
  payments: Array<{ id: string; booking_id: string; reservation_code: string | null; listing_title: string | null; amount: number; status: string; submitted_at: string | null; reviewed_at: string | null; reject_reason: string | null }>
  conversations: Array<{ id: string; listing_title: string | null; counterparty_name: string | null; counterparty_email: string | null; message_count: number; last_message_at: string | null; viewer_role: 'guest' | 'host' }>
  documents: Array<{ kind: 'id_verification' | 'host_application'; id: string; status: string; submitted_at: string | null; reviewed_at: string | null; notes: string | null; has_document: boolean }>
  stats: { gross_paid: number; nights_booked: number; mobile_message_count: number; report_count: number }
}

type ThreadMessage = { id: string; sender_id: string; sender_name: string | null; body: string; created_at: string }

const section: React.CSSProperties = { ...panelStyle, marginTop: 14 }
const h2: React.CSSProperties = { margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: COLORS.burgundy }
const sub: React.CSSProperties = { margin: '0 0 12px', fontSize: 12, color: COLORS.muted, lineHeight: 1.6 }
const dangerBtn: React.CSSProperties = { ...solidBtn, background: COLORS.red }

/** What each destructive action needs the operator to understand before they do it. */
const CONFIRM: Record<'block' | 'remove', { title: string; cta: string; blurb: (n: number) => string }> = {
  block: {
    title: 'Block this account?',
    cta: 'Block account',
    blurb: (n) =>
      `They will be signed out everywhere and cannot log in, book, or host until you unblock them. ` +
      (n > 0 ? `Their ${n} live listing${n === 1 ? '' : 's'} will be hidden and restored when you unblock. ` : '') +
      `Nothing is deleted.`,
  },
  remove: {
    title: 'Remove this account?',
    cta: 'Remove account',
    blurb: (n) =>
      `The account is closed: they cannot log in, book, host, or sign up again with this email. ` +
      (n > 0 ? `Their ${n} live listing${n === 1 ? '' : 's'} will be hidden. ` : '') +
      `Bookings, payments and messages are KEPT so disputes can still be settled. ` +
      `A super admin can restore the account later.`,
  },
}

export function OpsUserDetail({ initial, isSuperAdmin }: { initial: Detail; isSuperAdmin: boolean }) {
  const [data, setData] = useState<Detail>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ action: 'block' | 'remove'; reason: string } | null>(null)
  const [thread, setThread] = useState<{ id: string; messages: ThreadMessage[] } | null>(null)
  const [threadBusy, setThreadBusy] = useState<string | null>(null)

  const u = data.user
  const status = normalizeStatus(u.account_status) as AccountStatus
  const livePublished = data.listings.filter((l) => l.is_published).length

  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 5000) }

  const load = useCallback(async () => {
    const res = await adminGet<Detail>(`users/${initial.user.id}`)
    if (res === 'forbidden') { setError('Your account does not have the Users module.'); return }
    if (res) setData(res)
  }, [initial.user.id])

  const run = async (fn: () => Promise<{ ok: boolean; data: { error?: string } }>, ok: string) => {
    setBusy(true); setError(null)
    const res = await fn()
    setBusy(false)
    if (!res.ok) { setError(res.data?.error ?? 'That did not work'); return false }
    await load()
    say(ok)
    return true
  }

  const act = (action: UserStatusAction, reason?: string) =>
    run(
      () => adminSend(`users/${u.id}`, 'POST', { action, reason }) as Promise<{ ok: boolean; data: { error?: string } }>,
      action === 'block' ? 'Account blocked'
        : action === 'unblock' ? 'Account unblocked'
        : action === 'remove' ? 'Account removed'
        : 'Account restored',
    )

  const submitConfirm = async () => {
    if (!confirm) return
    const done = await act(confirm.action, confirm.reason.trim())
    if (done) setConfirm(null)
  }

  const openThread = async (conversationId: string) => {
    if (thread?.id === conversationId) { setThread(null); return }
    setThreadBusy(conversationId); setError(null)
    const res = await adminGet<{ messages: ThreadMessage[] }>(`users/${u.id}/thread/${conversationId}`)
    setThreadBusy(null)
    if (res === 'forbidden') { setError('Your account does not have the Users module.'); return }
    if (!res) { setError('Could not open that thread.'); return }
    setThread({ id: conversationId, messages: res.messages ?? [] })
  }

  return (
    <main style={pageStyle}>
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 64px' }}>
        <Link href="/ops/users" style={{ fontSize: 12, color: COLORS.muted, textDecoration: 'none' }}>
          ← All users
        </Link>

        {/* The photo is shown here because a moderator opening a reported profile
            is usually here to look at exactly this, and a report that says
            "profile picture" is unanswerable from a table of bookings. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 4px' }}>
          {u.avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={u.avatar_url}
              alt=""
              style={{ width: 56, height: 56, borderRadius: 999, objectFit: 'cover', flexShrink: 0, border: `1px solid ${COLORS.tan}` }}
            />
          )}
          <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', color: COLORS.burgundy }}>
            {u.full_name || u.email}
          </h1>
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: COLORS.muted, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{u.email}</span>
          <StatusPill status={status} />
          {pill(u.is_host ? 'Host' : 'Guest', COLORS.tan, COLORS.ink)}
          <span>Joined {fmtDay(u.created_at)}</span>
        </p>

        {status !== 'active' && (
          <div style={{ ...panelStyle, marginBottom: 12, borderLeft: `4px solid ${COLORS.red}` }}>
            <strong style={{ fontSize: 13, color: COLORS.ink }}>
              {statusLabel(status)} by {actorLabel(u.status_changed_by)} on {fmtDay(u.status_changed_at)}
            </strong>
            {u.status_reason && <p style={{ margin: '4px 0 0', fontSize: 13, color: COLORS.muted }}>{u.status_reason}</p>}
          </div>
        )}

        {flash && <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.green, fontSize: 13, fontWeight: 700 }}>{flash}</div>}
        {error && <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.red, fontSize: 13, fontWeight: 700 }}>{error}</div>}

        {/* ---- Actions ---- */}
        <div style={{ ...panelStyle, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {status === 'active' && (
            <>
              <button type="button" disabled={busy} onClick={() => setConfirm({ action: 'block', reason: '' })} style={ghostBtn}>Block</button>
              <button type="button" disabled={busy} onClick={() => setConfirm({ action: 'remove', reason: '' })} style={dangerBtn}>Remove</button>
            </>
          )}
          {status === 'blocked' && (
            <>
              <button type="button" disabled={busy} onClick={() => act('unblock')} style={solidBtn}>Unblock</button>
              <button type="button" disabled={busy} onClick={() => setConfirm({ action: 'remove', reason: '' })} style={dangerBtn}>Remove</button>
            </>
          )}
          {status === 'removed' && (
            isSuperAdmin
              ? <button type="button" disabled={busy} onClick={() => act('restore')} style={solidBtn}>Restore account</button>
              : <span style={{ fontSize: 12, color: COLORS.muted }}>Removed — a super admin can restore this account.</span>
          )}

          <span style={{ flex: 1 }} />

          {/* A photo goes live the moment it is picked — on the site and in both
              apps — and no filter can read what is in it, so the moderation is
              this button rather than a queue in front of the upload. It takes the
              picture down and nothing else; blocking the account over it stays a
              separate, reasoned decision on the left. */}
          {u.avatar_url && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => adminSend(`users/${u.id}`, 'POST', { action: 'remove_photo' }) as Promise<{ ok: boolean; data: { error?: string } }>, 'Profile photo removed')}
              style={ghostBtn}
            >
              Remove photo
            </button>
          )}

          {!u.email_verified && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => adminSend('users', 'POST', { id: u.id, action: 'activate' }) as Promise<{ ok: boolean; data: { error?: string } }>, 'Email marked verified')}
              style={ghostBtn}
            >
              Mark email verified
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => adminSend('users', 'POST', { id: u.id, action: u.is_host ? 'remove-host' : 'make-host' }) as Promise<{ ok: boolean; data: { error?: string } }>, u.is_host ? 'Host access removed' : 'Now a host')}
            style={ghostBtn}
          >
            {u.is_host ? 'Remove host access' : 'Make host'}
          </button>
        </div>

        {/* ---- Stats ---- */}
        <div style={{ marginTop: 14 }}>
          <StatGrid>
            <Stat label="Listings" value={data.listings.length} />
            <Stat label="Bookings" value={data.bookings.length} hint={`${data.stats.nights_booked} nights`} />
            <Stat label="Paid" value={money(data.stats.gross_paid)} />
            <Stat label="Reports against" value={data.stats.report_count} />
          </StatGrid>
        </div>

        {/* ---- Details ---- */}
        <div style={section}>
          <h2 style={h2}>Details</h2>
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: 0, fontSize: 13 }}>
            {([
              ['Phone', u.phone], ['Country', u.country], ['Sign-in', u.provider],
              ['ID verification', u.verification_status], ['Host type', u.host_type],
              ['Company', u.company], ['Referral code', u.referral_code],
            ] as Array<[string, string | null]>).map(([k, v]) => (
              <div key={k}>
                <dt style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: COLORS.muted }}>{k}</dt>
                <dd style={{ margin: '2px 0 0', color: COLORS.ink }}>{v || '—'}</dd>
              </div>
            ))}
          </dl>
          {u.bio && <p style={{ margin: '12px 0 0', fontSize: 13, color: COLORS.muted, lineHeight: 1.6 }}>{u.bio}</p>}
        </div>

        {/* ---- Listings ---- */}
        <div style={section}>
          <h2 style={h2}>Listings ({data.listings.length})</h2>
          <Table
            head={['Title', 'Status', 'Approval', 'Price', 'Bookings', 'Created']}
            empty={{ title: 'Not hosting anything', body: 'This account has never published a listing.' }}
            rows={data.listings.map((l) => [
              <span key="t" style={{ fontWeight: 700 }}>{l.title}</span>,
              l.is_published
                ? pill('Live', '#E4F3EC', COLORS.green)
                : l.unpublished_by_admin
                  ? pill('Hidden by removal', '#FDF0DC', '#8A5A12')
                  : pill('Unpublished', COLORS.tan, COLORS.muted),
              l.approval_status,
              money(l.price_per_night),
              { num: l.booking_count },
              fmtDay(l.created_at),
            ])}
          />
        </div>

        {/* ---- Bookings ---- */}
        <div style={section}>
          <h2 style={h2}>Bookings ({data.bookings.length})</h2>
          <Table
            head={['Reference', 'Listing', 'Dates', 'Status', 'Payment', 'Total']}
            empty={{ title: 'No bookings yet', body: 'Stays this account books or hosts will appear here.' }}
            rows={data.bookings.map((b) => [
              b.reservation_code || '—',
              b.listing_title || '—',
              `${fmtDay(b.check_in)} → ${fmtDay(b.check_out)}`,
              b.status,
              b.payment_status,
              money(b.total_price),
            ])}
          />
        </div>

        {/* ---- Payments ---- */}
        <div style={section}>
          <h2 style={h2}>Payments ({data.payments.length})</h2>
          <p style={sub}>Instapay proofs submitted against this user&apos;s bookings. The screenshot itself is reviewed on the Payments screen.</p>
          <Table
            head={['Reference', 'Listing', 'Amount', 'Status', 'Submitted', 'Reviewed']}
            empty={{ title: 'No payments submitted', body: 'Instapay screenshots this account uploads land here for review.' }}
            rows={data.payments.map((p) => [
              p.reservation_code || '—',
              p.listing_title || '—',
              money(p.amount),
              p.reject_reason ? `${p.status} — ${p.reject_reason}` : p.status,
              fmtDay(p.submitted_at),
              fmtDay(p.reviewed_at),
            ])}
          />
        </div>

        {/* ---- Messages ---- */}
        <div style={section}>
          <h2 style={h2}>Messages ({data.conversations.length})</h2>
          <p style={{ ...sub, color: COLORS.ink, background: '#FDF0DC', padding: '8px 10px', borderRadius: 10 }}>
            Opening a thread reveals its message contents and is recorded in the staff audit log.
          </p>
          <Table
            head={['With', 'Listing', 'Role', 'Messages', 'Last activity', '']}
            empty={{ title: 'No conversations', body: 'This account has never messaged a host or a guest.' }}
            rows={data.conversations.map((c) => [
              <span key="w">{c.counterparty_name || c.counterparty_email || '—'}</span>,
              c.listing_title || '—',
              c.viewer_role === 'host' ? 'As host' : 'As guest',
              { num: c.message_count },
              fmtDay(c.last_message_at),
              <button
                key="b"
                type="button"
                disabled={threadBusy === c.id}
                onClick={() => openThread(c.id)}
                style={{ ...ghostBtn, padding: '6px 12px', fontSize: 12 }}
              >
                {threadBusy === c.id ? 'Opening…' : thread?.id === c.id ? 'Hide thread' : 'Open thread'}
              </button>,
            ])}
          />
          {thread && (
            <div style={{ marginTop: 12, borderTop: `1px solid ${COLORS.tan}`, paddingTop: 12, display: 'grid', gap: 8 }}>
              {thread.messages.length === 0 && (
                <Empty inset tone="blank" title="This thread is empty" body="The conversation was opened but nothing was ever sent." />
              )}
              {thread.messages.map((m) => (
                <div key={m.id} style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: m.sender_id === u.id ? COLORS.burgundy : COLORS.ink }}>
                    {m.sender_id === u.id ? (u.full_name || 'This user') : (m.sender_name || 'Them')}
                  </span>
                  <span style={{ color: COLORS.muted, fontSize: 11, marginLeft: 8 }}>{fmtMoment(m.created_at)}</span>
                  <p style={{ margin: '2px 0 0', color: COLORS.ink, whiteSpace: 'pre-wrap' }}>{m.body}</p>
                </div>
              ))}
            </div>
          )}
          {data.stats.mobile_message_count > 0 && (
            <p style={{ margin: '12px 0 0', fontSize: 12, color: COLORS.muted }}>
              Plus {data.stats.mobile_message_count} message{data.stats.mobile_message_count === 1 ? '' : 's'} in
              booking chats from the mobile apps, which are threaded per booking and not shown here.
            </p>
          )}
        </div>

        {/* ---- Documents ---- */}
        <div style={section}>
          <h2 style={h2}>Documents ({data.documents.length})</h2>
          <p style={sub}>ID verifications and host applications. Review the images themselves on the Verifications and Applications screens.</p>
          <Table
            head={['Kind', 'Status', 'Document', 'Submitted', 'Reviewed', 'Notes']}
            empty={{ title: 'Nothing submitted', body: 'No ID verification or host application on file for this account.' }}
            rows={data.documents.map((d) => [
              d.kind === 'id_verification' ? 'ID verification' : 'Host application',
              d.status,
              d.has_document ? 'On file' : '—',
              fmtDay(d.submitted_at),
              fmtDay(d.reviewed_at),
              d.notes || '—',
            ])}
          />
        </div>
      </section>

      {/* ---- Block / Remove confirmation ---- */}
      {confirm && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirm(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(20,14,12,.45)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 50 }}
        >
          <div style={{ ...panelStyle, maxWidth: 460, width: '100%' }}>
            <h3 style={{ margin: '0 0 6px', fontFamily: SERIF, fontSize: 19, fontWeight: 700, color: COLORS.burgundy }}>
              {CONFIRM[confirm.action].title}
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: COLORS.muted, lineHeight: 1.6 }}>
              <strong style={{ color: COLORS.ink }}>{u.email}</strong> — {CONFIRM[confirm.action].blurb(livePublished)}
            </p>
            <label>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: COLORS.muted }}>
                Reason (recorded in the audit log)
              </span>
              <textarea
                value={confirm.reason}
                autoFocus
                onChange={(e) => setConfirm({ ...confirm, reason: e.target.value })}
                rows={3}
                placeholder="e.g. repeated no-shows reported by hosts"
                style={{ width: '100%', marginTop: 4, padding: '10px 12px', borderRadius: 12, border: `1px solid ${COLORS.tan}`, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" onClick={() => setConfirm(null)} style={ghostBtn}>Cancel</button>
              <button
                type="button"
                disabled={busy || !confirm.reason.trim()}
                onClick={submitConfirm}
                style={{ ...dangerBtn, opacity: confirm.reason.trim() ? 1 : 0.5 }}
              >
                {busy ? 'Working…' : CONFIRM[confirm.action].cta}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

/** A plain table with the /ops cell styles. A cell given as `{ num }` is
 *  right-aligned and tabular; anything else renders as-is. */
function Table({
  head,
  rows,
  empty,
}: {
  head: string[]
  rows: Array<Array<React.ReactNode | { num: number }>>
  /** Every panel here is empty for the same reason — this particular user has never
   *  done the thing — so the headline names that and the body says what would fill it. */
  empty: { title: string; body?: string }
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>{head.map((h, i) => <th key={i} style={h ? th : { ...th, width: 1 }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) =>
                c && typeof c === 'object' && 'num' in c
                  ? <td key={j} style={numTd}>{c.num}</td>
                  : <td key={j} style={td}>{c as React.ReactNode}</td>,
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <EmptyRow colSpan={head.length} tone="blank" title={empty.title} body={empty.body} />
          )}
        </tbody>
      </table>
    </div>
  )
}
