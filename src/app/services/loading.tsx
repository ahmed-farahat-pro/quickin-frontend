import { PageSkeleton } from '@/app/_components/skeletons'

// Shown while the Services server component fetches services.
export default function Loading() {
  return <PageSkeleton count={6} showSearch={false} />
}
