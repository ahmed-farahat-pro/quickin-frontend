import { PageSkeleton } from '@/app/_components/skeletons'

// Shown while the Explore server component fetches listings.
export default function Loading() {
  return <PageSkeleton count={6} showSearch />
}
