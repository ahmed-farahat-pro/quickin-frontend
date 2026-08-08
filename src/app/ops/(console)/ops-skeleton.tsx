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
// This module carries no 'use client' of its own, which lets it serve both waits.
// The loading.tsx files import it as server components — a route placeholder should
// never ship JavaScript to draw itself. OpsDashboard and OpsPayments import the same
// primitives from the client, for the SECOND wait: those screens arrive as real
// chrome and then fetch their own data, and used to sit on the words "Loading live
// data…" while they did. Same shapes, so the two waits look like one.
import type { SectionId } from './ops-dashboard'
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

/** ops-dashboard.tsx builds its own card shape (tan border, lighter shadow) rather
 *  than using ops-ui's panel. In-place skeletons sit among those cards, so they have
 *  to match that one and not the panel above. */
const dashCard: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${COLORS.tan}`,
  borderRadius: 18,
  padding: 18,
  boxShadow: '0 1px 3px rgba(42,34,32,0.06)',
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

/**
 * A stack of dashboard cards. `image` adds the 120×90 thumbnail the listings queue
 * puts on the left of each row.
 */
export function OpsSkeletonCardList({
  rows = 4,
  image = false,
  lines = 3,
}: {
  rows?: number
  image?: boolean
  lines?: number
}) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ ...dashCard, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {image ? (
            <SkeletonBlock width={120} height={90} radius={12} style={{ flex: '0 0 auto' }} />
          ) : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <SkeletonBlock width="42%" height={16} radius={7} />
              <SkeletonBlock width={78} height={11} style={{ flex: '0 0 auto' }} />
            </div>
            <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
              {Array.from({ length: lines }).map((_, j) => (
                <SkeletonBlock key={j} width={j === lines - 1 ? '48%' : '78%'} height={12} />
              ))}
            </div>
          </div>
          <SkeletonBlock width={86} height={31} radius={11} style={{ flex: '0 0 auto' }} />
        </div>
      ))}
    </div>
  )
}

/** The pill row the verifications queue filters through. */
export function OpsSkeletonChips({ count = 4 }: { count?: number }) {
  const widths = [72, 78, 74, 54]
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} width={widths[i % widths.length]} height={31} radius={11} />
      ))}
    </div>
  )
}

/**
 * What one dashboard section looks like while its own fetch is in flight.
 *
 * OpsDashboard renders five routes from one component and loads each section's data
 * from the browser after the page has already arrived. Before this, all five showed
 * the same sentence — "Loading live data…" — under a fully-drawn header, which reads
 * as a page that failed rather than a page that is working. Each section now holds
 * its own shape instead, so the content lands in the space already reserved for it.
 */
export function OpsSectionSkeleton({ section }: { section: SectionId }) {
  if (section === 'overview') {
    return (
      <div>
        <ShimmerStyles />
        <SkeletonBlock width={168} height={14} radius={6} style={{ marginBottom: 10 }} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 10,
            marginBottom: 14,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ ...dashCard, padding: '14px 16px' }}>
              <SkeletonBlock width="50%" height={22} radius={8} />
              <SkeletonBlock width="82%" height={11} style={{ marginTop: 9 }} />
            </div>
          ))}
        </div>
        <OpsSkeletonStats count={6} />
      </div>
    )
  }

  if (section === 'listings') {
    return (
      <div>
        <ShimmerStyles />
        <OpsSkeletonCardList rows={4} image lines={3} />
      </div>
    )
  }

  if (section === 'bookings') {
    return (
      <div>
        <ShimmerStyles />
        <OpsSkeletonStats count={3} />
        <OpsSkeletonCardList rows={5} lines={2} />
      </div>
    )
  }

  if (section === 'verifications') {
    return (
      <div>
        <ShimmerStyles />
        <OpsSkeletonChips count={4} />
        <OpsSkeletonCardList rows={4} lines={3} />
      </div>
    )
  }

  // applications
  return (
    <div>
      <ShimmerStyles />
      <OpsSkeletonCardList rows={4} lines={4} />
    </div>
  )
}

/**
 * Label + input pairs with NO card around them, for a form that is already inside
 * one. OpsSkeletonForm brings its own panel; dropping that into the Instapay
 * settings card would nest a card in a card.
 */
export function OpsSkeletonFields({ fields = 4, button = true }: { fields?: number; button?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560 }}>
      <ShimmerStyles />
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i}>
          <SkeletonBlock width={150} height={11} radius={5} />
          <SkeletonBlock height={40} radius={12} style={{ marginTop: 7 }} />
        </div>
      ))}
      {button ? <SkeletonBlock width={132} height={40} radius={12} style={{ marginTop: 4 }} /> : null}
    </div>
  )
}

/**
 * The bordered rows the payment queues stack — tan hairline, 14px radius, not the
 * shadowed dashboard card.
 */
export function OpsSkeletonQueueRows({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <ShimmerStyles />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ border: `1px solid ${COLORS.tan}`, borderRadius: 14, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <SkeletonBlock width="38%" height={15} radius={7} />
              <SkeletonBlock width="66%" height={12} style={{ marginTop: 8 }} />
            </div>
            <SkeletonBlock width={84} height={16} radius={7} style={{ flex: '0 0 auto' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <SkeletonBlock width={124} height={31} radius={11} />
            <SkeletonBlock width={92} height={31} radius={11} />
          </div>
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
