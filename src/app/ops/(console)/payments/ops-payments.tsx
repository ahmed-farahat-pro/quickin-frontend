'use client'

// Payments ops (World 1) — two panels:
//  1. Instapay destination: GET/PUT /api/local/admin/settings/instapay — the
//     handle/number, the deep link, the QR image and the instructions guests see.
//  2. Disputes queue: GET /api/local/admin/payments (open disputes) with a per-row
//     "view screenshot" (GET /api/local/bookings/:id/payment-proof) and Approve / Uphold
//     (POST /api/local/admin/payments). All fetches are cookie-authed (same-origin) and
//     admin-gated server-side. Strings are hardcoded English to keep the change contained.
import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { OpsSkeletonFields, OpsSkeletonQueueRows } from '../ops-skeleton'
import { MAX_QR_CHARS, qrPayload } from '@/lib/local/payment-config-core'

const C = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 20,
  border: '1px solid rgba(42,34,32,0.06)',
  boxShadow: '0 6px 24px rgba(42,34,32,0.07)',
  padding: '20px 22px',
}

const primaryBtn: React.CSSProperties = {
  background: C.burgundy,
  color: '#fff',
  border: 'none',
  borderRadius: 999,
  padding: '9px 22px',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const ghostBtn: React.CSSProperties = {
  background: '#fff',
  color: C.burgundy,
  border: `1px solid ${C.tan}`,
  borderRadius: 999,
  padding: '8px 18px',
  fontWeight: 700,
  fontSize: 13.5,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const dangerBtn: React.CSSProperties = {
  background: '#fff',
  color: '#b3261e',
  border: '1px solid rgba(179,38,30,0.4)',
  borderRadius: 999,
  padding: '8px 18px',
  fontWeight: 700,
  fontSize: 13.5,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 12,
  border: `1px solid ${C.tan}`,
  fontSize: 14,
  fontFamily: 'inherit',
  color: C.ink,
  background: '#fff',
}

/**
 * The three payloads page.tsx loads on the server, or null if that load failed.
 *
 * Each panel seeds its state from this and skips its mount fetch. When it is null
 * every panel falls back to fetching for itself, which is what used to happen
 * unconditionally — so a DB hiccup during the render costs a moment, not the screen.
 */
export interface OpsPaymentsInitial {
  config: {
    instapay_handle?: string
    instapay_link?: string
    instapay_qr_image?: string
    instructions?: string
  }
  pending: PendingProof[]
  disputes: Dispute[]
}

export function OpsPayments({ initial }: { initial: OpsPaymentsInitial | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <InstapaySettings initial={initial?.config ?? null} />
      <PendingPaymentsQueue initial={initial?.pending ?? null} />
      <DisputesQueue initial={initial?.disputes ?? null} />
    </div>
  )
}

// ---- Payments awaiting confirmation -----------------------------------------

interface PendingProof {
  booking_id: string
  reservation_code: string | null
  title: string | null
  guest_name: string | null
  guest_email: string | null
  amount: number
  submitted_at: string
  check_in: string
  check_out: string
}

/**
 * Transfer screenshots waiting for a first decision.
 *
 * This queue is new, and it closes a real hole: a guest can only pay once a booking is
 * 'confirmed', but the only path that could approve a fresh screenshot required the
 * booking to be 'pending'. So a normal payment had no reviewer — the money was sent
 * and nothing ever moved.
 */
function PendingPaymentsQueue({ initial }: { initial: PendingProof[] | null }) {
  const [rows, setRows] = useState<PendingProof[] | null>(initial)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; msg: string } | null>(null)
  const [proofs, setProofs] = useState<Record<string, ProofState>>({})

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/local/admin/payments', { credentials: 'same-origin' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load')
      const data = await res.json()
      setRows(data?.pending ?? [])
    } catch (e) {
      setRows([])
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [])

  // Only when the server didn't hand us rows. `initial` is a prop that never changes,
  // so this runs at most once; every later refresh comes from an action instead.
  useEffect(() => { if (initial === null) load() }, [initial, load])

  async function showProof(id: string) {
    if (proofs[id]?.image) {
      setProofs((p) => { const n = { ...p }; delete n[id]; return n })
      return
    }
    setProofs((p) => ({ ...p, [id]: { loading: true, image: null, error: null } }))
    try {
      const res = await fetch(`/api/local/bookings/${id}/payment-proof`, { credentials: 'same-origin' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not load the screenshot')
      const data = await res.json()
      setProofs((p) => ({ ...p, [id]: { loading: false, image: data.image_data ?? null, error: null } }))
    } catch (e) {
      setProofs((p) => ({ ...p, [id]: { loading: false, image: null, error: e instanceof Error ? e.message : 'Could not load' } }))
    }
  }

  async function decide(id: string, action: 'accept' | 'reject') {
    let reason: string | null = null
    if (action === 'reject') {
      // Shown to the guest, who can then upload a clearer screenshot — so it has to
      // say something useful, not just "no".
      reason = window.prompt('Why is this screenshot not acceptable? The guest will see this.')
      if (!reason || !reason.trim()) return
    }
    setBusyId(id); setRowError(null)
    try {
      const res = await fetch('/api/local/admin/payments', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: id, action, reason }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'That did not work')
      await load()
    } catch (e) {
      setRowError({ id, msg: e instanceof Error ? e.message : 'That did not work' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section style={card}>
      <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: C.burgundy }}>
        Awaiting confirmation {rows && rows.length > 0 ? `(${rows.length})` : ''}
      </h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
        Guests who have transferred and uploaded a receipt. Accepting confirms the booking
        as paid; rejecting asks them for a clearer screenshot without cancelling the stay.
      </p>

      {error && <p style={{ margin: '0 0 12px', fontSize: 13, color: '#b3261e', fontWeight: 600 }}>{error}</p>}
      {rows === null && <OpsSkeletonQueueRows rows={3} />}
      {rows?.length === 0 && <p style={{ fontSize: 13, color: C.muted }}>No payments waiting.</p>}

      <div style={{ display: 'grid', gap: 12 }}>
        {rows?.map((r) => (
          <div key={r.booking_id} style={{ border: `1px solid ${C.tan}`, borderRadius: 14, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: 14.5, color: C.ink }}>{r.title ?? 'Stay'}</strong>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                  {r.guest_name || r.guest_email} · {r.check_in} → {r.check_out}
                  {r.reservation_code ? ` · ${r.reservation_code}` : ''}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  Sent {new Date(r.submitted_at).toLocaleString()}
                </div>
              </div>
              <strong style={{ fontSize: 16, color: C.burgundy, whiteSpace: 'nowrap' }}>
                EGP {Math.round(Number(r.amount) || 0).toLocaleString()}
              </strong>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => showProof(r.booking_id)} style={ghostBtn}>
                {proofs[r.booking_id]?.image ? 'Hide screenshot' : proofs[r.booking_id]?.loading ? 'Loading…' : 'View screenshot'}
              </button>
              <button type="button" disabled={busyId === r.booking_id} onClick={() => decide(r.booking_id, 'accept')} style={primaryBtn}>
                {busyId === r.booking_id ? 'Working…' : 'Accept'}
              </button>
              <button type="button" disabled={busyId === r.booking_id} onClick={() => decide(r.booking_id, 'reject')} style={ghostBtn}>
                Reject
              </button>
            </div>

            {proofs[r.booking_id]?.error && (
              <p style={{ margin: '10px 0 0', fontSize: 13, color: '#b3261e' }}>{proofs[r.booking_id]?.error}</p>
            )}
            {proofs[r.booking_id]?.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proofs[r.booking_id]!.image!}
                alt="Transfer screenshot"
                style={{ marginTop: 12, maxWidth: '100%', maxHeight: 420, borderRadius: 12, border: `1px solid ${C.tan}`, display: 'block' }}
              />
            )}
            {rowError?.id === r.booking_id && (
              <p style={{ margin: '10px 0 0', fontSize: 13, color: '#b3261e' }}>{rowError.msg}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ---- Instapay destination ---------------------------------------------------

/**
 * Re-encode a picked file as a PNG data URL, downscaled so the stored value
 * stays small (it travels inline in every payment-config response).
 *
 * PNG rather than JPEG on purpose: JPEG ringing around the QR modules is exactly
 * the kind of artifact that stops a banking app from scanning the code. The
 * white fill flattens transparency for the same reason.
 */
async function fileToQrDataUrl(file: File): Promise<string> {
  const MAX_EDGE = 640
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('Could not read that image — try a PNG or JPEG screenshot')
  }
  const longEdge = Math.max(bitmap.width, bitmap.height)
  const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read that image')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.toDataURL('image/png')
}

function InstapaySettings({ initial }: { initial: OpsPaymentsInitial['config'] | null }) {
  const [handle, setHandle] = useState(initial?.instapay_handle ?? '')
  const [link, setLink] = useState(initial?.instapay_link ?? '')
  const [qrImage, setQrImage] = useState(initial?.instapay_qr_image ?? '')
  const [instructions, setInstructions] = useState(initial?.instructions ?? '')
  const [loading, setLoading] = useState(initial === null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // What a guest's app would encode if no QR image is uploaded. Kept in sync
  // with the server by importing the same helper the API uses.
  const generated = qrPayload(handle, link)

  function apply(data: {
    instapay_handle?: string
    instapay_link?: string
    instapay_qr_image?: string
    instructions?: string
  }) {
    setHandle(data.instapay_handle ?? '')
    setLink(data.instapay_link ?? '')
    setQrImage(data.instapay_qr_image ?? '')
    setInstructions(data.instructions ?? '')
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/local/admin/settings/instapay', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('Failed to load settings')
      apply(await res.json())
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to load settings' })
    } finally {
      setLoading(false)
    }
  }, [])

  // See PendingPaymentsQueue — only fetch when the server render didn't supply it.
  useEffect(() => {
    if (initial === null) load()
  }, [initial, load])

  async function pickQr(file: File | undefined) {
    if (!file) return
    setMsg(null)
    try {
      const url = await fileToQrDataUrl(file)
      if (url.length > MAX_QR_CHARS) {
        throw new Error('That QR image is too large — crop it to just the code and try again')
      }
      setQrImage(url)
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not read that image' })
    } finally {
      // Let the same file be re-picked after a failure.
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/local/admin/settings/instapay', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instapay_handle: handle,
          instapay_link: link,
          instapay_qr_image: qrImage,
          instructions,
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || 'Failed to save')
      }
      apply(await res.json())
      setMsg({ kind: 'ok', text: 'Saved' })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section style={card}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: C.ink }}>Instapay destination</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13.5, color: C.muted }}>
        The number, QR code and link guests pay to. Shown at checkout in the app and on the web.
      </p>

      {loading ? (
        <OpsSkeletonFields fields={4} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
            Instapay number or handle
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="yourname@instapay or 01xxxxxxxxx"
              style={{ ...inputStyle, marginTop: 6 }}
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
            Instapay link (optional)
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://ipn.eg/S/yourname/instapay/ABC123"
              style={{ ...inputStyle, marginTop: 6 }}
            />
            <span style={{ display: 'block', marginTop: 5, fontSize: 12.5, fontWeight: 400, color: C.muted }}>
              Opens Instapay straight to your account. Must start with https://
            </span>
          </label>

          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>QR code</span>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div
                style={{
                  width: 148,
                  height: 148,
                  flexShrink: 0,
                  borderRadius: 14,
                  border: `1px solid ${C.tan}`,
                  background: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 8,
                  boxSizing: 'border-box',
                }}
              >
                {qrImage ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={qrImage}
                    alt="Instapay QR code"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                  />
                ) : generated ? (
                  <QRCodeSVG value={generated} size={128} level="M" marginSize={1} title="Instapay QR code" />
                ) : (
                  <span style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: 8 }}>
                    Add a number or link
                  </span>
                )}
              </div>

              <div style={{ flex: '1 1 240px', minWidth: 220 }}>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
                  {qrImage
                    ? 'Your uploaded QR. Guests see exactly this image.'
                    : generated
                      ? `Generated automatically from the ${link.trim() ? 'link' : 'number'} above. Upload the official QR from the Instapay app if you want guests to scan that instead.`
                      : 'Upload the official QR from the Instapay app, or fill in the number or link above to generate one.'}
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={(e) => pickQr(e.target.files?.[0])}
                  style={{ fontSize: 13, fontFamily: 'inherit', color: C.ink, maxWidth: '100%' }}
                />
                {qrImage && (
                  <button
                    type="button"
                    onClick={() => setQrImage('')}
                    style={{ ...ghostBtn, marginTop: 10, fontSize: 13, padding: '6px 14px' }}
                  >
                    Remove uploaded QR
                  </button>
                )}
              </div>
            </div>
          </div>

          <label style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
            Instructions (optional)
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Send the exact total, then upload the confirmation screenshot."
              rows={3}
              style={{ ...inputStyle, marginTop: 6, resize: 'vertical' }}
            />
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {msg && (
              <span style={{ fontSize: 13, color: msg.kind === 'ok' ? '#177245' : '#b3261e' }}>{msg.text}</span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

// ---- Disputes queue ---------------------------------------------------------

interface Dispute {
  booking_id: string
  reservation_code: string | null
  title: string
  guest_id: string
  guest_name: string | null
  guest_email: string | null
  host_id: string | null
  total_price: number
  reject_reason: string | null
  dispute_note: string | null
  submitted_at: string | null
  disputed_at: string | null
}

interface ProofState {
  loading: boolean
  image: string | null
  error: string | null
}

function DisputesQueue({ initial }: { initial: Dispute[] | null }) {
  const [disputes, setDisputes] = useState<Dispute[] | null>(initial)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; msg: string } | null>(null)
  const [proofs, setProofs] = useState<Record<string, ProofState>>({})

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/local/admin/payments', { credentials: 'same-origin' })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || 'Failed to load disputes')
      }
      const data = await res.json()
      // The route returns both queues now; this component owns the disputes half.
      setDisputes(Array.isArray(data) ? data : (data?.disputes ?? []))
    } catch (e) {
      setDisputes([])
      setError(e instanceof Error ? e.message : 'Failed to load disputes')
    }
  }, [])

  // See PendingPaymentsQueue — only fetch when the server render didn't supply it.
  // This is also what stops the two queues requesting the same endpoint twice on
  // every visit, since both read /api/local/admin/payments for their half of it.
  useEffect(() => {
    if (initial === null) load()
  }, [initial, load])

  async function resolve(id: string, action: 'approve' | 'uphold') {
    let note: string | undefined
    if (action === 'uphold') {
      const entered = window.prompt('Note for upholding the rejection? (optional)') ?? ''
      note = entered.trim() || undefined
    }
    setBusyId(id)
    setRowError(null)
    try {
      const res = await fetch('/api/local/admin/payments', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note ? { booking_id: id, action, note } : { booking_id: id, action }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || 'Failed to resolve dispute')
      }
      await load()
    } catch (e) {
      setRowError({ id, msg: e instanceof Error ? e.message : 'Failed to resolve dispute' })
    } finally {
      setBusyId(null)
    }
  }

  async function toggleProof(id: string) {
    const existing = proofs[id]
    if (existing && existing.image) {
      setProofs((p) => {
        const next = { ...p }
        delete next[id]
        return next
      })
      return
    }
    setProofs((p) => ({ ...p, [id]: { loading: true, image: null, error: null } }))
    try {
      const res = await fetch(`/api/local/bookings/${id}/payment-proof`, { credentials: 'same-origin' })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || 'Could not load the screenshot')
      }
      const data = await res.json()
      setProofs((p) => ({ ...p, [id]: { loading: false, image: data.image_data ?? null, error: null } }))
    } catch (e) {
      setProofs((p) => ({
        ...p,
        [id]: { loading: false, image: null, error: e instanceof Error ? e.message : 'Could not load the screenshot' },
      }))
    }
  }

  return (
    <section style={card}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: C.ink }}>Payment disputes</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13.5, color: C.muted }}>
        Transfers a guest disputed after a host rejection. Approve to confirm &amp; mark paid, or uphold the rejection.
      </p>

      {disputes === null ? (
        <OpsSkeletonQueueRows rows={2} />
      ) : error && disputes.length === 0 ? (
        <div style={{ textAlign: 'center', color: C.muted }}>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: '#b3261e' }}>{error}</p>
          <button onClick={load} style={ghostBtn}>Try again</button>
        </div>
      ) : disputes.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, color: C.muted }}>No open disputes.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {disputes.map((d) => {
            const proof = proofs[d.booking_id]
            return (
              <article
                key={d.booking_id}
                style={{
                  border: `1px solid ${C.tan}`,
                  borderRadius: 16,
                  padding: '14px 16px',
                  background: C.cream,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: C.ink }}>{d.title}</h3>
                    <p style={{ margin: '3px 0 0', fontSize: 13.5, color: C.muted }}>
                      {d.guest_name || 'Guest'}
                      {d.guest_email ? ` · ${d.guest_email}` : ''}
                      {d.reservation_code ? ` · ${d.reservation_code}` : ''}
                    </p>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.burgundy, whiteSpace: 'nowrap' }}>
                    {d.total_price}
                  </div>
                </div>

                {d.reject_reason && (
                  <p style={{ margin: '10px 0 0', fontSize: 13.5, color: C.ink }}>
                    <strong>Host reason:</strong> {d.reject_reason}
                  </p>
                )}
                {d.dispute_note && (
                  <p style={{ margin: '6px 0 0', fontSize: 13.5, color: C.ink }}>
                    <strong>Guest says:</strong> {d.dispute_note}
                  </p>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14, alignItems: 'center' }}>
                  <button
                    onClick={() => resolve(d.booking_id, 'approve')}
                    disabled={busyId === d.booking_id}
                    style={{ ...primaryBtn, padding: '8px 18px', opacity: busyId === d.booking_id ? 0.7 : 1 }}
                  >
                    {busyId === d.booking_id ? 'Working…' : 'Approve'}
                  </button>
                  <button
                    onClick={() => resolve(d.booking_id, 'uphold')}
                    disabled={busyId === d.booking_id}
                    style={{ ...dangerBtn, opacity: busyId === d.booking_id ? 0.7 : 1 }}
                  >
                    Uphold rejection
                  </button>
                  <button
                    onClick={() => toggleProof(d.booking_id)}
                    disabled={proof?.loading}
                    style={{ ...ghostBtn, fontSize: 13, padding: '7px 16px' }}
                  >
                    {proof?.loading
                      ? 'Loading screenshot…'
                      : proof?.image
                        ? 'Hide screenshot'
                        : 'View screenshot'}
                  </button>
                </div>

                {proof?.error && (
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: '#b3261e' }}>{proof.error}</p>
                )}
                {proof?.image && (
                  <div style={{ marginTop: 10 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={proof.image}
                      alt="Transfer screenshot"
                      style={{
                        maxWidth: '100%',
                        maxHeight: 420,
                        borderRadius: 14,
                        border: '1px solid rgba(42,34,32,0.1)',
                        display: 'block',
                      }}
                    />
                  </div>
                )}

                {rowError?.id === d.booking_id && (
                  <p style={{ margin: '10px 0 0', fontSize: 13, color: '#b3261e' }}>{rowError.msg}</p>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
