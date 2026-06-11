'use client'

// Minimal admin landing. The hardcoded admin (username "admin") logs in via the
// normal login form; on success they're routed here. Gated client-side by the
// stored role. A fuller admin panel can grow from this page.
import { useEffect, useState } from 'react'
import { API_URL } from '@/lib/api'

const COLORS = { burgundy: '#5B0F16', cream: '#F6F1E6', tan: '#EFE6D8', ink: '#2A2220', muted: '#6B6055' }
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

interface StoredUser { email?: string; role?: string; full_name?: string }

export default function AdminPage() {
  const [user, setUser] = useState<StoredUser | null>(null)
  const [checked, setChecked] = useState(false)
  const [listingCount, setListingCount] = useState<number | null>(null)

  useEffect(() => {
    let u: StoredUser | null = null
    try { const raw = localStorage.getItem('qk_user'); if (raw) u = JSON.parse(raw) } catch {}
    if (!u || u.role !== 'admin') { window.location.href = '/login'; return }
    setUser(u); setChecked(true)
    fetch(`${API_URL}/api/local/listings`)
      .then((r) => r.json())
      .then((d) => setListingCount(Array.isArray(d) ? d.length : null))
      .catch(() => setListingCount(null))
  }, [])

  function logout() {
    try { localStorage.removeItem('qk_token'); localStorage.removeItem('qk_user') } catch {}
    window.location.href = '/login'
  }

  if (!checked) return null

  return (
    <main style={{ minHeight: '100vh', background: COLORS.cream, color: COLORS.ink, fontFamily: FONT, padding: '40px 20px' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/logo.png" alt="QuickIn" style={{ height: 40 }} />
            <div>
              <h1 style={{ margin: 0, fontSize: 24, color: COLORS.burgundy }}>Admin Dashboard</h1>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: COLORS.muted }}>Signed in as {user?.email} · role: {user?.role}</p>
            </div>
          </div>
          <button onClick={logout} style={{ appearance: 'none', border: `1px solid ${COLORS.burgundy}`, background: '#fff', color: COLORS.burgundy, fontWeight: 600, fontSize: 14, fontFamily: FONT, borderRadius: 999, padding: '8px 18px', cursor: 'pointer' }}>Log out</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          <Card label="Listings" value={listingCount === null ? '—' : String(listingCount)} />
          <Card label="Roles" value="user · host · admin" />
          <Card label="Backend" value="connected" />
        </div>

        <div style={{ marginTop: 26, background: '#fff', borderRadius: 20, padding: '20px 22px', border: `1px solid ${COLORS.tan}` }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 17, color: COLORS.burgundy }}>Quick links</h2>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: COLORS.ink, fontSize: 14, lineHeight: 1.9 }}>
            <li><a href="/explore" style={{ color: COLORS.burgundy }}>Browse listings (Explore)</a></li>
            <li><a href="/reservations" style={{ color: COLORS.burgundy }}>Reservations</a></li>
          </ul>
        </div>
      </div>
    </main>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 20, padding: '18px 20px', border: `1px solid ${COLORS.tan}` }}>
      <p style={{ margin: 0, fontSize: 12, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
      <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700, color: COLORS.ink }}>{value}</p>
    </div>
  )
}
