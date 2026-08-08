// /messages only needs this because it stopped fetching its own threads: page.tsx
// now resolves the session and loads the first list before rendering, which is a
// real server wait where there was none. The rule in README "Loading states" —
// every route that awaits data on the server gets a boundary — applies the moment
// a page moves its fetch to the server, not only when a page is written that way.
//
// Mirrors messages-client.tsx: back link, serif heading, the two-panel grid.
import {
  ShimmerStyles,
  SkeletonBlock,
  SkeletonChatBubbles,
  SkeletonThreadRows,
  SKELETON_COLORS as C,
} from '@/components/ui/skeleton-block'
import { RouteProgress } from '@/components/ui/route-progress'

const panel: React.CSSProperties = {
  background: '#fff',
  borderRadius: 18,
  border: '1px solid rgba(42,34,32,0.06)',
}

export default function MessagesLoading() {
  return (
    <main
      role="status"
      aria-label="Loading"
      style={{
        minHeight: '100vh',
        background: C.cream,
        color: C.ink,
        fontFamily: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <RouteProgress />
      <ShimmerStyles />
      <style>{`
        @media (max-width: 720px) { .qk-skel-msg-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 20px 60px' }}>
        <SkeletonBlock width={126} height={14} style={{ marginBottom: 18 }} />
        <SkeletonBlock width={210} height={32} radius={10} style={{ marginBottom: 20, maxWidth: '100%' }} />

        <div
          className="qk-skel-msg-grid"
          style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 20, alignItems: 'stretch' }}
        >
          {/* Thread list */}
          <div style={{ ...panel, overflow: 'hidden' }}>
            <SkeletonThreadRows count={4} />
          </div>

          {/* Active thread */}
          <div style={{ ...panel, padding: 16, height: '62vh', minHeight: 380 }}>
            <SkeletonChatBubbles count={4} />
          </div>
        </div>
      </div>
    </main>
  )
}
