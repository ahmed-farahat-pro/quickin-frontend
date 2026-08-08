import { Skeleton } from '@/components/ui/skeleton'
import { RouteProgress } from '@/components/ui/route-progress'

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <RouteProgress />

      {/* Page header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* The spinner and the word "Loading..." that used to sit here said nothing
          the skeleton around them wasn't already saying, and pushed the content
          placeholders a screen down so they described a layout nobody could see. */}

      {/* Content skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  )
}
