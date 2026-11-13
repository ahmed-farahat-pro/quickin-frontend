'use client'

// The guest's identity on their /ops profile: phone, ID number and document type,
// and every file they uploaded — ID photos, ID-change evidence, payment screenshots
// and dispute photos — viewable here without leaving the page.
//
// What the server sends this panel is deliberately incomplete (see the backend's
// guest-identity-core.ts):
//
//  - The phone and ID number arrive MASKED. "Reveal" POSTs to ./identity, which writes
//    an audit row before it answers; the full values live in this component's state
//    only, and are gone on reload.
//  - Files arrive as references. Each "View" fetches one file from the audited
//    documents channel, so a file is only sent — and logged — when someone looks.
import { useEffect, useState } from 'react'
import { COLORS, SERIF } from '../../../ops-theme'
import { ghostBtn, panelStyle } from '../../ops-ui'
import { useOpsSession } from '../../ops-session'
import type { StaffModule } from '@/lib/local/staff-modules'
import { fmtDay, pill } from '../user-bits'

export type GuestFile = {
  kind: 'id_front' | 'id_back' | 'id_selfie' | 'id_change_front' | 'id_change_back' | 'payment_proof' | 'dispute_photo'
  id: string
  n?: number
  group: 'identity' | 'id_change' | 'payment' | 'dispute'
  label: string
  status: string | null
  context: string | null
  submitted_at: string | null
}

export type GuestIdentity = {
  phone_masked: string | null
  id_number_masked: string | null
  id_number_source: 'verification' | 'profile' | null
  doc_type: string | null
  doc_type_label: string | null
  verification_status: string
  verification_notes: string | null
  verification_source: string | null
  verification_submitted_at: string | null
  files: GuestFile[]
}

type Revealed = { phone: string | null; id_number: string | null }

/** The module that owns each kind — mirrors owningModuleFor in the backend's
 *  document-core.ts. Opening any of them also needs `documents`. */
const OWNER: Record<GuestFile['kind'], StaffModule> = {
  id_front: 'verifications', id_back: 'verifications', id_selfie: 'verifications',
  id_change_front: 'id_changes', id_change_back: 'id_changes',
  payment_proof: 'payments',
  dispute_photo: 'disputes',
}

const GROUP_TITLE: Record<GuestFile['group'], string> = {
  identity: 'Identity documents',
  id_change: 'ID change requests',
  payment: 'Payment screenshots',
  dispute: 'Dispute photos',
}

const MODULE_LABEL: Record<string, string> = {
  verifications: 'ID verifications', id_changes: 'ID change requests',
  payments: 'Payments & disputes', disputes: 'Guest disputes',
}

const VERIFICATION_TONE: Record<string, [string, string]> = {
  verified: ['#E4F3EC', COLORS.green],
  pending: ['#FDF0DC', '#8A5A12'],
  rejected: ['#FBE4E2', COLORS.red],
}

const h2: React.CSSProperties = { margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: COLORS.burgundy }
const dt: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: COLORS.muted }
const mono: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', letterSpacing: '.04em' }
const smallBtn: React.CSSProperties = { ...ghostBtn, padding: '6px 12px', fontSize: 12 }

function fileUrl(f: GuestFile): string {
  const base = `/api/local/admin/documents/${f.kind}/${f.id}`
  return f.n === undefined ? base : `${base}?n=${f.n}`
}

