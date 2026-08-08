// /messages only needs this because it stopped fetching its own threads: page.tsx
// now resolves the session and loads the first list before rendering, which is a
// real server wait where there was none. The rule in README "Loading states" —
// every route that awaits data on the server gets a boundary — applies the moment
// a page moves its fetch to the server, not only when a page is written that way.
//
// Mirrors messages-client.tsx: back link, serif heading, the two-panel grid.
import { ShimmerStyles, SkeletonBlock, SKELETON_COLORS as C } from '@/components/ui/skeleton-block'
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
            {['62%', '48%', '70%', '54%'].map((w, i) => (
              <div key={i} style={{ padding: '13px 15px', borderBottom: '1px solid rgba(42,34,32,0.06)' }}>
                <SkeletonBlock width={w} height={14} />
                <SkeletonBlock width="80%" height={11} style={{ marginTop: 7 }} />
                <SkeletonBlock width="90%" height={11} style={{ marginTop: 6 }} />
              </div>
            ))}
          </div>

          {/* Active thread */}
          <div style={{ ...panel, padding: 16, height: '62vh', minHeight: 380 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { w: '58%', mine: false },
                { w: '44%', mine: true },
                { w: '68%', mine: false },
                { w: '36%', mine: true },
              ].map((b, i) => (
                <SkeletonBlock
                  key={i}
                  width={b.w}
                  height={38}
                  radius={14}
                  style={{ alignSelf: b.mine ? 'flex-end' : 'flex-start' }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
