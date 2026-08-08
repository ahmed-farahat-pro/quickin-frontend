// Instapay payments: the destination settings form on top, the disputes queue
// below. Same 960 column and serif heading as page.tsx.
//
// Note this covers only the server wait. OpsPayments then fetches its own data on
// mount — that second wait is handled by the in-component skeletons, not here.
import { SkeletonBlock } from '@/components/ui/skeleton-block'
import { OpsSkeletonForm, OpsSkeletonPage, OpsSkeletonTable } from '../ops-skeleton'

export default function OpsPaymentsLoading() {
  return (
    <OpsSkeletonPage maxWidth={960} padding="36px 24px 72px">
      <SkeletonBlock width={262} height={32} radius={10} style={{ maxWidth: '100%' }} />
      <SkeletonBlock width={470} height={15} style={{ margin: '12px 0 28px', maxWidth: '100%' }} />

      {/* Instapay destination: number, link, QR, instructions */}
      <OpsSkeletonForm fields={4} />

      <div style={{ marginTop: 20 }}>
        <SkeletonBlock width={168} height={17} radius={7} style={{ marginBottom: 14 }} />
        <OpsSkeletonTable rows={5} cols={4} />
      </div>
    </OpsSkeletonPage>
  )
}
