// Route-segment skeleton for /host/questions — a stack of question cards. Without it
// this route inherits /host/loading.tsx and flashes the dashboard's shape.
import { PageFrameSkeleton } from '@/components/ui/page-frame-skeleton'

export default function Loading() {
  return <PageFrameSkeleton maxWidth={860} rows={3} />
}
