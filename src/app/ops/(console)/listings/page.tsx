// /ops/listings — every property, with approve / publish / hide / delete.
import { OpsDashboard } from '../ops-dashboard'

export const dynamic = 'force-dynamic'

export default function OpsListingsPage() {
  return <OpsDashboard section="listings" />
}
