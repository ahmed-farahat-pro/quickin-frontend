// /ops/applications — the queue of people asking to become hosts.
import { OpsDashboard } from '../ops-dashboard'

export const dynamic = 'force-dynamic'

export default function OpsApplicationsPage() {
  return <OpsDashboard section="applications" />
}
