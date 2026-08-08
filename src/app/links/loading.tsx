// The public link-in-bio page. It reads the App Store / Play Store URLs from the DB
// (getAppLinks) before rendering, so there is a real wait behind it.
//
// This one page is built with the app's Tailwind/shadcn kit rather than the /ops
// inline-style idiom, so its skeleton uses <Skeleton> to match — same reason the
// rest of these use SkeletonBlock.
import { Skeleton } from '@/components/ui/skeleton'
import { RouteProgress } from '@/components/ui/route-progress'

export default function LinksLoading() {
  return (
    <main
      role="status"
      aria-label="Loading"
      className="flex min-h-screen flex-col items-center bg-background px-5 py-12 sm:py-16"
    >
      <RouteProgress />
      <div className="w-full max-w-md">
        <header className="flex flex-col items-center text-center">
          <Skeleton className="h-[88px] w-[88px] rounded-full" />
          <Skeleton className="mt-5 h-8 w-40" />
          <Skeleton className="mt-3 h-4 w-64" />
          <Skeleton className="mt-2 h-4 w-48" />
        </header>

        {/* Book on the web, App Store, Google Play */}
        <nav className="mt-9 flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] w-full rounded-xl" />
          ))}
          <Skeleton className="mx-auto mt-4 h-3 w-32" />
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] w-full rounded-xl" />
          ))}
        </nav>
      </div>
    </main>
  )
}
