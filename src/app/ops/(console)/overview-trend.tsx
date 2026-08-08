'use client'

// The Overview's count tiles and the graph they drive.
//
// The twelve tiles used to be a dead grid: every number was "as of right now", so
// nothing on the screen said whether the platform was growing or stalling. They are
// now a metric picker — click a tile, the panel below draws its history.
//
// WHY THREE TILES DO NOT CLICK. A tile counts rows matching a predicate today;
// charting it needs a timestamp for when each row started matching. Published,
// Pending bookings and Confirmed have none (no `published_at`, no status-change
// stamps on bookings), so they render as plain tiles rather than as a line that
// silently answers a different question. overview-trends-core.ts documents the fix
// if they are ever wanted: a nightly snapshot table, not a cleverer query.
//
// The whole grid lives here rather than in ops-dashboard.tsx so that "which tile is
// clickable" sits next to the metric whitelist it has to agree with.
import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { COLORS, FONT } from '../ops-theme'
import { adminGetQuiet } from './ops-ui'
import { OpsSkeletonChart } from './ops-skeleton'
import { ShimmerStyles, SkeletonBlock } from '@/components/ui/skeleton-block'
import type { AdminStats } from './ops-dashboard'

type MetricId =
  | 'users' | 'hosts' | 'verified' | 'listings'
  | 'bookings' | 'paid' | 'applications' | 'verifications'

type RangeId = '7d' | '30d' | '90d' | '12mo'

type SeriesPoint = { bucket: string; count: number; total: number | null }
type MetricMeta = { label: string; cumulative: boolean; note: string | null }

type TrendResponse = {
  range: RangeId
  granularity: 'day' | 'month'
  series: Record<MetricId, SeriesPoint[]>
  metrics: Record<MetricId, MetricMeta>
}

/** 'total' plots the running total (what the tile shows, rewound); 'new' plots the
 *  additions in each bucket. Queue metrics only have 'new' — see MetricMeta.cumulative. */
type Mode = 'total' | 'new'

const RANGES: Array<{ id: RangeId; label: string }> = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: '12mo', label: '12 months' },
]

/**
 * The tiles, in the order they render. `metric` absent = no history exists, so the
 * tile is not a button.
 *
 * Two tiles borrow another tile's metric because they are the same population read
 * differently: "Bookings today" is the bookings series at daily resolution, and both
 * queue tiles open on their submission flow, which is all that is recorded.
 */
const CARDS: Array<{
  label: string
  value: (s: AdminStats) => number
  metric?: MetricId
  /** Mode to switch to when this tile is clicked. Defaults to the current mode. */
  opensAs?: Mode
}> = [
  { label: 'Users', value: (s) => s.users, metric: 'users' },
  { label: 'Hosts', value: (s) => s.hosts, metric: 'hosts' },
  { label: 'Verified', value: (s) => s.verified, metric: 'verified' },
  { label: 'Listings', value: (s) => s.listings, metric: 'listings' },
  { label: 'Published', value: (s) => s.published },
  { label: 'Bookings', value: (s) => s.bookings, metric: 'bookings' },
  { label: 'Bookings today', value: (s) => s.bookings_today, metric: 'bookings', opensAs: 'new' },
  { label: 'Pending bookings', value: (s) => s.pending_bookings },
  { label: 'Confirmed', value: (s) => s.confirmed_bookings },
  { label: 'Paid', value: (s) => s.paid_bookings, metric: 'paid' },
  { label: 'Pending applications', value: (s) => s.pending_applications, metric: 'applications', opensAs: 'new' },
  { label: 'Pending IDs', value: (s) => s.pending_verifications, metric: 'verifications', opensAs: 'new' },
]

/** 'YYYY-MM-DD' → the short axis label. Parsed as UTC to match the buckets, which
 *  are UTC date strings — `new Date('2026-08-08')` is already UTC, but the explicit
 *  slice keeps it independent of that quirk. */
