// Public "stay pass" page — the target the reservation QR links to. Anyone with
// the code (the guest, or someone they show it to at check-in) can open it; it
// shows the place, city, dates, who's staying, and whatever the host attached
// (directions, gate code, city tips…). No auth, no sensitive data.
import type { Metadata } from 'next'
import { API_URL } from '@/lib/api'

export const dynamic = 'force-dynamic'

const C = {
  burgundy: '#5B0F16',
  burgundyLight: '#8A2530',
  gold: '#B07A2A',
  goldLight: '#F3C969',
  cream: '#F6F1E6',
  page: '#E4DECF',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'
const SERIF = 'Georgia, "Playfair Display", serif'

interface Stay {
  reservation_code: string | null
  title: string
  location: string | null
  region: string | null
  check_in: string
  check_out: string
  guests: number
  status: string
  payment_status: string
  host_notes: string | null
  guest_name: string | null
  host_name: string | null
  image: string | null
}

async function fetchStay(code: string): Promise<Stay | null> {
  try {
    const res = await fetch(`${API_URL}/api/local/stay/${encodeURIComponent(code)}`, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as Stay
  } catch {
    return null
  }
}

export const metadata: Metadata = { title: 'Your QuickIn stay', robots: { index: false } }

function fmt(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default async function StayPassPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const stay = await fetchStay(code)

  const shell: React.CSSProperties = {
    minHeight: '100vh',
    background: C.page,
    fontFamily: FONT,
    color: C.ink,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  }

  if (!stay) {
    return (
      <main style={shell}>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <h1 style={{ fontFamily: SERIF, fontSize: 26, color: C.burgundy, margin: '0 0 8px' }}>Stay not found</h1>
          <p style={{ color: C.muted }}>This pass code doesn’t match any reservation.</p>
          <a href="/explore" style={{ color: C.burgundy, fontWeight: 700 }}>Explore stays →</a>
        </div>
      </main>
    )
  }

  const city = stay.region || stay.location || ''
  const paid = stay.payment_status === 'paid'

  return (
    <main style={shell}>
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: '#fff',
          borderRadius: 28,
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(42,34,32,0.18)',
          border: '1px solid rgba(42,34,32,0.06)',
        }}
      >
        {/* Burgundy "boarding pass" header */}
        <div style={{ background: `linear-gradient(135deg,${C.burgundy},${C.burgundyLight})`, color: C.cream, padding: '22px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.goldLight }}>
            QuickIn · Stay pass{city ? ` · ${city}` : ''}
          </div>
          <h1 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 800, margin: '8px 0 4px' }}>{stay.title}</h1>
          {stay.location && <div style={{ opacity: 0.85, fontSize: 14 }}>{stay.location}</div>}
        </div>

        {stay.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={stay.image} alt={stay.title} style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
        )}

        <div style={{ padding: '20px 24px' }}>
          {/* Trip facts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Fact label="Check-in" value={fmt(stay.check_in)} />
            <Fact label="Check-out" value={fmt(stay.check_out)} />
            <Fact label="Guests" value={String(stay.guests)} />
            <Fact label="Guest" value={stay.guest_name || '—'} />
            {stay.host_name && <Fact label="Host" value={stay.host_name} />}
            <Fact label="Status" value={paid ? 'Paid · confirmed' : stay.status} />
          </div>

          {/* Reservation code */}
          <div style={{ marginTop: 18, background: C.tan, borderRadius: 14, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted }}>Reservation code</div>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 22, fontWeight: 800, color: C.burgundy, letterSpacing: '0.08em', marginTop: 4 }}>
              {stay.reservation_code || '—'}
            </div>
          </div>

          {/* Host-attached notes */}
          {stay.host_notes && stay.host_notes.trim() && (
            <div style={{ marginTop: 16, borderLeft: `4px solid ${C.gold}`, background: C.cream, borderRadius: '0 12px 12px 0', padding: '12px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.gold, marginBottom: 4 }}>
                From your host
              </div>
              <div style={{ fontSize: 14.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{stay.host_notes}</div>
            </div>
          )}

          <p style={{ marginTop: 18, fontSize: 12.5, color: C.muted, textAlign: 'center' }}>Show this pass at check-in.</p>
        </div>
      </div>
    </main>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  )
}
