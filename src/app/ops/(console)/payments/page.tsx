// QuickIn — Instapay payments ops (World 1, no Supabase).
// Server component: the (console) layout has already established the staff session;
// this adds the per-module check, so only a super admin or a moderator holding the
// 'payments' module sees the panels. The API routes behind them re-check the same
// permission independently.
// Two panels live in the 'use client' component below: the Instapay destination
// settings form (number, link, QR, instructions) and the payment-disputes queue.
// Strings are hardcoded English (this ops page
// is intentionally not wired into next-intl to keep the change contained).
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { resolveStaffSession, staffCan, STAFF_COOKIE } from '@/lib/local/staff'
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

export default async function OpsPaymentsPage() {
  const staff = await resolveStaffSession((await cookies()).get(STAFF_COOKIE)?.value)
  const allowed = Boolean(staff && staffCan(staff, 'payments'))

  return (
    <main
      style={{
        minHeight: '100vh',
        background: COLORS.cream,
        color: COLORS.ink,
        fontFamily: FONT,
      }}
    >
      {/* This page used to build its own header — a logo linking to /explore and a
          title, and nothing else. That meant the module nav, the alert bell, the
          signed-in identity and Sign out all vanished the moment you opened Payments,
          with no way back into the console except the browser button. Use the shared
          header like every other /ops screen. */}

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

        {!allowed ? (
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
              No access to payments
            </p>
            <p style={{ margin: 0, fontSize: 14 }}>
              {staff
                ? 'Your account does not have the Payments module. Ask a super admin to grant it.'
                : 'Please sign in to manage payments.'}
            </p>
          </div>
        ) : (
          <OpsPayments />
        )}
      </section>
    </main>
  )
}
