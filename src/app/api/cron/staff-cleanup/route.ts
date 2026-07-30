import { NextResponse } from 'next/server'
import { purgeStaffExpired } from '@/lib/local/db'

// Housekeeping for the staff RBAC tables (World 1 — Neon). staff_sessions and
// staff_password_resets accumulate a row per sign-in and per reset request forever;
// this drops the long-dead ones. Negligible at a handful of seats, but unbounded.
//
//   GET /api/cron/staff-cleanup     header: Authorization: Bearer <CRON_SECRET>
//
// Deliberately separate from /api/cron/booking-timeouts, which is a Supabase
// (World 2) route — this feature is Neon-only and shouldn't depend on it.
//
// NOT yet scheduled: add to quickin-frontend/vercel.json "crons" to automate it,
// e.g. { "path": "/api/cron/staff-cleanup", "schedule": "0 3 * * *" }. Safe to run
// by hand, and safe to run repeatedly.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  // Same guard as the existing cron route: enforced only when CRON_SECRET is set.
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const purged = await purgeStaffExpired()
    return NextResponse.json({ success: true, purged }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('staff-cleanup cron:', err)
    return NextResponse.json({ error: 'Cleanup failed', detail: String(err) }, { status: 500 })
  }
}
