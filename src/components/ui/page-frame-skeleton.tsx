// The route-segment skeleton for a PageFrame page: gradient header, title +
// subtitle, then a stack of panel placeholders.
//
// One component rather than a hand-rolled loading.tsx per route, because the
// four new host sub-pages and the two services pages all wear the same frame —
// see components/layout/page-frame.tsx. Without a loading.tsx of their own,
// every /host/* route inherits /host/loading.tsx and flashes a LISTINGS GRID on
// the way to Earnings or Analytics, which is what /host/new/loading.tsx already
// exists to avoid for the create form.
import {
  ShimmerStyles,
  SkeletonBlock,
  SKELETON_COLORS as C,
  SKELETON_FONT as FONT,
} from '@/components/ui/skeleton-block'
import { RouteProgress } from '@/components/ui/route-progress'

export function PageFrameSkeleton({
  maxWidth = 1100,
  /** How many panel placeholders to stack under the title. */
  rows = 3,
  /** Draws a tall hero band first — for the pages that lead with one. */
  hero = false,
}: {
  maxWidth?: number
  rows?: number
  hero?: boolean
}) {
  return (
    <div style={{ background: C.cream, color: C.ink, fontFamily: FONT, minHeight: '100vh' }}>
      <RouteProgress />
      <ShimmerStyles />

      <header
        style={{
          background: `linear-gradient(180deg, ${C.tan} 0%, ${C.cream} 100%)`,
          borderBottom: '1px solid rgba(91,15,22,0.10)',
          padding: '20px 24px',
        }}
      >
        <div
          style={{
            maxWidth,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <SkeletonBlock width={96} height={40} radius={8} />
          <SkeletonBlock width={150} height={16} />
        </div>
      </header>

      <section style={{ maxWidth, margin: '0 auto', padding: '36px 24px 72px' }}>
        <SkeletonBlock width={260} height={32} radius={10} />
        <div style={{ marginTop: 10 }}>
          <SkeletonBlock width={340} height={15} radius={8} />
        </div>

        {hero && (
          <div style={{ marginTop: 26 }}>
            <SkeletonBlock width="100%" height={148} radius={22} />
          </div>
        )}

        <div style={{ display: 'grid', gap: 12, marginTop: 26 }}>
          {Array.from({ length: rows }, (_, i) => (
            <SkeletonBlock key={i} width="100%" height={84} radius={20} />
          ))}
        </div>
      </section>
    </div>
  )
}
