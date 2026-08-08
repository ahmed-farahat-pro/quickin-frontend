// /ops — the console's home: top-line counts and the queues waiting on a human.
//
// The five dashboard sections are separate routes rendering one shared component;
// see ops-dashboard.tsx for why.
import { OpsDashboard } from './ops-dashboard'

export const dynamic = 'force-dynamic'

export default function OpsOverviewPage() {
  return <OpsDashboard section="overview" />
}
