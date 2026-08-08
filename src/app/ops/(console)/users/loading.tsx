// Users server-renders its first page of results (see page.tsx), so this boundary
// covers a real DB search, not just the session check. Mirrors ops-users.tsx:
// heading, the filter row, then the directory table.
import {
  OpsSkeletonFilters,
  OpsSkeletonHeader,
  OpsSkeletonPage,
  OpsSkeletonTable,
} from '../ops-skeleton'

export default function OpsUsersLoading() {
  return (
    <OpsSkeletonPage maxWidth={1100} padding="24px 20px 64px">
      <OpsSkeletonHeader titleWidth={120} subWidth={390} actions={1} />
      <OpsSkeletonFilters fields={3} search />
      <OpsSkeletonTable rows={10} cols={6} />
    </OpsSkeletonPage>
  )
}
