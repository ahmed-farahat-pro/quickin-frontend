// Analytics is the one console screen that is mostly charts, so the default
// stats-and-table skeleton would misdescribe it badly. Mirrors ops-analytics.tsx:
// serif heading, the seven-control filter bar, then the report panels.
import {
  OpsSkeletonChart,
  OpsSkeletonHeader,
  OpsSkeletonFilters,
  OpsSkeletonPage,
  OpsSkeletonStats,
  OpsSkeletonPanel,
} from '../ops-skeleton'

export default function OpsAnalyticsLoading() {
  return (
    <OpsSkeletonPage maxWidth={1100} padding="24px 20px 64px">
      <OpsSkeletonHeader titleWidth={168} subWidth={430} actions={1} />
      <OpsSkeletonFilters fields={6} search={false} />
      <OpsSkeletonStats count={4} />

      <section
        style={{
          background: '#fff',
          borderRadius: 18,
          border: '1px solid rgba(42,34,32,0.06)',
          boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
          padding: 18,
          marginBottom: 16,
        }}
      >
        <OpsSkeletonChart bars={26} />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <OpsSkeletonPanel lines={5} titleWidth={130} />
        <OpsSkeletonPanel lines={5} titleWidth={160} />
      </div>
    </OpsSkeletonPage>
  )
}
