'use client'

// The analytics screen: one filter bar driving three reports (B1/B2/B3), plus the
// B4 exports. Every report takes the SAME filter, so switching tabs keeps the range
// and the resort/host selection — and an export always matches what is on screen,
// because it reuses the identical querystring.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { COLORS, SERIF } from '../../ops-theme'
import { OpsSkeletonChart, OpsSkeletonStats } from '../ops-skeleton'
import {
  BarList,
  Stat,
  StatGrid,
  TrendBars,
  adminGet,
  controlStyle,
  fieldLabel,
  ghostBtn,
  money,
  pageStyle,
  panelStyle,
  solidBtn,
} from '../ops-ui'

type Kind = 'bookings' | 'revenue' | 'cancellations'
const KINDS: Array<{ id: Kind; label: string }> = [
  { id: 'bookings', label: 'Bookings' },
  { id: 'revenue', label: 'Payments' },
  { id: 'cancellations', label: 'Cancellations' },
]

type Facets = {
  regions: string[]
  resorts: Array<{ id: string; name: string; region: string }>
  hosts: Array<{ id: string; email: string; name: string | null }>
}

type Filters = {
  from: string
  to: string
  region: string
  resort: string
  host: string
  granularity: 'day' | 'week' | 'month'
}

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

const section: React.CSSProperties = { ...panelStyle, marginTop: 14 }
const h2: React.CSSProperties = { margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: COLORS.burgundy }

