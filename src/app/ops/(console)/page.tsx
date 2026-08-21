// /ops — the console's home: top-line counts, the graph they drive, and the queues
// waiting on a human.
//
// The five dashboard sections are separate routes rendering one shared component;
// see ops-dashboard.tsx for why.
import { opsSession, opsCan, backendFetchOr } from '@/lib/backend'
import { DEFAULT_RANGE } from '@/lib/local/overview-trends-core'
import type { TrendPayload } from '@/lib/local/overview-trends-core'
import { OpsDashboard } from './ops-dashboard'

export const dynamic = 'force-dynamic'

export default async function OpsOverviewPage() {
  // The (console) layout has already established the staff session; this repeats the
  // lookup only to add the per-module check before touching the data. The API route
  // behind the graph re-checks the same permission independently.
  const staff = await opsSession()

  // Load the default range HERE rather than letting the chart fetch it after it
  // mounts. The panel used to arrive fully drawn and empty and sit on the word
  // "Loading…" while a second round trip — started from the browser, after the first
  // had already finished — went and got its contents. On Vercel that second trip
  // pays a cold function and a Neon wake-up the page had already paid for once.
  // The 30-day view is what every operator sees on arrival, so it should simply be
  // there. Same shape as /ops/payments, /ops/users and /ops/staff.
  //
  // `null` means the load failed, and is NOT the same as "no data": the client falls
  // back to fetching for itself, so a hiccup here costs a moment rather than the
  // whole panel. Switching range still goes through the API — only the first paint
  // is seeded.
  const initialTrends = staff && opsCan(staff, 'overview')
    ? await backendFetchOr<TrendPayload | null>(
        `/api/local/admin/stats/trends?range=${DEFAULT_RANGE}`, null,
      )
    : null

  return <OpsDashboard section="overview" initialTrends={initialTrends} />
}
