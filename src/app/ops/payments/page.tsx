// QuickIn — Instapay payments ops (World 1, no Supabase).
// Server component: reads the qk_token cookie, resolves the signed-in user's role
// the same tolerant way the API routes do, and only renders for role='admin'.
// Two panels live in the 'use client' component below: the Instapay handle settings
// form and the payment-disputes queue. Strings are hardcoded English (this ops page
// is intentionally not wired into next-intl to keep the change contained).
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { verifyToken, getUserRowByEmail } from '@/lib/local/auth'
import { pool } from '@/lib/local/pool'
import { OpsPayments } from './ops-payments'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Instapay payments — QuickIn Ops',
  robots: { index: false, follow: false },
}

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
}

const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

/** Resolve the signed-in user + role from the qk_token cookie (tolerant of a
 *  missing users.role column, exactly like getUserWithRole on the API side). */
async function getAdminUser(): Promise<{ id: string; role: 'admin' | 'host' | 'user' } | null> {
  const token = (await cookies()).get('qk_token')?.value
  if (!token) return null
  const claims = verifyToken(token)
  if (!claims?.email) return null
  try {
    const row = await getUserRowByEmail(claims.email)
    if (!row) return null
    let role: 'admin' | 'host' | 'user' = 'user'
    try {
      const { rows } = await pool.query(`SELECT role FROM users WHERE id = $1`, [row.id])
      const r = String(rows[0]?.role ?? '').toLowerCase()
      if (r === 'admin') role = 'admin'
      else if (r === 'host') role = 'host'
    } catch {
      /* role column absent */
    }
    if (role === 'user' && row.is_host) role = 'host'
    return { id: row.id, role }
  } catch {
    return null
  }
}

export default async function OpsPaymentsPage() {
  const user = await getAdminUser()
  const isAdmin = user?.role === 'admin'

  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.cream,
        color: COLORS.ink,
        fontFamily: FONT,
      }}
    >
      <header
        style={{
          background: `linear-gradient(180deg, ${COLORS.tan} 0%, ${COLORS.cream} 100%)`,
          borderBottom: `1px solid rgba(91,15,22,0.10)`,
          padding: '20px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <a href="/explore" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <img src="/logo.png" alt="QuickIn" height={40} style={{ height: 40, width: 'auto', display: 'block' }} />
          </a>
          <span style={{ color: COLORS.burgundy, fontWeight: 700, fontSize: 14 }}>Payments Ops</span>
        </div>
      </header>

      <section style={{ maxWidth: 960, margin: '0 auto', padding: '36px 24px 72px' }}>
        <h1
          style={{
            margin: '0 0 6px',
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(26px, 4vw, 34px)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: COLORS.burgundy,
          }}
        >
          Instapay payments
        </h1>
        <p style={{ margin: '0 0 28px', fontSize: 15, color: COLORS.muted }}>
          Set the Instapay destination guests transfer to, and resolve payment disputes.
        </p>

        {!isAdmin ? (
          <div
            style={{
              background: '#fff',
              borderRadius: 22,
              border: '1px solid rgba(42,34,32,0.06)',
              boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
              padding: '44px 24px',
              textAlign: 'center',
              color: COLORS.muted,
            }}
          >
            <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: COLORS.ink }}>
              Admins only
            </p>
            <p style={{ margin: 0, fontSize: 14 }}>
              {user
                ? 'Your account does not have the admin role.'
                : 'Please sign in with an admin account to manage payments.'}
            </p>
          </div>
        ) : (
          <OpsPayments />
        )}
      </section>
    </main>
  )
}
