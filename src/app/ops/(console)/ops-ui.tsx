'use client'

// Shared primitives for the /ops console pages.
//
// /ops is styled with inline objects in the boutique palette rather than the app's
// shadcn kit — a deliberate choice made when the console was built, so it stays
// self-contained. This module exists so the third and fourth page don't become the
// third and fourth copy of the same 200 lines of style objects.
//
// The palette itself lives in ../ops-theme.ts; this adds the console-specific
// table/panel/control shapes and the two authenticated fetch helpers.
import { COLORS, FONT } from '../ops-theme'

/** A console page is just the content column inside the shell — ops-shell.tsx owns
 *  the frame (full-height background, the top bar, the sidebar and the scroll), so
 *  this no longer claims 100vh of its own and no longer repaints the background. */
export const pageStyle: React.CSSProperties = {
  color: COLORS.ink,
  fontFamily: FONT,
}

export const panelStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 18,
  border: '1px solid rgba(42,34,32,0.06)',
  boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
  padding: 18,
}

export const btnBase: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 11,
  fontSize: 13,
  fontWeight: 700,
  fontFamily: FONT,
  cursor: 'pointer',
  border: 'none',
}

export const solidBtn: React.CSSProperties = { ...btnBase, background: COLORS.burgundy, color: COLORS.cream }
export const ghostBtn: React.CSSProperties = {
  ...btnBase,
  background: 'transparent',
  color: COLORS.muted,
  border: '1px solid rgba(42,34,32,0.16)',
}

export const controlStyle: React.CSSProperties = {
  padding: '8px 11px',
  borderRadius: 10,
  border: '1px solid rgba(42,34,32,0.16)',
  background: '#fff',
  color: COLORS.ink,
  fontSize: 13,
  fontFamily: FONT,
  outline: 'none',
}

export const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: COLORS.muted,
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

export const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '9px 11px',
  fontSize: 11,
  fontWeight: 700,
  color: COLORS.muted,
  borderBottom: '1px solid rgba(42,34,32,0.08)',
  whiteSpace: 'nowrap',
}

export const td: React.CSSProperties = {
  padding: '10px 11px',
  fontSize: 13,
  color: COLORS.ink,
  borderBottom: '1px solid rgba(42,34,32,0.05)',
}

export const numTd: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

/** A headline number with its caption. The console's basic unit of reporting. */
export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div style={{ background: COLORS.tan, borderRadius: 14, padding: '14px 16px', minWidth: 0 }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: COLORS.burgundy, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{label}</div>
      {hint ? <div style={{ fontSize: 11, color: COLORS.muted, opacity: 0.8, marginTop: 3 }}>{hint}</div> : null}
    </div>
  )
}

/** Responsive stat grid — the console has no CSS framework, so this is the layout. */
export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
      {children}
    </div>
  )
}

// ---- Empty states -----------------------------------------------------------
// "No listings." and "No payments waiting." used to render identically: one muted
// sentence naming the absent noun. They are not the same fact, and an operator
// reading the second one wants to feel finished, not stuck. The three tones:
//
//   'clear'    — a queue drained. Good news, so it gets the green treatment.
//   'blank'    — nothing has ever been created here. An invitation, plus the button.
//   'filtered' — rows exist; the current filters hide them. Say so, offer the undo.
//
// Picking a tone needs no extra request: every page already knows whether its own
// filters are at their defaults, which is the whole difference between the last two.

export type EmptyTone = 'clear' | 'blank' | 'filtered'

/** Every analytics panel is empty for the same reason and has the same fix, so the
 *  sentence lives here rather than being retyped at nine call sites. */
export const RANGE_HINT = 'Nothing was recorded between these dates. Try a wider range, or drop a filter.'

export interface EmptyProps {
  tone?: EmptyTone
  /** One line, sentence case, no trailing period — it is a heading. */
  title: string
  /** The sentence under it. This one does take a period. */
  body?: string
  action?: { label: string; href?: string; onClick?: () => void }
  /** Filter chips, a "clear all" control — anything the tone needs to be actionable. */
  meta?: React.ReactNode
  /** Drop the panel chrome, for when this already sits inside one (a table body). */
  inset?: boolean
}

export function Empty({ tone = 'blank', title, body, action, meta, inset }: EmptyProps) {
  const clear = tone === 'clear'
  const frame: React.CSSProperties = inset
    ? { padding: '30px 4px' }
    : {
        ...panelStyle,
        padding: '30px 22px',
        ...(clear ? { borderLeft: `4px solid ${COLORS.green}` } : null),
      }

  return (
    <div style={frame}>
      <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: clear ? COLORS.green : COLORS.ink }}>
        {title}
      </p>
      {body ? (
        <p style={{ margin: 0, fontSize: 13, color: COLORS.muted, lineHeight: 1.5, maxWidth: 460 }}>{body}</p>
      ) : null}
      {meta ? <div style={{ marginTop: 12 }}>{meta}</div> : null}
      {action ? (
        <div style={{ marginTop: 14 }}>
          {action.href ? (
            <a href={action.href} style={{ ...solidBtn, display: 'inline-block', textDecoration: 'none' }}>
              {action.label}
            </a>
          ) : (
            <button type="button" onClick={action.onClick} style={solidBtn}>
              {action.label}
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}

/** The same thing inside a table body, so an empty result keeps the columns it
 *  had a moment ago instead of collapsing the header into a stub. */
export function EmptyRow({ colSpan, ...rest }: EmptyProps & { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: '0 11px', borderBottom: 'none' }}>
        <Empty {...rest} inset />
      </td>
    </tr>
  )
}

/** The "clear all" affordance for a 'filtered' empty state. Text-only on purpose:
 *  the primary action on a filtered list is undoing the filter, not a new record. */
export function ClearFilters({ onClear, label = 'Clear all filters' }: { onClear: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClear}
      style={{ ...btnBase, background: 'transparent', color: COLORS.burgundy, padding: '6px 0', textDecoration: 'underline' }}
    >
      {label}
    </button>
  )
}

