// The stay pass — the screen a guest lands on from a QR code, often on hotel wifi
// on a phone. It reads the booking, the host's notes and the whole guide before it
// can render anything, and it had no loading boundary of its own: the wait showed
// the fullscreen root overlay instead of the pass taking shape.
//
// Mirrors page.tsx: tan→cream header with the logo, one 760 column, the pass card
// (title, status chip, three facts, QR + code), then the guide sections.
import { ShimmerStyles, SkeletonBlock, SKELETON_COLORS as C, SKELETON_FONT as FONT } from '@/components/ui/skeleton-block'
import { RouteProgress } from '@/components/ui/route-progress'

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 22,
  border: '1px solid rgba(42,34,32,0.06)',
  boxShadow: '0 6px 24px rgba(42,34,32,0.07)',
}

export default function StayPassLoading() {
  return (
    <main
      role="status"
      aria-label="Loading"
      style={{ minHeight: '100vh', background: C.cream, color: C.ink, fontFamily: FONT }}
    >
      <RouteProgress />
      <ShimmerStyles />
      <style>{`
        @media (max-width: 520px) {
          .qk-skel-stay-facts { grid-template-columns: 1fr !important; }
        }
      `}</style>

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
        <article style={{ ...card, padding: '22px 24px' }}>
          <SkeletonBlock width="72%" height={30} radius={10} />
          <SkeletonBlock width="45%" height={15} style={{ marginTop: 12 }} />

          {/* Status chip */}
          <SkeletonBlock width={104} height={24} radius={999} style={{ marginTop: 16 }} />

          {/* Check-in / check-out / guests */}
          <div
            className="qk-skel-stay-facts"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 14,
              margin: '20px 0 0',
              paddingTop: 18,
              borderTop: '1px solid rgba(42,34,32,0.08)',
            }}
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <SkeletonBlock width={62} height={9} radius={4} />
                <SkeletonBlock width="82%" height={16} style={{ marginTop: 8 }} />
              </div>
            ))}
          </div>

          {/* The QR and the reservation code beside it */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 18,
              margin: '20px 0 0',
              paddingTop: 18,
              borderTop: '1px solid rgba(42,34,32,0.08)',
            }}
          >
            <SkeletonBlock width={120} height={120} radius={14} style={{ flex: '0 0 auto' }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <SkeletonBlock width={92} height={10} radius={4} />
              <SkeletonBlock width={178} height={24} radius={8} style={{ marginTop: 9, maxWidth: '100%' }} />
              <SkeletonBlock width={214} height={13} style={{ marginTop: 10, maxWidth: '100%' }} />
            </div>
          </div>
        </article>

        {/* Guide sections */}
        <div style={{ marginTop: 26 }}>
          <SkeletonBlock width={170} height={19} radius={8} />
          <SkeletonBlock width={280} height={14} style={{ marginTop: 10, marginBottom: 16, maxWidth: '100%' }} />

          {[0, 1].map((i) => (
            <section key={i} style={{ ...card, padding: '18px 20px', marginBottom: 16 }}>
              <SkeletonBlock width={110} height={10} radius={4} />
              <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
                {Array.from({ length: 2 }).map((_, j) => (
                  <div key={j}>
                    <SkeletonBlock width="52%" height={15} />
                    <SkeletonBlock width="94%" height={13} style={{ marginTop: 7 }} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  )
}
