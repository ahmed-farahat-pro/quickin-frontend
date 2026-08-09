'use client'

// Raising an issue about a stay, from the guest's reservations list.
//
// Collapsed to a single link until tapped: most reservations are fine, and a
// permanently-open complaint form on every booking invites complaints. Once a
// dispute exists on a booking, the link is replaced by its status and history,
// so the guest can follow it without going anywhere else.
//
// Photos are compressed client-side before they become data-URLs — the same
// path the ID upload uses, for the same reason: an uncompressed phone photo is
// 7–11 MB of base64 and dies against the platform's request-body limit with no
// usable error.
import { useState } from 'react'
import { fileToCompressedDataUrl } from '@/lib/image'
import {
  DISPUTE_CATEGORIES,
  MAX_DESCRIPTION_CHARS,
  MAX_PHOTOS,
  MAX_PHOTO_CHARS,
  MIN_DESCRIPTION_CHARS,
  categoryLabel,
  disputeReference,
  eventSummary,
  statusLabel,
  statusTone,
} from '@/lib/local/disputes-core'

const C = { burgundy: '#5B0F16', cream: '#F6F1E6', tan: '#EFE6D8', ink: '#2A2220', muted: '#6B6055' }

const TONE: Record<string, string> = {
  amber: '#9a6b00',
  blue: '#1A56A8',
  green: '#177245',
  grey: C.muted,
}

export interface DisputeSummary {
  id: string
  booking_id: string
  category: string
  description: string
  photos: string[]
  status: string
  resolution: string | null
  created_at: string
}

interface DisputeEvent {
  id: string
  from_status: string | null
  to_status: string
  note: string | null
  actor_name: string | null
  created_at: string
}

const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color: C.burgundy, fontWeight: 700, fontSize: 13.5, fontFamily: 'inherit',
}

const field: React.CSSProperties = {
  fontFamily: 'inherit', fontSize: 13.5, padding: '8px 11px', width: '100%',
  border: `1px solid ${C.tan}`, borderRadius: 10, background: '#fff', color: C.ink,
  boxSizing: 'border-box',
}

/**
 * One booking's dispute affordance: the existing dispute if there is one,
 * otherwise a link that opens the form.
 *
 * `eligible` comes from the server (a confirmed or completed booking) — it is
 * not re-derived here, so the client and the API can't disagree about what can
 * be disputed.
 */
