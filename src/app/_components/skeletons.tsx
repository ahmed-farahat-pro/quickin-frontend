// Shimmer skeletons shown while content (listings, services, reservations…) loads,
// so the app feels instant and professional instead of flashing a spinner.

const SHIMMER_CSS = `
@keyframes qkShimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
.qk-skel { background: linear-gradient(90deg, #EFE6D8 25%, #F4EDE0 50%, #EFE6D8 75%); background-size: 200% 100%; animation: qkShimmer 1.4s ease-in-out infinite; }
`

function Skel({ w = '100%', h, r = 12, mt = 0 }: { w?: number | string; h: number; r?: number; mt?: number }) {
  return <div className="qk-skel" style={{ width: w, height: h, borderRadius: r, marginTop: mt }} />
}

/** One card placeholder shaped like a listing/service card. */
export function CardSkeleton() {
  return (
    <div style={{ background: '#fff', borderRadius: 22, overflow: 'hidden', border: '1px solid rgba(42,34,32,0.06)' }}>
      <Skel h={200} r={0} />
      <div style={{ padding: 16 }}>
        <Skel h={18} w="65%" />
        <Skel h={13} w="45%" mt={10} />
        <Skel h={16} w="30%" mt={14} />
      </div>
    </div>
  )
}

/** A responsive grid of card placeholders. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      <style>{SHIMMER_CSS}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 22 }}>
        {Array.from({ length: count }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </>
  )
}

/** A full-page skeleton: a title + search bar block, then the card grid. Used by
 *  the route-level loading.tsx files so navigations show the page's shape loading. */
export function PageSkeleton({ count = 6, showSearch = true }: { count?: number; showSearch?: boolean }) {
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 20px 64px' }}>
      <style>{SHIMMER_CSS}</style>
      <div className="qk-skel" style={{ width: 200, height: 30, borderRadius: 10, marginBottom: 22 }} />
      {showSearch && <div className="qk-skel" style={{ width: '100%', height: 120, borderRadius: 24, marginBottom: 26 }} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 22 }}>
        {Array.from({ length: count }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </main>
  )
}

/** Compact list-row skeletons (reservations / subscriptions). */
export function RowListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '36px 20px 64px' }}>
      <style>{SHIMMER_CSS}</style>
      <div className="qk-skel" style={{ width: 220, height: 28, borderRadius: 10, marginBottom: 22 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, background: '#fff', borderRadius: 18, border: '1px solid rgba(42,34,32,0.06)', padding: 14 }}>
            <Skel w={84} h={84} r={14} />
            <div style={{ flex: 1 }}>
              <Skel h={16} w="55%" />
              <Skel h={12} w="35%" mt={10} />
              <Skel h={20} w={90} r={999} mt={14} />
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
