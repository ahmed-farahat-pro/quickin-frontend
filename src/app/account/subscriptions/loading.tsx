// Route-segment skeleton for /account/subscriptions — request rows. Without it this route inherits
// /host/loading.tsx (or the root one) and flashes the wrong page's shape.
import { PageFrameSkeleton } from '@/components/ui/page-frame-skeleton'

export default function Loading() {
  return <PageFrameSkeleton maxWidth={860} rows={3} />
}