export function DisputePanel({
  bookingId,
  eligible,
  existing,
}: {
  bookingId: string
  eligible: boolean
  existing?: DisputeSummary | null
}) {
  const [open, setOpen] = useState(false)
  const [dispute, setDispute] = useState<DisputeSummary | null>(existing ?? null)
  const [events, setEvents] = useState<DisputeEvent[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const [category, setCategory] = useState<string>('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // allow re-picking the same file
    if (!files.length) return
    setError(null)
    const room = MAX_PHOTOS - photos.length
    if (room <= 0) { setError(`You can attach up to ${MAX_PHOTOS} photos.`); return }
    const next: string[] = []
    for (const file of files.slice(0, room)) {
      try {
        const url = await fileToCompressedDataUrl(file)
        if (url.length > MAX_PHOTO_CHARS) {
          setError('One of those photos is too large even after compression. Please try a smaller one.')
          continue
        }
        next.push(url)
      } catch {
        setError('We could not read one of those photos. Please try a different one.')
      }
    }
    if (next.length) setPhotos((p) => [...p, ...next])
  }

  async function submit() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/local/disputes', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, category, description, photos }),
      })
      const data = await res.json().catch(() => ({}))
      // The API's validation messages are written for the guest ("please add a
      // bit more detail"), so they surface verbatim rather than being replaced.
      if (!res.ok) throw new Error(data.error || 'Could not send this. Please try again.')
      setDispute(data.dispute)
      setOpen(false)
      setCategory(''); setDescription(''); setPhotos([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send this. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function loadHistory(id: string) {
    setShowHistory(true)
    if (events) return
    try {
      const res = await fetch(`/api/local/disputes?id=${encodeURIComponent(id)}`, { credentials: 'same-origin' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setEvents(data.events ?? [])
    } catch { /* the summary above is still useful without the timeline */ }
  }

  // ---- Already raised ------------------------------------------------------
  if (dispute) {
    const tone = TONE[statusTone(dispute.status)] ?? C.muted
    return (
      <div style={{ background: C.cream, borderRadius: 12, padding: '10px 12px', marginTop: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}>
          <strong style={{ fontSize: 13.5 }}>Issue raised</strong>
          <span style={{ fontSize: 12.5, color: C.muted }}>{disputeReference(dispute.id)}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: tone }}>{statusLabel(dispute.status)}</span>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
          {categoryLabel(dispute.category)}
        </div>

        {dispute.resolution && (
          <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
            <strong>Outcome: </strong>{dispute.resolution}
          </p>
        )}

        {!showHistory ? (
          <button type="button" onClick={() => loadHistory(dispute.id)} style={{ ...linkBtn, marginTop: 8, fontSize: 13 }}>
            See history
          </button>
        ) : (
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            {!events ? (
              <span style={{ fontSize: 13, color: C.muted }}>Loading…</span>
            ) : events.map((ev) => (
              <div key={ev.id} style={{ background: '#fff', borderRadius: 10, padding: '7px 10px' }}>
                <div style={{ fontSize: 12.5, color: C.muted }}>
                  {eventSummary(ev)} · {new Date(ev.created_at).toLocaleDateString()}
                </div>
                {ev.note && <p style={{ margin: '3px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>{ev.note}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // A booking that can't be disputed shows nothing at all — an explanation of
  // why you can't complain is noise on a reservation that is going fine.
  if (!eligible) return null

  // ---- The form ------------------------------------------------------------
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ ...linkBtn, marginTop: 6, color: C.muted, fontWeight: 600, fontSize: 13 }}>
        Something wrong with this stay?
      </button>
    )
  }

  const tooShort = description.trim().length > 0 && description.trim().length < MIN_DESCRIPTION_CHARS
  const canSubmit = Boolean(category) && description.trim().length >= MIN_DESCRIPTION_CHARS && !busy

  return (
    <div style={{ background: C.cream, borderRadius: 12, padding: 12, marginTop: 8, display: 'grid', gap: 10 }}>
      <div>
        <label htmlFor={`cat-${bookingId}`} style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
          What is the issue about?
        </label>
        <select
          id={`cat-${bookingId}`}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={field}
        >
          <option value="">Choose one…</option>
          {DISPUTE_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`desc-${bookingId}`} style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
          What happened?
        </label>
        <textarea
          id={`desc-${bookingId}`}
          value={description}
          maxLength={MAX_DESCRIPTION_CHARS}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Dates, what you expected, and what you found. The more specific, the faster we can sort it."
          style={{ ...field, resize: 'vertical' }}
        />
        {tooShort && (
          <span style={{ fontSize: 12, color: C.muted }}>
            A little more detail, please — at least {MIN_DESCRIPTION_CHARS} characters.
          </span>
        )}
      </div>

      <div>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
          Photos <span style={{ fontWeight: 400, color: C.muted }}>(optional, up to {MAX_PHOTOS})</span>
        </span>
        {photos.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {photos.map((src, i) => (
              <span key={i} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Attachment ${i + 1}`} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                <button
                  type="button"
                  onClick={() => setPhotos((p) => p.filter((_, n) => n !== i))}
                  aria-label={`Remove photo ${i + 1}`}
                  style={{
                    position: 'absolute', top: -6, insetInlineEnd: -6, width: 20, height: 20, lineHeight: '18px',
                    borderRadius: 999, border: 'none', cursor: 'pointer', background: C.ink, color: '#fff', fontSize: 12,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {photos.length < MAX_PHOTOS && (
          <input type="file" accept="image/*" multiple onChange={onPick} style={{ fontSize: 13 }} />
        )}
      </div>

      {error && <p style={{ margin: 0, fontSize: 13, color: '#b3261e' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          style={{
            background: C.burgundy, color: '#fff', border: 'none', borderRadius: 10,
            padding: '8px 16px', fontWeight: 700, fontSize: 13.5, fontFamily: 'inherit',
            cursor: canSubmit ? 'pointer' : 'default', opacity: canSubmit ? 1 : 0.6,
          }}
        >
          {busy ? 'Sending…' : 'Send to QuickIn'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(null) }} style={{ ...linkBtn, color: C.muted, fontWeight: 600 }}>
          Cancel
        </button>
      </div>

      <p style={{ margin: 0, fontSize: 11.5, color: C.muted }}>
        This goes to the QuickIn team, not to your host.
      </p>
    </div>
  )
}
