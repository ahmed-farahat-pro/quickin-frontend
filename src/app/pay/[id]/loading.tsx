// Paying for a stay. page.tsx verifies the token, loads the user, loads the booking
// and checks it is still payable before rendering — four sequential awaits on the
// one screen where a guest is holding their phone waiting to transfer money. It had
// no boundary of its own.
//
// Mirrors pay-client.tsx: 1000 column, serif heading, then the two-column
// destination / upload layout.
import { ShimmerStyles, SkeletonBlock, SKELETON_COLORS as C, SKELETON_FONT as FONT } from '@/components/ui/skeleton-block'
import { RouteProgress } from '@/components/ui/route-progress'

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 22,
  border: '1px solid rgba(42,34,32,0.06)',
  boxShadow: '0 6px 24px rgba(42,34,32,0.07)',
  padding: '22px 24px',
}

export default function PayLoading() {
  return (
    <main
      role="status"
      aria-label="Loading"
      style={{ minHeight: '100vh', background: C.cream, color: C.ink, fontFamily: FONT }}
    >
      <RouteProgress />
      <ShimmerStyles />
      <style>{`
        @media (max-width: 760px) {
          .qk-skel-pay-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 20px 72px' }}>
        <SkeletonBlock width={124} height={36} radius={9} />
        <SkeletonBlock width={330} height={30} radius={10} style={{ marginTop: 14, maxWidth: '100%' }} />
        <SkeletonBlock width={250} height={14} style={{ marginTop: 10, maxWidth: '100%' }} />

        <div
          className="qk-skel-pay-grid"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 24 }}
        >
          {/* Where to transfer: the amount, the Instapay handle, the QR */}
          <div style={card}>
            <SkeletonBlock width={150} height={17} radius={7} />
            <SkeletonBlock width="60%" height={30} radius={9} style={{ marginTop: 16 }} />
            <SkeletonBlock width="85%" height={13} style={{ marginTop: 10 }} />
            <SkeletonBlock width={160} height={160} radius={14} style={{ margin: '20px auto 0' }} />
            <SkeletonBlock width="70%" height={14} style={{ margin: '16px auto 0' }} />
          </div>

          {/* Upload the transfer screenshot */}
          <div style={card}>
            <SkeletonBlock width={190} height={17} radius={7} />
            <SkeletonBlock width="92%" height={13} style={{ marginTop: 10 }} />
            <SkeletonBlock height={180} radius={14} style={{ marginTop: 18 }} />
            <SkeletonBlock height={46} radius={999} style={{ marginTop: 16 }} />
          </div>
        </div>
      </section>
    </main>
  )
}
