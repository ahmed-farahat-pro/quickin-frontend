import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/local/staff'
import { adminStatTrends } from '@/lib/local/db'
import { METRICS, parseRange, RANGES, TrendInputError } from '@/lib/local/overview-trends-core'

// Admin (staff session + `overview` module): GET → the history behind the Overview's
// number cards, one dense series per chartable metric.
//
// Same module as /stats, because it is the same screen: an operator who can read the
// tiles can read their history, and one who cannot gets a 403 from both.
//
// Every metric ships in one response rather than one call per card. The series are
// small (at most 90 points × 8 metrics) and it makes clicking a card instant, which
// is the whole point of the interaction.
export const dynamic = 'force-dynamic'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }

export async function GET(req: Request) {
  const gate = await requireStaff(req, 'overview')
  if ('error' in gate) return gate.error
  try {
    const range = parseRange(new URL(req.url).searchParams.get('range'))
    const series = await adminStatTrends(range)

    // The client renders titles, notes and the cumulative/new toggle from this, so
    // the wording and the "can this be a running total?" rule live in one place —
    // next to the SQL that makes the claim true. Only the presentational fields go
    // over the wire: METRICS also carries the from/where/at SQL, and a table and
    // column map is not something a page needs in order to draw a line.
    const metrics = Object.fromEntries(
      Object.entries(METRICS).map(([id, m]) => [id, { label: m.label, cumulative: m.cumulative, note: m.note ?? null }]),
    )

    return NextResponse.json(
      { range, granularity: RANGES[range].granularity, series, metrics },
      { headers: CORS },
    )
  } catch (err) {
    // Bad input is the caller's fault: 400, never a 500.
    if (err instanceof TrendInputError) {
      return NextResponse.json({ error: err.message }, { status: 400, headers: CORS })
    }
    console.error('admin stats trends GET:', err)
    return NextResponse.json({ error: 'Failed to load' }, { status: 500, headers: CORS })
  }
}