/** A horizontal bar list — a breakdown chart without pulling in a chart library
 *  for what is, visually, a table with a background fill. */
export function BarList({
  rows,
  format = (n: number) => n.toLocaleString(),
  emptyTitle = 'No data in this range',
}: {
  rows: Array<{ key: string; label: string; count: number; value: number }>
  format?: (n: number) => string
  emptyTitle?: string
}) {
  if (!rows.length) {
    return <Empty inset tone="filtered" title={emptyTitle} body={RANGE_HINT} />
  }
  const max = Math.max(...rows.map((r) => r.count), 1)
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {rows.map((r) => (
        <div key={r.key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: COLORS.ink, fontWeight: 600 }}>{r.label}</span>
            <span style={{ color: COLORS.muted, fontVariantNumeric: 'tabular-nums' }}>
              {r.count.toLocaleString()}
              {r.value ? ` · ${format(r.value)}` : ''}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: COLORS.tan, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.max(2, (r.count / max) * 100)}%`,
                height: '100%',
                background: COLORS.burgundy,
                borderRadius: 999,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Sparkline-ish trend bars. Same reasoning as BarList: no chart dependency for
 *  something this simple, and it inherits the palette for free. */
export function TrendBars({
  points,
  metric,
  format = (n: number) => n.toLocaleString(),
}: {
  points: Array<Record<string, string | number>>
  metric: string
  format?: (n: number) => string
}) {
  if (!points.length) {
    return <Empty inset tone="filtered" title="No data in this range" body={RANGE_HINT} />
  }
  const values = points.map((p) => Number(p[metric]) || 0)
  const max = Math.max(...values, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 110, overflowX: 'auto', paddingTop: 4 }}>
      {points.map((p, i) => (
        <div
          key={String(p.bucket)}
          title={`${p.bucket}: ${format(values[i])}`}
          style={{
            flex: '1 0 6px',
            minWidth: 6,
            height: `${Math.max(2, (values[i] / max) * 100)}%`,
            background: COLORS.burgundy,
            opacity: values[i] ? 1 : 0.18,
            borderRadius: '3px 3px 0 0',
          }}
        />
      ))}
    </div>
  )
}

// ---- Authenticated fetch ----------------------------------------------------
// The qk_staff cookie is httpOnly, so there is no token for the page to hold —
// `credentials: 'same-origin'` is the whole auth story. A 401 means the session
// died (expired, idle, revoked, deactivated) and the console should leave.

export function sessionEnded() {
  window.location.href = '/ops/login?reason=expired'
}

/** GET an admin endpoint. Returns 'forbidden' when the operator lacks the module,
 *  so callers can show a useful message instead of a blank panel. */
export async function adminGet<T>(path: string): Promise<T | 'forbidden' | null> {
  try {
    const res = await fetch(`/api/local/admin/${path}`, { credentials: 'same-origin', cache: 'no-store' })
    if (res.status === 401) {
      sessionEnded()
      return null
    }
    if (res.status === 403) return 'forbidden'
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/**
 * Like adminGet, but for BACKGROUND polling: a 401 returns 'expired' instead of
 * redirecting to the login page.
 *
 * adminGet's redirect is right for a click — the operator asked for something and the
 * session was gone. It is wrong for a poll, which would yank someone out of whatever
 * they were typing on another screen the moment their session lapsed. The caller
 * stops polling and says so instead.
 */
export async function adminGetQuiet<T>(path: string): Promise<T | 'forbidden' | 'expired' | null> {
  try {
    const res = await fetch(`/api/local/admin/${path}`, { credentials: 'same-origin', cache: 'no-store' })
    if (res.status === 401) return 'expired'
    if (res.status === 403) return 'forbidden'
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** POST/PATCH/DELETE an admin endpoint. Returns the parsed body plus `ok`, so a
 *  caller can surface the server's own error message. */
export async function adminSend<T = unknown>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown
): Promise<{ ok: boolean; status: number; data: T | { error?: string } }> {
  try {
    const res = await fetch(`/api/local/admin/${path}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 401) {
      sessionEnded()
      return { ok: false, status: 401, data: {} as T }
    }
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: 'Network error. Please try again.' } }
  }
}

/** EGP with no decimals — every price in this app is EGP, and cents are noise in a
 *  report. Kept here so every /ops surface formats money identically. */
export function money(n: number | null | undefined): string {
  return `EGP ${Math.round(Number(n) || 0).toLocaleString()}`
}
