// TEMPORARY migration: listings.review_note — the operator's reason for rejecting a
// listing, so the host can read it. Idempotent. Key-gated. REMOVE after running
// (same lifecycle as xmig5/xmig6/xmig7/xmig8).
//
//   GET /api/local/xmig9?key=qk-mig9-7e42
//
// DEPLOY ORDER — read this before shipping. The host projection (LISTING_COLS_HOST)
// selects l.review_note, so on a database WITHOUT the column every host read (/host,
// the listing editor) fails outright. Guest reads are unaffected either way: the note
// is deliberately absent from the guest projection.
//
// Which means this route cannot be the pre-deploy step for Neon — it ships WITH the
// code that needs the column. Apply it to Neon first from a shell:
//
//   ALTER TABLE listings ADD COLUMN IF NOT EXISTS review_note text;
//
// or `node quickin-backend/scripts/migrate-listing-review-note.mjs` with DATABASE_URL
// pointed at Neon, which is the same statement plus a report. This route exists for the
// databases that have no shell pointed at them — a local/preview DB built from
// local-backend/init.sql before that file declared the column — and as an idempotent
// re-check afterwards.
//
// Nullable text with no default and no backfill: NULL means "no reason recorded",
// which is exactly the right answer for every listing rejected before today. Those
// hosts' reasons were never stored — they only ever existed in a notification body —
// so there is nothing to recover, and the host surfaces fall back to their generic
// "needs changes" copy for those rows.
import { NextResponse } from 'next/server'
import { pool } from '@/lib/local/pool'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const KEY = 'qk-mig9-7e42'

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get('key') !== KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const steps: string[] = []
  const run = async (label: string, sql: string) => {
    try {
      await pool.query(sql)
      steps.push('ok: ' + label)
    } catch (e) {
      steps.push('ERR ' + label + ': ' + (e as Error).message)
    }
  }
  await run('add listings.review_note', `ALTER TABLE listings ADD COLUMN IF NOT EXISTS review_note text`)

  let column: string | null = null
  try {
    const { rows } = await pool.query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = 'listings' AND column_name = 'review_note'`
    )
    column = rows[0]?.data_type ?? null
  } catch (e) {
    steps.push('ERR verify: ' + (e as Error).message)
  }

  return NextResponse.json({ ok: column === 'text', column, steps })
}
