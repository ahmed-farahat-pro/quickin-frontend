'use client'

// The alert centre (F4) — everything waiting on a human, with how long it's waited.
//
// Polls on the same 30s cadence as the dashboard, so an operator can leave this open
// as a work queue. Empty is a real state worth showing well: "nothing is waiting" is
// the answer people most want.
import { useCallback, useEffect, useState } from 'react'
import { COLORS, SERIF } from '../../ops-theme'
import { OpsHeader } from '../ops-session'
import { adminGetQuiet, pageStyle, panelStyle } from '../ops-ui'
import { useLivePoll, agoLabel } from '../use-live-stats'
import { alertTotal, waitingLabel, type Alert } from '@/lib/local/activity-core'

type Payload = { alerts: Alert[]; total: number; oldest: Record<string, string | null> }

export function OpsAlerts({
  initialAlerts,
  initialOldest,
}: {
  initialAlerts: Alert[]
  initialOldest: Record<string, string | null>
}) {
  const fetcher = useCallback(() => adminGetQuiet<Payload>('alerts'), [])
  const live = useLivePoll<Payload>(fetcher, 30_000, {
    alerts: initialAlerts,
    total: alertTotal(initialAlerts),
    oldest: initialOldest,
  })

  // Ticks the "waited 3 days" / "updated 12s ago" labels without refetching.
  const [now, setNow] = useState(() => 0)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const alerts = live.data?.alerts ?? []
  const oldest = live.data?.oldest ?? {}

  return (
    <main style={pageStyle}>
      <OpsHeader title="Alerts" />
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: '0 0 4px', fontFamily: SERIF, fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', color: COLORS.burgundy }}>
            Alerts
          </h1>
          <span style={{ fontSize: 12, color: live.expired ? COLORS.red : COLORS.muted }}>
            {live.expired
              ? 'Session ended — reload to resume live updates'
              : `Live · updated ${agoLabel(live.updatedAt, now || Date.now())}`}
          </span>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: COLORS.muted }}>
          Everything waiting on someone. Only the queues your account can act on appear here.
        </p>

        {live.error && !live.expired && (
          <div style={{ ...panelStyle, marginBottom: 12, color: COLORS.red, fontSize: 13, fontWeight: 700 }}>{live.error}</div>
        )}

        {alerts.length === 0 ? (
          <div style={{ ...panelStyle, textAlign: 'center', padding: '44px 24px' }}>
            <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: COLORS.green }}>Nothing is waiting</p>
            <p style={{ margin: 0, fontSize: 13, color: COLORS.muted }}>
              Every queue you can act on is clear.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {alerts.map((a) => (
              <a
                key={a.key}
                href={a.href}
                style={{
                  ...panelStyle,
                  display: 'flex', alignItems: 'center', gap: 16,
                  textDecoration: 'none', borderLeft: `4px solid ${COLORS.burgundy}`,
                }}
              >
                <span style={{ fontSize: 30, fontWeight: 800, color: COLORS.burgundy, lineHeight: 1, minWidth: 52 }}>
                  {a.count}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: COLORS.ink }}>{a.label}</span>
                  {oldest[a.key] ? (
                    <span style={{ display: 'block', fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
                      oldest has waited {waitingLabel(oldest[a.key], now || Date.now())}
                    </span>
                  ) : null}
                </span>
                <span style={{ fontSize: 13, color: COLORS.burgundy, fontWeight: 700 }}>Open →</span>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
