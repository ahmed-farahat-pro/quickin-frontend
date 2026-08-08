// Staff & permissions: the accounts table plus the invite form. Wider column and
// the heavier padding staff-client.tsx uses (1100 / '32px 24px 72px').
import { OpsSkeletonForm, OpsSkeletonHeader, OpsSkeletonPage, OpsSkeletonTable } from '../ops-skeleton'

export default function OpsStaffLoading() {
  return (
    <OpsSkeletonPage maxWidth={1100} padding="32px 24px 72px">
      <OpsSkeletonHeader titleWidth={250} subWidth={400} actions={1} />
      <OpsSkeletonTable rows={6} cols={5} />
      <div style={{ marginTop: 20 }}>
        <OpsSkeletonForm fields={3} />
      </div>
    </OpsSkeletonPage>
  )
}
