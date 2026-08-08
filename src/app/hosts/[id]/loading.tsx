// A host's public profile: identity, their listings, their reviews — all loaded
// server-side in one go, with no boundary of its own until now.
//
// Mirrors page.tsx: tan→cream header with logo and back link, 1040 column, the
// avatar-and-name block, then the listing card grid.
import {
  ShimmerStyles,
  SkeletonBlock,
  SkeletonCard,
  SKELETON_COLORS as C,
  SKELETON_FONT as FONT,
} from '@/components/ui/skeleton-block'
import { RouteProgress } from '@/components/ui/route-progress'

export default function HostProfileLoading() {
  return (
    <main
      role="status"
      aria-label="Loading"
      style={{ minHeight: '100vh', background: C.cream, color: C.ink, fontFamily: FONT }}
    >
      <RouteProgress />
      <ShimmerStyles />
      <style>{`
        @media (max-width: 640px) {
          .qk-skel-host-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <header
        style={{
          background: `linear-gradient(180deg, ${C.tan} 0%, ${C.cream} 100%)`,
          borderBottom: '1px solid rgba(91,15,22,0.10)',
          padding: '20px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 1040,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <SkeletonBlock width={138} height={40} radius={9} />
          <SkeletonBlock width={124} height={14} />
        </div>
      </header>

      <section style={{ maxWidth: 1040, margin: '0 auto', padding: '36px 24px 72px' }}>
        {/* Avatar, name, verified badge, member-since line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <SkeletonBlock width={88} height={88} radius={999} style={{ flex: '0 0 auto' }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <SkeletonBlock width={280} height={34} radius={10} style={{ maxWidth: '100%' }} />
            <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
              <SkeletonBlock width={98} height={25} radius={999} />
              <SkeletonBlock width={130} height={25} radius={999} />
            </div>
          </div>
        </div>

        {/* Bio */}
        <div style={{ marginTop: 28 }}>
          <SkeletonBlock width="88%" height={14} />
          <SkeletonBlock width="76%" height={14} style={{ marginTop: 9 }} />
        </div>

        {/* Their listings */}
        <SkeletonBlock width={200} height={22} radius={9} style={{ marginTop: 40 }} />
        <div
          className="qk-skel-host-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 22,
            marginTop: 20,
          }}
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>
    </main>
  )
}
