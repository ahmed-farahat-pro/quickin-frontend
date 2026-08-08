'use client'

// Resorts moderation: the catalog, the pending queue, and the sweep for free-text
// names that never produced a submission.
//
// The queue is the interesting part. A host who picks "Other" and types a name gets
// a pending row; approving it lets the admin type the CANONICAL spelling — so
// 'amouge' becomes 'Amouage' — and every listing carrying that text is relinked in
// one go. The submitted spelling is kept as an alias, so the next host to type it
// auto-links instead of queueing the same thing again.
import { useCallback, useMemo, useState } from 'react'
import { COLORS, SERIF } from '../../ops-theme'
import {
  adminGet,
  adminSend,
  controlStyle,
  fieldLabel,
  ghostBtn,
  numTd,
  pageStyle,
  panelStyle,
  solidBtn,
  td,
  th,
} from '../ops-ui'

type Resort = {
  id: string
  name: string
  slug: string
  region: string
  is_active: boolean
  listing_count: number
  alias_count: number
}
type Submission = {
  id: string
  slug: string
  raw_name: string
  region: string | null
  first_seen_at: string
  last_seen_at: string
  submitted_by_email: string | null
  listing_count: number
}
type Unassigned = { name: string; listing_count: number }

const section: React.CSSProperties = { ...panelStyle, marginTop: 14 }
const h2: React.CSSProperties = { margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: COLORS.burgundy }
const sub: React.CSSProperties = { margin: '0 0 12px', fontSize: 12, color: COLORS.muted, lineHeight: 1.6 }

