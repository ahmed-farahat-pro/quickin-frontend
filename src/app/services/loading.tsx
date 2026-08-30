// Route-segment skeleton for /services — the browse grid. Without it this route inherits
// /host/loading.tsx (or the root one) and flashes the wrong page's shape.
import { PageFrameSkeleton } from '@/components/ui/page-frame-skeleton'

export default function Loading() {
  return <PageFrameSkeleton rows={3} />
}
