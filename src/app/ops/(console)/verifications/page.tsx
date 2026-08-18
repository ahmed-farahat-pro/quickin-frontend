// /ops/verifications — submitted ID documents awaiting a decision, plus the requests
// to change an ID number already on file. Two queues, two separately-granted modules
// (`verifications` and `id_changes`): the component renders only the ones this
// operator holds, and each queue's API route re-checks its own permission.
import { OpsDashboard } from '../ops-dashboard'

export const dynamic = 'force-dynamic'

export default function OpsVerificationsPage() {
  return <OpsDashboard section="verifications" />
}