export function OpsResorts({
  initial,
  regions,
}: {
  initial: { resorts: Resort[]; submissions: Submission[]; unassigned: Unassigned[] }
  regions: string[]
}) {
  const [resorts, setResorts] = useState<Resort[]>(initial.resorts)
  const [subs, setSubs] = useState<Submission[]>(initial.submissions)
  const [unassigned, setUnassigned] = useState<Unassigned[]>(initial.unassigned)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  /** The submission being reviewed, with the admin's editable canonical name. */
  const [review, setReview] = useState<{ sub: Submission; name: string; region: string; mergeInto: string } | null>(null)
  const [preview, setPreview] = useState<Array<{ id: string; title: string }> | null>(null)

  const [newName, setNewName] = useState('')
  const [newRegion, setNewRegion] = useState('')

  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 5000) }

  const load = useCallback(async () => {
    const [cat, queue] = await Promise.all([
      adminGet<{ resorts: Resort[]; unassigned: Unassigned[]; regions: string[] }>('resorts'),
      adminGet<{ submissions: Submission[] }>('resorts/submissions'),
    ])
    if (cat === 'forbidden' || queue === 'forbidden') {
      setError('Your account does not have the Resorts module.')
      return
    }
    if (cat) {
      setResorts(cat.resorts ?? [])
      setUnassigned(cat.unassigned ?? [])
    }
    if (queue) setSubs(queue.submissions ?? [])
  }, [])


  /** Open the review dialog, seeded with the host's text as the starting spelling. */
  const openReview = async (s: Submission) => {
    setReview({ sub: s, name: s.raw_name, region: s.region || regions[0] || '', mergeInto: '' })
    setPreview(null)
    const res = await adminGet<{ listings: Array<{ id: string; title: string }> }>(
      `resorts/submissions?preview=${encodeURIComponent(s.raw_name)}`
    )
    if (res && res !== 'forbidden') setPreview(res.listings ?? [])
  }

  const run = async (fn: () => Promise<{ ok: boolean; data: { error?: string } }>, ok: string) => {
    setBusy(true); setError(null)
    const res = await fn()
    setBusy(false)
    if (!res.ok) { setError(res.data?.error ?? 'That did not work'); return false }
    await load()
    say(ok)
    return true
  }

  const approve = async () => {
    if (!review) return
    const r = review
    const done = await run(
      () => adminSend(`resorts/submissions/${r.sub.id}`, 'POST', {
        action: 'approve', name: r.name, region: r.region, merge_into_id: r.mergeInto || null,
      }) as Promise<{ ok: boolean; data: { error?: string } }>,
      `Approved — listings now point at "${r.name}"`
    )
    if (done) setReview(null)
  }

  const byRegion = useMemo(() => {
    const m = new Map<string, Resort[]>()
    for (const r of resorts) m.set(r.region, [...(m.get(r.region) ?? []), r])
    return [...m.entries()]
  }, [resorts])

  return (
    <main style={pageStyle}>
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 64px' }}>
        <h1 style={{ margin: '0 0 4px', fontFamily: SERIF, fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', color: COLORS.burgundy }}>
          Resorts
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: COLORS.muted }}>
          The compounds hosts pick from. A resort belongs to one region, and a listing takes its
          region from the resort.
        </p>

        {flash && <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.green, fontSize: 13, fontWeight: 700 }}>{flash}</div>}
        {error && <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.red, fontSize: 13, fontWeight: 700 }}>{error}</div>}

        {/* ---- Pending queue ---- */}
        <div style={panelStyle}>
          <h2 style={h2}>Pending submissions {subs.length > 0 && <span style={{ color: COLORS.red }}>({subs.length})</span>}</h2>
          <p style={sub}>
            Names hosts typed that aren&apos;t in the catalog. Their listings are live and show the
            typed name to guests — approving just tidies the data.
          </p>
          {subs.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: COLORS.muted }}>Nothing waiting.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead><tr>
                  <th style={th}>Typed name</th><th style={th}>Region</th>
                  <th style={{ ...th, textAlign: 'right' }}>Listings</th>
                  <th style={th}>Submitted by</th><th style={{ ...th, textAlign: 'right' }}>Actions</th>
                </tr></thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.id}>
                      <td style={{ ...td, fontWeight: 700 }}>{s.raw_name}</td>
                      <td style={td}>{s.region ?? '—'}</td>
                      <td style={numTd}>{s.listing_count}</td>
                      <td style={{ ...td, color: COLORS.muted, fontSize: 12 }}>{s.submitted_by_email ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button type="button" disabled={busy} onClick={() => openReview(s)} style={solidBtn}>Review</button>{' '}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(() => adminSend(`resorts/submissions/${s.id}`, 'POST', { action: 'reject' }) as never, 'Dismissed')}
                          style={ghostBtn}
                        >
                          Dismiss
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ---- Catalog ---- */}
        <div style={section}>
          <h2 style={h2}>Catalog</h2>
          <p style={sub}>Deactivating hides a resort from the host dropdown but keeps its listings.</p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
            <div>
              <label style={fieldLabel} htmlFor="nr-name">New resort</label>
              <input id="nr-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Amouage" style={controlStyle} />
            </div>
            <div>
              <label style={fieldLabel} htmlFor="nr-region">Region</label>
              <select id="nr-region" value={newRegion} onChange={(e) => setNewRegion(e.target.value)} style={controlStyle}>
                <option value="">Pick a region…</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <button
              type="button"
              disabled={busy || !newName.trim() || !newRegion}
              onClick={async () => {
                if (await run(() => adminSend('resorts', 'POST', { name: newName, region: newRegion }) as never, 'Resort added')) {
                  setNewName('')
                }
              }}
              style={{ ...solidBtn, opacity: busy || !newName.trim() || !newRegion ? 0.5 : 1 }}
            >
              Add
            </button>
          </div>

          {byRegion.map(([region, list]) => (
            <div key={region} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, marginBottom: 6 }}>{region}</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id}>
                        <td style={{ ...td, fontWeight: 700, opacity: r.is_active ? 1 : 0.5 }}>
                          {r.name}
                          {!r.is_active && <span style={{ marginLeft: 8, fontSize: 11, color: COLORS.muted }}>inactive</span>}
                          {r.alias_count > 0 && (
                            <span style={{ marginLeft: 8, fontSize: 11, color: COLORS.muted }}>
                              +{r.alias_count} alias{r.alias_count === 1 ? '' : 'es'}
                            </span>
                          )}
                        </td>
                        <td style={{ ...numTd, width: 110, color: COLORS.muted, fontSize: 12 }}>
                          {r.listing_count} listing{r.listing_count === 1 ? '' : 's'}
                        </td>
                        <td style={{ ...td, textAlign: 'right', width: 140 }}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => run(() => adminSend(`resorts/${r.id}`, 'PATCH', { is_active: !r.is_active }) as never,
                              r.is_active ? 'Deactivated' : 'Reactivated')}
                            style={ghostBtn}
                          >
                            {r.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {/* ---- Unassigned sweep ---- */}
        {unassigned.length > 0 && (
          <div style={section}>
            <h2 style={h2}>Free-text names on listings</h2>
            <p style={sub}>
              Names still stored as text. Attaching one to a resort relinks every listing using it
              and remembers the spelling, so it resolves automatically next time.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <tbody>
                  {unassigned.map((u) => (
                    <tr key={u.name}>
                      <td style={{ ...td, fontWeight: 700 }}>{u.name}</td>
                      <td style={{ ...numTd, width: 110, color: COLORS.muted, fontSize: 12 }}>
                        {u.listing_count} listing{u.listing_count === 1 ? '' : 's'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', width: 260 }}>
                        <select
                          defaultValue=""
                          disabled={busy}
                          onChange={(e) => {
                            const id = e.target.value
                            e.target.value = ''
                            if (id) void run(() => adminSend(`resorts/${id}`, 'PATCH', { assign_name: u.name }) as never, `"${u.name}" attached`)
                          }}
                          style={controlStyle}
                        >
                          <option value="">Attach to…</option>
                          {resorts.filter((r) => r.is_active).map((r) => (
                            <option key={r.id} value={r.id}>{r.name} · {r.region}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ---- Review / merge dialog ---- */}
      {review && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Review resort submission"
          style={{ position: 'fixed', inset: 0, background: 'rgba(42,34,32,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto', zIndex: 50 }}
          onClick={(e) => { if (e.target === e.currentTarget) setReview(null) }}
        >
          <div style={{ ...panelStyle, width: '100%', maxWidth: 560 }}>
            <h2 style={{ margin: '0 0 4px', fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: COLORS.burgundy }}>
              Review &ldquo;{review.sub.raw_name}&rdquo;
            </h2>
            <p style={sub}>
              Correct the spelling if you need to — listings using the submitted text will point at
              whatever you approve here, and the original spelling is remembered so it resolves
              automatically in future.
            </p>

            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <label style={fieldLabel} htmlFor="rv-name">Canonical name</label>
                <input id="rv-name" value={review.name} onChange={(e) => setReview({ ...review, name: e.target.value })} style={{ ...controlStyle, width: '100%' }} />
              </div>
              <div>
                <label style={fieldLabel} htmlFor="rv-region">Region</label>
                <select id="rv-region" value={review.region} onChange={(e) => setReview({ ...review, region: e.target.value })} style={{ ...controlStyle, width: '100%' }}>
                  <option value="">Pick a region…</option>
                  {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={fieldLabel} htmlFor="rv-merge">Or merge into an existing resort</label>
                <select id="rv-merge" value={review.mergeInto} onChange={(e) => setReview({ ...review, mergeInto: e.target.value })} style={{ ...controlStyle, width: '100%' }}>
                  <option value="">Create it as a new resort</option>
                  {resorts.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.region}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 12, padding: '10px 12px', background: COLORS.tan, borderRadius: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>
                {preview === null ? 'Checking which listings this affects…' : `${preview.length} listing${preview.length === 1 ? '' : 's'} will be relinked`}
              </div>
              {preview && preview.length > 0 && (
                <div style={{ fontSize: 12, color: COLORS.muted, maxHeight: 110, overflowY: 'auto' }}>
                  {preview.slice(0, 20).map((l) => <div key={l.id}>· {l.title}</div>)}
                  {preview.length > 20 && <div>…and {preview.length - 20} more</div>}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" onClick={() => setReview(null)} style={ghostBtn}>Cancel</button>
              <button
                type="button"
                disabled={busy || !review.name.trim() || !review.region}
                onClick={approve}
                style={{ ...solidBtn, opacity: busy || !review.name.trim() || !review.region ? 0.5 : 1 }}
              >
                {busy ? 'Saving…' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
