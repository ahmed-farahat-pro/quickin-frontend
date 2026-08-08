// One user's profile. page.tsx awaits adminGetUserDetail before rendering anything —
// deliberately, so the profile never arrives empty and fills in — which makes this
// the boundary that covers that wait. Mirrors ops-user-detail.tsx: back link, serif
// name, the attribute grid, then the activity panels.
import { SkeletonBlock } from '@/components/ui/skeleton-block'
import { OpsSkeletonPage, OpsSkeletonPanel, OpsSkeletonTable } from '../../ops-skeleton'

export default function OpsUserDetailLoading() {
  return (
    <OpsSkeletonPage maxWidth={1100} padding="24px 20px 64px">
      {/* Back to the directory */}
      <SkeletonBlock width={96} height={12} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '14px 0 6px' }}>
        <SkeletonBlock width={64} height={64} radius={999} style={{ flex: '0 0 auto' }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <SkeletonBlock width={240} height={28} radius={9} style={{ maxWidth: '100%' }} />
          <SkeletonBlock width={180} height={13} style={{ marginTop: 9, maxWidth: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <SkeletonBlock width={84} height={33} radius={11} />
          <SkeletonBlock width={84} height={33} radius={11} />
        </div>
      </div>

      {/* The <dl> of profile attributes */}
      <section
        style={{
          background: '#fff',
          borderRadius: 18,
          border: '1px solid rgba(42,34,32,0.06)',
          boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
          padding: 18,
          margin: '18px 0 16px',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <SkeletonBlock width={72} height={9} radius={4} />
              <SkeletonBlock width="78%" height={13} style={{ marginTop: 7 }} />
            </div>
          ))}
        </div>
      </section>

      <OpsSkeletonPanel lines={2} titleWidth={140} style={{ marginBottom: 16 }} />
      <OpsSkeletonTable rows={5} cols={4} />
    </OpsSkeletonPage>
  )
}
