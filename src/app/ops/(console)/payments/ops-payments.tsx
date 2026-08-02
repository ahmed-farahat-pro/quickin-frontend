'use client'

// Payments ops (World 1) — two panels:
//  1. Instapay settings: GET/PUT /api/local/admin/settings/instapay (handle + instructions).
//  2. Disputes queue: GET /api/local/admin/payments (open disputes) with a per-row
//     "view screenshot" (GET /api/local/bookings/:id/payment-proof) and Approve / Uphold
//     (POST /api/local/admin/payments). All fetches are cookie-authed (same-origin) and
//     admin-gated server-side. Strings are hardcoded English to keep the change contained.
import { useCallback, useEffect, useState } from 'react'

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

export function OpsPayments() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <InstapaySettings />
      <DisputesQueue />
    </div>
  )
}

// ---- Instapay settings ------------------------------------------------------

function InstapaySettings() {
  const [handle, setHandle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/local/admin/settings/instapay', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('Failed to load settings')
      const data = await res.json()
      setHandle(data.instapay_handle ?? '')
      setInstructions(data.instructions ?? '')
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to load settings' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/local/admin/settings/instapay', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instapay_handle: handle, instructions }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || 'Failed to save')
      }
      const data = await res.json()
      setHandle(data.instapay_handle ?? '')
      setInstructions(data.instructions ?? '')
      setMsg({ kind: 'ok', text: 'Saved' })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section style={card}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: C.ink }}>Instapay handle</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13.5, color: C.muted }}>
        The destination guests transfer to, shown at checkout.
      </p>

      {loading ? (
        <p style={{ fontSize: 14, color: C.muted }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
            Instapay handle
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="yourname@instapay"
              style={{ ...inputStyle, marginTop: 6 }}
            />
          </label>
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

function DisputesQueue() {
  const [disputes, setDisputes] = useState<Dispute[] | null>(null)
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
      setDisputes(Array.isArray(data) ? data : [])
    } catch (e) {
      setDisputes([])
      setError(e instanceof Error ? e.message : 'Failed to load disputes')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

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
        <p style={{ fontSize: 14, color: C.muted }}>Loading…</p>
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
