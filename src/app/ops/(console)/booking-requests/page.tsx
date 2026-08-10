// /ops/booking-requests — pending bookings awaiting host approval, with admin approve/decline.
import { OpsDashboard } from '../ops-dashboard'

export const dynamic = 'force-dynamic'

export default function OpsBookingRequestsPage() {
  return <OpsDashboard section="booking-requests" />
}
