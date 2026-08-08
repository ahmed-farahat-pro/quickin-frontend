// /ops/bookings — reservations, what the guest paid, and the platform's cut of each.
import { OpsDashboard } from '../ops-dashboard'

export const dynamic = 'force-dynamic'

export default function OpsBookingsPage() {
  return <OpsDashboard section="bookings" />
}