function axisLabel(bucket: string, granularity: 'day' | 'month'): string {
  const [y, m, d] = bucket.split('-').map(Number)
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1))
  return granularity === 'month'
    ? date.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function fullLabel(bucket: string, granularity: 'day' | 'month'): string {
  const [y, m, d] = bucket.split('-').map(Number)
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1))
  return granularity === 'month'
    ? date.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const panel: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${COLORS.tan}`,
  borderRadius: 18,
  padding: 18,
  boxShadow: '0 1px 3px rgba(42,34,32,0.06)',
}

const chip = (active: boolean): React.CSSProperties => ({
  padding: '5px 12px',
  borderRadius: 999,
  fontSize: 12.5,
  fontWeight: 700,
  fontFamily: FONT,
  cursor: 'pointer',
  background: active ? COLORS.burgundy : 'transparent',
  color: active ? COLORS.cream : COLORS.muted,
  border: `1px solid ${active ? COLORS.burgundy : 'rgba(42,34,32,0.16)'}`,
})

export function OverviewMetrics({
  stats,
  initial = null,
}: {
  stats: AdminStats
  /** The default range, loaded on the server by page.tsx. When present the chart is
   *  drawn on arrival and the mount fetch never runs. */
  initial?: TrendResponse | null
}) {
  const [range, setRange] = useState<RangeId>(initial?.range ?? '30d')
  const [metric, setMetric] = useState<MetricId>('users')
  const [mode, setMode] = useState<Mode>('total')

  // Every range that has been loaded, keyed by range. Seeded from the server payload,
  // so the default range is already in here on the very first render — that is what
  // makes arrival wait-free. It doubles as a cache: switching back to a range you
  // have already looked at is instant and costs no request.
  const [cache, setCache] = useState<Partial<Record<RangeId, TrendResponse>>>(() =>
    initial ? { [initial.range]: initial } : {},
  )
  const [errors, setErrors] = useState<Partial<Record<RangeId, string>>>({})
  // Which range to keep on screen while a new one loads. Advanced in the click
  // handler — not in an effect — so it is set exactly when the switch is made.
  const [prevRange, setPrevRange] = useState<RangeId | null>(initial?.range ?? null)

  const selectRange = (next: RangeId) => {
    if (next === range) return
    // Only hold over something that is actually drawn: mid-switch, the range being
    // left may itself still be loading, and the one before it is what to keep.
    if (cache[range]) setPrevRange(range)
    setRange(next)
  }

  // Fetch a range the first time it is asked for. The response carries EVERY metric,
  // so switching TILES is free — and the Overview's 30-second stats poll deliberately
  // does not drag these queries along with it. A trend line does not move meaningfully
  // inside half a minute.
  useEffect(() => {
    if (cache[range]) return
    let cancelled = false
    void (async () => {
      const res = await adminGetQuiet<TrendResponse>(`stats/trends?range=${range}`)
      if (cancelled) return
      const fail = (error: string) => setErrors((e) => ({ ...e, [range]: error }))
      if (res === 'forbidden') fail('Your account does not have the Overview module.')
      else if (res === 'expired') fail('Your session has ended. Reload to sign in again.')
      else if (!res) fail('Could not load the graph. Try Refresh.')
      else setCache((c) => ({ ...c, [range]: res }))
    })()
    return () => {
      cancelled = true
    }
  }, [range, cache])

  const data = cache[range] ?? null
  const error = errors[range] ?? null
  const loading = !data && !error

  // `data` when this range is loaded; otherwise the range that was on screen when the
  // switch happened, held over and dimmed until the new one arrives.
  //
  // ops-skeleton.tsx makes the same argument about section refreshes: replacing what
  // someone is reading with a placeholder is worse than leaving it up while the new
  // rows arrive. A skeleton is for a FIRST paint, when there is nothing to keep.
  //
  // Tracked as the previous range's KEY rather than a held payload, so it stays a
  // plain derivation off `cache` — a ref would have to be read during render, which
  // is exactly the bug that makes a component not re-render when it should.
  const shown = data ?? (prevRange ? cache[prevRange] ?? null : null)
  const stale = data === null && shown !== null && !error

  const meta: MetricMeta | null = shown?.metrics?.[metric] ?? null
  // A metric with no meaningful running total is pinned to 'new' whatever the
  // toggle last said — otherwise clicking Pending IDs after Users would draw a
  // cumulative line labelled as a queue.
  const effectiveMode: Mode = meta && !meta.cumulative ? 'new' : mode

  const points = useMemo(() => {
    const raw = shown?.series?.[metric] ?? []
    return raw.map((p) => ({
      bucket: p.bucket,
      value: effectiveMode === 'total' ? (p.total ?? p.count) : p.count,
    }))
  }, [shown, metric, effectiveMode])

  const delta = useMemo(
    () => (shown?.series?.[metric] ?? []).reduce((n, p) => n + p.count, 0),
    [shown, metric],
  )

  const granularity = shown?.granularity ?? 'day'
  // The range the DRAWN series belongs to, which during a switch is not the pressed
  // chip. Captioning a held-over 30-day line "in the last 90 days" would be a plain
  // lie, so while it is stale the caption shimmers instead.
  const shownRangeLabel = RANGES.find((r) => r.id === shown?.range)?.label ?? ''
  const selectedCard = CARDS.find((c) => c.metric === metric)

  const pick = (card: (typeof CARDS)[number]) => {
    if (!card.metric) return
    setMetric(card.metric)
    if (card.opensAs) setMode(card.opensAs)
  }

  return (
    <section style={{ marginBottom: 20 }}>
      {/* Real CSS, so the tiles get :hover and :focus-visible. /ops is inline-styled
          throughout, but a hover cue cannot be expressed inline without tracking
          pointer state in React for twelve tiles — and :focus-visible cannot be
          expressed inline at all, which would leave the keyboard path invisible. */}
      <style>{`
        .qk-tile { transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease; }
        .qk-tile-btn { cursor: pointer; }
        .qk-tile-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(42,34,32,0.13); border-color: ${COLORS.burgundy}; }
        .qk-tile-btn:focus-visible { outline: 2px solid ${COLORS.burgundy}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .qk-tile { transition: none; } .qk-tile-btn:hover { transform: none; } }
      `}</style>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 14,
          marginBottom: 14,
        }}
      >
        {CARDS.map((card) => {
          const clickable = Boolean(card.metric)
          const active = clickable && card.metric === metric
          const style: React.CSSProperties = {
            background: active ? '#fff' : COLORS.tan,
            border: `1.5px solid ${active ? COLORS.burgundy : COLORS.tan}`,
            borderRadius: 18,
            padding: '18px 18px 16px',
            boxShadow: active ? '0 4px 14px rgba(91,15,22,0.12)' : '0 1px 3px rgba(42,34,32,0.06)',
            textAlign: 'left',
            width: '100%',
            fontFamily: FONT,
            display: 'block',
          }
          const inner = (
            <>
              <div style={{ fontSize: 30, fontWeight: 800, color: COLORS.burgundy, lineHeight: 1.1 }}>
                {card.value(stats).toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 6, fontWeight: 600 }}>
                {card.label}
              </div>
            </>
          )
          return clickable ? (
            <button
              key={card.label}
              type="button"
              className="qk-tile qk-tile-btn"
              style={style}
              onClick={() => pick(card)}
              aria-pressed={active}
              title={`Show ${card.label.toLowerCase()} over time`}
            >
              {inner}
            </button>
          ) : (
            <div
              key={card.label}
              className="qk-tile"
              style={style}
              // Said plainly, so a tile that does not react reads as a known limit
              // rather than as a broken button.
              title="No history recorded for this number"
            >
              {inner}
            </div>
          )
        })}
      </div>

      {/* ---- The graph ---- */}
      <div style={panel} aria-busy={loading || stale}>
        <ShimmerStyles />
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 4,
          }}
        >
          <div style={{ minWidth: 200 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: COLORS.burgundy }}>
              {meta?.label ?? selectedCard?.label ?? 'Trend'}
            </h2>
            {/* The caption has a fixed 15px line box in every state, so the chart
                below it never shifts when the words arrive. */}
            <div style={{ height: 15, marginTop: 4, display: 'flex', alignItems: 'center' }}>
              {loading || stale ? (
                <SkeletonBlock width={148} height={11} radius={5} />
              ) : error ? null : (
                <p style={{ margin: 0, fontSize: 12, color: COLORS.muted, lineHeight: 1 }}>
                  {`${delta >= 0 ? '+' : ''}${delta.toLocaleString()} in the last ${shownRangeLabel.toLowerCase()}`}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Hidden, not disabled, when a running total is meaningless — the note
                below already explains why, and a dead control invites clicking. */}
            {meta?.cumulative !== false && (
              <div style={{ display: 'flex', gap: 6, marginRight: 4 }}>
                <button type="button" style={chip(effectiveMode === 'total')} onClick={() => setMode('total')}>
                  Total
                </button>
                <button type="button" style={chip(effectiveMode === 'new')} onClick={() => setMode('new')}>
                  New
                </button>
              </div>
            )}
            {RANGES.map((r) => (
              <button key={r.id} type="button" style={chip(range === r.id)} onClick={() => selectRange(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {meta?.note ? (
          <p style={{ margin: '6px 0 0', fontSize: 11.5, color: COLORS.muted, lineHeight: 1.6 }}>
            {meta.note}
          </p>
        ) : null}

        {/* Three states, in the order they cost the operator:
              error   — say so.
              nothing drawn yet — shapes, not a sentence. Only reachable when the
                        server seed failed, or on a range never loaded before.
              held over — the previous range's chart, dimmed and non-interactive
                        while the new one arrives. Blanking a chart someone is
                        reading in order to redraw the same shape is the jarring
                        part; fading it says "updating" without taking it away. */}
        <div
          style={{
            height: 260,
            marginTop: 12,
            opacity: stale ? 0.4 : 1,
            transition: 'opacity .18s ease',
            pointerEvents: stale ? 'none' : undefined,
          }}
        >
          {error ? (
            <p style={{ fontSize: 13, color: COLORS.red, fontWeight: 700 }}>{error}</p>
          ) : !shown ? (
            <OpsSkeletonChart bars={30} height={230} />
          ) : points.length === 0 ? (
            <p style={{ fontSize: 13, color: COLORS.muted }}>No data in this range.</p>
          ) : (
            /* isAnimationActive={false} on both marks, for two reasons.
               Recharts draws its entry animation with a clipPath whose width grows
               from zero on requestAnimationFrame — and browsers throttle rAF in a
               BACKGROUND TAB, so a console opened in one (or left to load while the
               operator does something else) paints axes, gridlines and a caption
               around an empty rectangle until it is focused. The chart is not
               missing, it is clipped to nothing, which is worse than slow.
               Second: this panel is a metric SELECTOR. Re-animating ninety points
               every time a tile is clicked fights the comparison it exists for. */
            <ResponsiveContainer width="100%" height="100%">
              {effectiveMode === 'total' ? (
                // A running total is a level, so it reads as a filled area…
                <AreaChart data={points} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="qk-trend-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.burgundy} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={COLORS.burgundy} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(42,34,32,0.08)" vertical={false} />
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={(b: string) => axisLabel(b, granularity)}
                    tick={{ fontSize: 11, fill: COLORS.muted }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(42,34,32,0.12)' }}
                    minTickGap={28}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: COLORS.muted }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    allowDecimals={false}
                  />
                  <Tooltip content={<TrendTooltip granularity={granularity} />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={COLORS.burgundy}
                    strokeWidth={2}
                    fill="url(#qk-trend-fill)"
                    // 90 daily points with a dot on each is a caterpillar, not a chart.
                    dot={points.length <= 14}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              ) : (
                // …while additions are discrete events, so they read as bars.
                <BarChart data={points} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(42,34,32,0.08)" vertical={false} />
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={(b: string) => axisLabel(b, granularity)}
                    tick={{ fontSize: 11, fill: COLORS.muted }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(42,34,32,0.12)' }}
                    minTickGap={28}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: COLORS.muted }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(91,15,22,0.06)' }}
                    content={<TrendTooltip granularity={granularity} />}
                  />
                  <Bar
                    dataKey="value"
                    fill={COLORS.burgundy}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={26}
                    isAnimationActive={false}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * Recharts injects `active` / `payload` / `label` — `label` being the x value, i.e.
 * the bucket. The metric's name is deliberately NOT passed in: it would collide with
 * that injected prop, and the panel heading two inches above already says it.
 */
function TrendTooltip({
  active,
  payload,
  label,
  granularity,
}: {
  active?: boolean
  payload?: Array<{ value?: number }>
  label?: string
  granularity: 'day' | 'month'
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${COLORS.tan}`,
        borderRadius: 10,
        padding: '8px 11px',
        boxShadow: '0 6px 18px rgba(42,34,32,0.12)',
        fontFamily: FONT,
      }}
    >
      <div style={{ fontSize: 11, color: COLORS.muted }}>{fullLabel(String(label ?? ''), granularity)}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.burgundy, lineHeight: 1.3 }}>
        {(payload[0]?.value ?? 0).toLocaleString()}
      </div>
    </div>
  )
}
