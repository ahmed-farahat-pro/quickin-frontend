// Skeleton primitives for the /ops console's loading.tsx files.
//
// Why this exists: every /ops page is `dynamic = 'force-dynamic'`, and the (console)
// layout awaits resolveStaffSession — a DB round-trip — before any of them render.
// With no loading boundary under /ops, the nearest one was the ROOT app/loading.tsx,
// so every sidebar click replaced the whole console with a fullscreen overlay and
// then redrew it. A loading.tsx beside the (console) layout suspends only that
// layout's children, which keeps OpsShell — top bar and sidebar — mounted while the
// content column swaps.
//
// Styling follows the console's own idiom: inline objects in the boutique palette
// rather than the app's shadcn kit (see ops-ui.tsx for why). The shimmer itself is
// reused from the shared skeleton-block module so /ops and /explore pulse alike.
//
// NOT a client component on purpose — a loading.tsx should never ship JavaScript to
// render a placeholder. That means importing the palette from ops-theme.ts (plain
// constants) rather than the 'use client' ops-ui.tsx.
import { ShimmerStyles, SkeletonBlock } from '@/components/ui/skeleton-block'
import { RouteProgress } from '@/components/ui/route-progress'
import { COLORS, FONT } from '../ops-theme'

/** Matches the panel shape in ops-ui.tsx (18px radius, hairline, soft shadow). */
const panel: React.CSSProperties = {
  background: '#fff',
  borderRadius: 18,
  border: '1px solid rgba(42,34,32,0.06)',
  boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
  padding: 18,
}

/**
 * The content column every console skeleton sits in.
 *
 * `maxWidth` mirrors the page it stands in for — 1080 for the dashboard sections,
 * 1100 for analytics, 960 for pricing — so the skeleton doesn't reflow the moment
 * real content arrives.
 *
 * Owns the one live region for the whole placeholder: a screen reader should hear
 * "loading" once, not once per shimmering rectangle.
 */
export function OpsSkeletonPage({
  children,
  maxWidth = 1080,
  padding = '28px 20px 64px',
}: {
  children: React.ReactNode
  maxWidth?: number
  padding?: string
}) {
  return (
    <main style={{ color: COLORS.ink, fontFamily: FONT }}>
      <RouteProgress />
      <ShimmerStyles />
      <p
        role="status"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      >
        Loading
      </p>
      <div style={{ maxWidth, margin: '0 auto', padding }}>{children}</div>
    </main>
  )
}

/** The h1 + one-line description every console screen opens with, plus the action
 *  buttons that sit opposite them. */
export function OpsSkeletonHeader({
  titleWidth = 210,
  subWidth = 320,
  actions = 1,
}: {
  titleWidth?: number
  subWidth?: number
  actions?: number
}) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 24,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <SkeletonBlock width={titleWidth} height={28} radius={9} style={{ maxWidth: '100%' }} />
        <SkeletonBlock width={subWidth} height={13} style={{ marginTop: 10, maxWidth: '100%' }} />
      </div>
      {actions > 0 ? (
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {Array.from({ length: actions }).map((_, i) => (
            <SkeletonBlock key={i} width={92} height={33} radius={11} />
          ))}
        </div>
      ) : null}
    </header>
  )
}

/** Mirrors <StatGrid> + <Stat> from ops-ui.tsx — the console's headline numbers. */
export function OpsSkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 10,
        marginBottom: 20,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ background: COLORS.tan, borderRadius: 14, padding: '14px 16px' }}>
          <SkeletonBlock width="55%" height={26} radius={8} />
          <SkeletonBlock width="80%" height={11} style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  )
}

/** The row of date/select/search controls most console screens filter through. */
export function OpsSkeletonFilters({ fields = 4, search = true }: { fields?: number; search?: boolean }) {
  return (
    <div style={{ ...panel, marginBottom: 18 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i}>
            <SkeletonBlock width={54} height={9} radius={4} />
            <SkeletonBlock width={128} height={34} radius={10} style={{ marginTop: 6 }} />
          </div>
        ))}
        {search ? (
          <div style={{ flex: 1, minWidth: 180 }}>
            <SkeletonBlock width={54} height={9} radius={4} />
            <SkeletonBlock height={34} radius={10} style={{ marginTop: 6 }} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * A table placeholder in a panel. Column widths are staggered rather than uniform —
 * a grid of identical bars reads as a loading GIF, staggered ones read as text.
 */
export function OpsSkeletonTable({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  // Deterministic widths: a loading.tsx renders on the server too, so anything
  // random here would hydrate mismatched.
  const widths = ['82%', '58%', '70%', '46%', '64%', '52%', '76%']
  return (
    <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: 12,
          padding: '11px 14px',
          borderBottom: '1px solid rgba(42,34,32,0.08)',
        }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBlock key={i} width="62%" height={9} radius={4} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap: 12,
            padding: '13px 14px',
            borderBottom: r === rows - 1 ? 'none' : '1px solid rgba(42,34,32,0.05)',
          }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonBlock key={c} width={widths[(r + c) % widths.length]} height={12} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** A titled card with a body of placeholder lines — the console's generic panel. */
export function OpsSkeletonPanel({
  lines = 3,
  titleWidth = 150,
  style,
}: {
  lines?: number
  titleWidth?: number
  style?: React.CSSProperties
}) {
  return (
    <section style={{ ...panel, ...style }}>
      <SkeletonBlock width={titleWidth} height={16} radius={7} />
      <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonBlock key={i} width={i === lines - 1 ? '55%' : '100%'} height={12} />
        ))}
      </div>
    </section>
  )
}

/** Label + input pairs, for the console's settings forms. */
export function OpsSkeletonForm({ fields = 3, button = true }: { fields?: number; button?: boolean }) {
  return (
    <section style={{ ...panel, padding: 22 }}>
      <SkeletonBlock width={180} height={17} radius={7} />
      <SkeletonBlock width="70%" height={12} style={{ marginTop: 9 }} />
      <div style={{ marginTop: 22, display: 'grid', gap: 16 }}>
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i}>
            <SkeletonBlock width={110} height={9} radius={4} />
            <SkeletonBlock height={42} radius={12} style={{ marginTop: 7 }} />
          </div>
        ))}
      </div>
      {button ? <SkeletonBlock width={140} height={40} radius={13} style={{ marginTop: 22 }} /> : null}
    </section>
  )
}

/** The stand-in for TrendBars/BarList on the analytics screen. */
export function OpsSkeletonChart({ bars = 24, height = 110 }: { bars?: number; height?: number }) {
  // A fixed sawtooth, not random heights — see the note in OpsSkeletonTable.
  const shape = [38, 62, 45, 78, 55, 90, 48, 70, 35, 84, 58, 66]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, paddingTop: 4 }}>
      {Array.from({ length: bars }).map((_, i) => (
        <SkeletonBlock
          key={i}
          height={`${shape[i % shape.length]}%`}
          radius="3px 3px 0 0"
          style={{ flex: '1 0 6px', minWidth: 6 }}
        />
      ))}
    </div>
  )
}
