// Route-segment skeleton for /host/analytics — hero + stat and chart panels. Without it this route inherits
// /host/loading.tsx (or the root one) and flashes the wrong page's shape.
import { PageFrameSkeleton } from '@/components/ui/page-frame-skeleton'

export default function Loading() {
  return <PageFrameSkeleton hero rows={4} />
}