export function GuestIdentityPanel({ userId, identity }: { userId: string; identity: GuestIdentity | null }) {
  const { can } = useOpsSession()
  const [revealed, setRevealed] = useState<Revealed | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewer, setViewer] = useState<{ index: number; url: string | null; loading: boolean; error: string | null } | null>(null)

  const files = identity?.files ?? []
  const canOpen = (f: GuestFile) => can('documents') && can(OWNER[f.kind])

  // Free the decoded image whenever the viewer moves on or closes.
  useEffect(() => () => { if (viewer?.url) URL.revokeObjectURL(viewer.url) }, [viewer?.url])

  if (!identity) return null

  const reveal = async () => {
    setRevealing(true); setError(null)
    try {
      const res = await fetch(`/api/local/admin/users/${userId}/identity`, { method: 'POST', credentials: 'same-origin' })
      if (res.status === 403) { setError('Your account does not have the Users module.'); return }
      if (!res.ok) { setError('Could not reveal the details.'); return }
      setRevealed(await res.json())
    } catch {
      setError('Could not reveal the details.')
    } finally {
      setRevealing(false)
    }
  }

  /**
   * fetch → blob → object URL rather than <img src={apiUrl}>: an <img> turns 403
   * (missing permission) and 404 (nothing on file) into the same broken-image icon,
   * and the operator needs to know which. Every fetch writes an audit row.
   */
  const open = async (index: number) => {
    const f = files[index]
    setViewer({ index, url: null, loading: true, error: null })
    try {
      const res = await fetch(fileUrl(f), { credentials: 'same-origin' })
      const fail = (msg: string) => setViewer({ index, url: null, loading: false, error: msg })
      if (res.status === 403) return fail(`Opening this needs the Documents and ${MODULE_LABEL[OWNER[f.kind]]} permissions.`)
      if (res.status === 404) return fail('This file is no longer on file.')
      if (res.status === 415) return fail('This file is stored in a format that cannot be displayed.')
      if (!res.ok) return fail('Could not open the file.')
      const url = URL.createObjectURL(await res.blob())
      setViewer({ index, url, loading: false, error: null })
    } catch {
      setViewer({ index, url: null, loading: false, error: 'Could not open the file.' })
    }
  }

  // Step through only the files this operator may open.
  const step = (dir: 1 | -1) => {
    if (!viewer) return
    for (let i = viewer.index + dir; i >= 0 && i < files.length; i += dir) {
      if (canOpen(files[i])) return void open(i)
    }
  }

  const [vBg, vFg] = VERIFICATION_TONE[identity.verification_status] ?? [COLORS.tan, COLORS.muted]
  const groups = (Object.keys(GROUP_TITLE) as GuestFile['group'][])
    .map((g) => ({ g, items: files.map((f, i) => ({ f, i })).filter(({ f }) => f.group === g) }))
    .filter(({ items }) => items.length > 0)

  return (
    <div style={{ ...panelStyle, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={h2}>Identity &amp; documents</h2>
        <span style={{ flex: 1 }} />
        {revealed ? (
          <button type="button" onClick={() => setRevealed(null)} style={smallBtn}>Hide</button>
        ) : (
          <button type="button" disabled={revealing} onClick={reveal} style={smallBtn}>
            {revealing ? 'Revealing…' : 'Reveal phone & ID number'}
          </button>
        )}
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: COLORS.ink, background: '#FDF0DC', padding: '8px 10px', borderRadius: 10, lineHeight: 1.6 }}>
        Revealing the phone or ID number, and opening any file below, is recorded in the staff audit log.
      </p>
      {error && <p style={{ margin: '0 0 10px', fontSize: 13, color: COLORS.red, fontWeight: 700 }}>{error}</p>}

      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: 0, fontSize: 13 }}>
        <div>
          <dt style={dt}>Phone</dt>
          <dd style={{ margin: '2px 0 0', color: COLORS.ink, ...mono }}>
            {(revealed ? revealed.phone : identity.phone_masked) || '—'}
          </dd>
        </div>
        <div>
          <dt style={dt}>{identity.doc_type_label ? `${identity.doc_type_label} number` : 'ID number'}</dt>
          <dd style={{ margin: '2px 0 0', color: COLORS.ink, ...mono }}>
            {(revealed ? revealed.id_number : identity.id_number_masked) || '—'}
          </dd>
          {/* The profile field was typed by the user and never checked against a
              document; say so, rather than let it read like a verified number. */}
          {identity.id_number_source === 'profile' && (
            <dd style={{ margin: '2px 0 0', fontSize: 11, color: COLORS.muted }}>Self-declared on profile, not reviewed</dd>
          )}
        </div>
        <div>
          <dt style={dt}>ID verification</dt>
          <dd style={{ margin: '4px 0 0' }}>{pill(identity.verification_status, vBg, vFg)}</dd>
          {identity.verification_status === 'rejected' && identity.verification_notes && (
            <dd style={{ margin: '4px 0 0', fontSize: 12, color: COLORS.muted }}>{identity.verification_notes}</dd>
          )}
        </div>
        <div>
          <dt style={dt}>Submitted</dt>
          <dd style={{ margin: '2px 0 0', color: COLORS.ink }}>
            {fmtDay(identity.verification_submitted_at)}
            {identity.verification_source === 'signup' && <span style={{ color: COLORS.muted }}> · at signup</span>}
          </dd>
        </div>
      </dl>

      {groups.length === 0 ? (
        <p style={{ margin: '14px 0 0', fontSize: 13, color: COLORS.muted }}>
          This guest has not uploaded any ID documents, payment screenshots or dispute photos.
        </p>
      ) : (
        groups.map(({ g, items }) => (
          <div key={g} style={{ marginTop: 16 }}>
            <div style={{ ...dt, marginBottom: 6 }}>{GROUP_TITLE[g]} ({items.length})</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {items.map(({ f, i }) => {
                const allowed = canOpen(f)
                return (
                  <div
                    key={`${f.kind}-${f.id}-${f.n ?? ''}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 10px', border: `1px solid ${COLORS.tan}`, borderRadius: 12, fontSize: 13 }}
                  >
                    <span style={{ fontWeight: 700, color: COLORS.ink }}>{f.label}</span>
                    {f.context && <span style={{ color: COLORS.muted }}>{f.context}</span>}
                    {f.status && pill(f.status, COLORS.tan, COLORS.muted)}
                    <span style={{ color: COLORS.muted, fontSize: 12 }}>{fmtDay(f.submitted_at)}</span>
                    <span style={{ flex: 1 }} />
                    {allowed ? (
                      <button type="button" onClick={() => open(i)} style={smallBtn}>View</button>
                    ) : (
                      <span style={{ fontSize: 11, color: COLORS.muted }} title={`Needs Documents + ${MODULE_LABEL[OWNER[f.kind]]}`}>
                        No access
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      {viewer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={files[viewer.index]?.label}
          onClick={(e) => { if (e.target === e.currentTarget) setViewer(null) }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setViewer(null)
            if (e.key === 'ArrowRight') step(1)
            if (e.key === 'ArrowLeft') step(-1)
          }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
          style={{ position: 'fixed', inset: 0, background: 'rgba(20,14,12,.75)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 60, outline: 'none' }}
        >
          <div style={{ ...panelStyle, width: 'min(920px, 100%)', maxHeight: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: 18, color: COLORS.burgundy }}>{files[viewer.index]?.label}</h3>
              {files[viewer.index]?.context && <span style={{ fontSize: 12, color: COLORS.muted }}>{files[viewer.index].context}</span>}
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => step(-1)} style={smallBtn} aria-label="Previous file">←</button>
              <button type="button" onClick={() => step(1)} style={smallBtn} aria-label="Next file">→</button>
              {viewer.url && (
                <a href={viewer.url} target="_blank" rel="noopener noreferrer" style={{ ...smallBtn, textDecoration: 'none' }}>Open full size</a>
              )}
              <button type="button" onClick={() => setViewer(null)} style={smallBtn}>Close</button>
            </div>
            <div style={{ minHeight: 240, display: 'grid', placeItems: 'center', background: COLORS.cream, borderRadius: 12, overflow: 'auto' }}>
              {viewer.loading && <span style={{ fontSize: 13, color: COLORS.muted }}>Opening…</span>}
              {viewer.error && <span style={{ fontSize: 13, color: COLORS.red, fontWeight: 700, padding: 16, textAlign: 'center' }}>{viewer.error}</span>}
              {viewer.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={viewer.url} alt={files[viewer.index]?.label} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' }} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
