// The default skeleton for every console screen that doesn't declare its own.
//
// This is the file that stops a sidebar click blowing the console away. Sitting
// beside the (console) layout, it suspends only that layout's children — so
// OpsShell's top bar and sidebar stay mounted and only the content column swaps,
// instead of the whole screen falling through to the root app/loading.tsx overlay.
//
// Covers: overview, bookings, listings, verifications, applications, alerts,
// activity, audit, reports and resorts. Screens whose shape is genuinely different
// (analytics, users, payments, pricing, staff) override it with a sibling file.
import {
  OpsSkeletonHeader,
  OpsSkeletonPage,
  OpsSkeletonStats,
  OpsSkeletonTable,
} from './ops-skeleton'

export default function OpsConsoleLoading() {
  return (
    <OpsSkeletonPage>
      <OpsSkeletonHeader titleWidth={200} subWidth={360} />
      <OpsSkeletonStats count={4} />
      <OpsSkeletonTable rows={7} cols={5} />
    </OpsSkeletonPage>
  )
}