export function OpsAnalytics() {
  const [filters, setFilters] = useState<Filters>({
    from: daysAgo(90),
    to: today(),
    region: '',
    resort: '',
    host: '',
    granularity: 'day',
  })
  const [kind, setKind] = useState<Kind>('bookings')
  const [facets, setFacets] = useState<Facets>({ regions: [], resorts: [], hosts: [] })
  // Payload is stored WITH the kind it belongs to. Keeping them as separate state
  // let a tab switch render the new kind against the previous kind's payload for
  // one frame — effects run after render — which crashed the view.
  const [data, setData] = useState<{ kind: Kind; payload: Record<string, unknown> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** The single source of truth for what is being asked — reports AND exports both
   *  build their URL from this, which is what keeps an export honest. */
  const query = useMemo(() => {
    const p = new URLSearchParams({ from: filters.from, to: filters.to, granularity: filters.granularity })
    if (filters.region) p.set('region', filters.region)
    if (filters.resort) p.set('resort', filters.resort)
    if (filters.host) p.set('host', filters.host)
    return p.toString()
  }, [filters])

  useEffect(() => {
    void (async () => {
      const f = await adminGet<Facets>('analytics/facets')
      if (f && f !== 'forbidden') setFacets(f)
    })()
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      const res = await adminGet<Record<string, unknown>>(`analytics/${kind}?${query}`)
      if (cancelled) return
      if (res === 'forbidden') setError('Your account does not have the Analytics module.')
      else if (!res) setError('Could not load the report. Please retry.')
      else if (typeof res.error === 'string') setError(res.error)
      else setData({ kind, payload: res })
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [kind, query])

  const set = useCallback((patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch })), [])

  const preset = (days: number) => set({ from: daysAgo(days), to: today() })

  // Resort options are grouped by region, and narrow to the selected region so the
  // two filters can't contradict each other.
  const resortOptions = useMemo(
    () => (filters.region ? facets.resorts.filter((r) => r.region === filters.region) : facets.resorts),
    [facets.resorts, filters.region]
  )

  return (
    <main style={pageStyle}>
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 64px' }}>
        <h1
          style={{
            margin: '0 0 4px',
            fontFamily: SERIF,
            fontSize: 'clamp(24px, 4vw, 30px)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: COLORS.burgundy,
          }}
        >
          Analytics
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: COLORS.muted }}>
          Bookings, payments and cancellations. Every report uses the filters below, and the
          exports match exactly what you see.
        </p>

        {/* ---- Filter bar ---- */}
        <div style={{ ...panelStyle, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={fieldLabel} htmlFor="f-from">From</label>
              <input id="f-from" type="date" value={filters.from} max={filters.to}
                onChange={(e) => set({ from: e.target.value })} style={controlStyle} />
            </div>
            <div>
              <label style={fieldLabel} htmlFor="f-to">To</label>
              <input id="f-to" type="date" value={filters.to} min={filters.from} max={today()}
                onChange={(e) => set({ to: e.target.value })} style={controlStyle} />
            </div>
            <div>
              <label style={fieldLabel} htmlFor="f-region">Region</label>
              <select id="f-region" value={filters.region} style={controlStyle}
                onChange={(e) => set({ region: e.target.value, resort: '' })}>
                <option value="">All regions</option>
                {facets.regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={fieldLabel} htmlFor="f-resort">Resort</label>
              <select id="f-resort" value={filters.resort} onChange={(e) => set({ resort: e.target.value })} style={controlStyle}>
                <option value="">All resorts</option>
                {resortOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                {/* The two buckets a resort id cannot address. */}
                <option value="__other__">Others (host-typed)</option>
                <option value="__none__">Unassigned</option>
              </select>
            </div>
            <div>
              <label style={fieldLabel} htmlFor="f-host">Host</label>
              <select id="f-host" value={filters.host} onChange={(e) => set({ host: e.target.value })} style={controlStyle}>
                <option value="">All hosts</option>
                {facets.hosts.map((h) => <option key={h.id} value={h.id}>{h.name || h.email}</option>)}
              </select>
            </div>
            <div>
              <label style={fieldLabel} htmlFor="f-gran">Bucket</label>
              <select id="f-gran" value={filters.granularity} style={controlStyle}
                onChange={(e) => set({ granularity: e.target.value as Filters['granularity'] })}>
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {[30, 90, 365].map((d) => (
              <button key={d} type="button" onClick={() => preset(d)} style={ghostBtn}>
                Last {d} days
              </button>
            ))}
            <span style={{ flex: 1 }} />
            {/* B4 — the export routes take the identical querystring. */}
            <a href={`/api/local/admin/analytics/export?kind=${kind}&format=csv&${query}`} style={{ ...ghostBtn, textDecoration: 'none' }}>
              Export CSV
            </a>
            <a href={`/api/local/admin/analytics/export?kind=${kind}&format=xlsx&${query}`} style={{ ...solidBtn, textDecoration: 'none' }}>
              Export Excel
            </a>
          </div>
        </div>

        {/* ---- Report tabs ---- */}
        <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0 0' }}>
          {KINDS.map((k) => (
            <button key={k.id} type="button" onClick={() => setKind(k.id)}
              style={k.id === kind ? solidBtn : ghostBtn}>
              {k.label}
            </button>
          ))}
        </nav>

        {error ? (
          <div style={{ ...section, color: COLORS.red, fontSize: 13, fontWeight: 700 }}>{error}</div>
        ) : loading || !data || data.kind !== kind ? (
          // Switching report kind refetches, so this shows on every tab change —
          // not only the first load. All three reports open with headline numbers
          // above a chart, which is the shape held here.
          <div style={section}>
            <OpsSkeletonStats count={4} />
            <OpsSkeletonChart bars={26} />
          </div>
        ) : data.kind === 'bookings' ? (
          <BookingsView data={data.payload as never} />
        ) : data.kind === 'revenue' ? (
          <RevenueView data={data.payload as never} />
        ) : (
          <CancellationsView data={data.payload as never} />
        )}
      </section>
    </main>
  )
}

// ---- B1 ---------------------------------------------------------------------

function BookingsView({ data }: { data: { totals: Record<string, number>; trend: never[]; byResort: never[]; byStatus: never[] } }) {
  const t = data.totals
  return (
    <>
      <div style={section}>
        <StatGrid>
          <Stat label="Total bookings" value={t.total.toLocaleString()} />
          <Stat label="Active" value={t.active.toLocaleString()} hint="Confirmed, stay not ended" />
          <Stat label="Completed" value={t.completed.toLocaleString()} />
          <Stat label="Cancelled" value={t.cancelled.toLocaleString()} />
          <Stat label="Rejected" value={t.rejected.toLocaleString()} hint="Declined by host" />
          <Stat label="Gross value" value={money(t.gross)} />
        </StatGrid>
      </div>
      <div style={section}>
        <h2 style={h2}>Bookings created</h2>
        <TrendBars points={data.trend} metric="count" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <div style={section}>
          <h2 style={h2}>By resort</h2>
          <BarList rows={data.byResort} format={money} />
        </div>
        <div style={section}>
          <h2 style={h2}>By status</h2>
          <BarList rows={data.byStatus} format={money} />
        </div>
      </div>
    </>
  )
}

// ---- B2 ---------------------------------------------------------------------

function RevenueView({ data }: { data: { totals: Record<string, number>; trend: never[]; byResort: never[] } }) {
  const t = data.totals
  return (
    <>
      <div style={section}>
        <StatGrid>
          <Stat label="Guests paid" value={money(t.gross)} hint={`${t.paidCount} paid bookings`} />
          <Stat label="Commission earned" value={money(t.commission)} hint="QuickIn's markup" />
          <Stat label="Host payouts" value={money(t.hostPayouts)} hint="their price, in full" />
          <Stat label="Refunded" value={money(t.refunded)} hint={`${t.refundedCount} refunded`} />
          <Stat label="Pending payout" value={money(t.pendingPayout)} hint="Estimate — stays not ended" />
          <Stat label="Settled payout" value={money(t.settledPayout)} hint="Estimate — stays ended" />
        </StatGrid>
        <p style={{ margin: '12px 0 0', fontSize: 11, color: COLORS.muted, lineHeight: 1.6 }}>
          The commission is a <strong>markup on the host&rsquo;s price</strong>, not a deduction from it:
          &ldquo;Guests paid&rdquo; is what was collected, &ldquo;Host payouts&rdquo; is the price the host
          named and receives in full, and the commission is the gap. Each booking counts at the rate
          stored on it when it was taken, so changing the platform rate never rewrites history.{' '}
          <strong>Payout figures are derived estimates</strong> — there is no payouts ledger, so they are
          the host&rsquo;s price split by whether the stay has ended.
        </p>
      </div>
      <div style={section}>
        <h2 style={h2}>Revenue</h2>
        <TrendBars points={data.trend} metric="gross" format={money} />
      </div>
      <div style={section}>
        <h2 style={h2}>By resort</h2>
        <BarList rows={data.byResort} format={money} />
      </div>
    </>
  )
}

// ---- B3 ---------------------------------------------------------------------

function CancellationsView({
  data,
}: {
  data: { totals: Record<string, number>; trend: never[]; byActor: never[]; byPolicy: never[]; byResort: never[] }
}) {
  const t = data.totals
  return (
    <>
      <div style={section}>
        <StatGrid>
          <Stat label="Cancellations" value={t.cancelled.toLocaleString()} />
          <Stat label="Cancellation rate" value={`${t.rate}%`} hint="vs bookings created in range" />
          <Stat label="Bookings created" value={t.totalInWindow.toLocaleString()} />
          <Stat label="Refunded value" value={money(t.refundedValue)} />
        </StatGrid>
      </div>
      <div style={section}>
        <h2 style={h2}>Cancellations over time</h2>
        <TrendBars points={data.trend} metric="count" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <div style={section}>
          <h2 style={h2}>By who cancelled</h2>
          <BarList rows={data.byActor} format={money} />
          <p style={{ margin: '10px 0 0', fontSize: 11, color: COLORS.muted, lineHeight: 1.6 }}>
            Attribution starts from the release that added it — anything earlier reads
            &ldquo;Unknown&rdquo;. A host declining a pending request counts as a host termination;
            hosts cannot cancel a confirmed booking.
          </p>
        </div>
        <div style={section}>
          <h2 style={h2}>By cancellation policy</h2>
          <BarList rows={data.byPolicy} format={money} />
          <p style={{ margin: '10px 0 0', fontSize: 11, color: COLORS.muted, lineHeight: 1.6 }}>
            The policy recorded on the booking when it was made — not the listing&apos;s current
            policy, which its host can change at any time.
          </p>
        </div>
      </div>
      <div style={section}>
        <h2 style={h2}>By resort</h2>
        <BarList rows={data.byResort} format={money} />
      </div>
    </>
  )
}
