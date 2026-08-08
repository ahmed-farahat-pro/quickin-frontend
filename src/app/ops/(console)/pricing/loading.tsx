// Pricing & commission is a settings form, not a table — page.tsx awaits both the
// config and the impact preview before rendering. Narrower column (960) and the
// heavier top padding of the two form-shaped console screens, matching page.tsx.
import { SkeletonBlock } from '@/components/ui/skeleton-block'
import { OpsSkeletonForm, OpsSkeletonPage } from '../ops-skeleton'

export default function OpsPricingLoading() {
  return (
    <OpsSkeletonPage maxWidth={960} padding="36px 24px 72px">
      {/* Serif heading + one-line description, per page.tsx */}
      <SkeletonBlock width={286} height={32} radius={10} style={{ maxWidth: '100%' }} />
      <SkeletonBlock width={420} height={15} style={{ margin: '12px 0 28px', maxWidth: '100%' }} />

      <OpsSkeletonForm fields={2} />

      {/* The impact preview that sits under the form */}
      <div style={{ marginTop: 18 }}>
        <OpsSkeletonForm fields={3} button={false} />
      </div>
    </OpsSkeletonPage>
  )
}
