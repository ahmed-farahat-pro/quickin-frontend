// /stay with no code — the friendly notice a truncated QR link lands on. It is
// `force-dynamic`, so it still round-trips even though it reads nothing; this keeps
// that round-trip from falling through to the root overlay.
//
// Deliberately minimal: the page is a header and one card, so is this.
import { ShimmerStyles, SkeletonBlock, SKELETON_COLORS as C, SKELETON_FONT as FONT } from '@/components/ui/skeleton-block'
import { RouteProgress } from '@/components/ui/route-progress'

export default function StayIndexLoading() {
  return (
    <main
      role="status"
      aria-label="Loading"
      style={{ minHeight: '100vh', background: C.cream, color: C.ink, fontFamily: FONT }}
    >
      <RouteProgress />
      <ShimmerStyles />

      <header
        style={{
          background: `linear-gradient(180deg, ${C.tan} 0%, ${C.cream} 100%)`,
          borderBottom: '1px solid rgba(91,15,22,0.10)',
          padding: '18px 24px',
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <SkeletonBlock width={132} height={38} radius={9} />
        </div>
      </header>

      <section style={{ maxWidth: 760, margin: '0 auto', padding: '28px 20px 72px' }}>
        <div
          style={{
            background: '#fff',
            borderRadius: 22,
            border: '1px solid rgba(42,34,32,0.06)',
            boxShadow: '0 6px 24px rgba(42,34,32,0.07)',
            padding: '32px 26px',
            textAlign: 'center',
          }}
        >
          <SkeletonBlock width={260} height={24} radius={9} style={{ margin: '0 auto', maxWidth: '100%' }} />
          <SkeletonBlock width={380} height={14} style={{ margin: '14px auto 0', maxWidth: '100%' }} />
          <SkeletonBlock width={300} height={14} style={{ margin: '9px auto 0', maxWidth: '100%' }} />
          <SkeletonBlock width={168} height={42} radius={999} style={{ margin: '24px auto 0' }} />
        </div>
      </section>
    </main>
  )
}
