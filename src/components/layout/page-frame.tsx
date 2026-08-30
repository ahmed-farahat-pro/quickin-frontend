// The cream page chrome every signed-in surface wears: logo, a row of "back to"
// links, a serif title and a subtitle.
//
// Extracted when the host area gained four screens at once (earnings,
// analytics, guest reviews, services) and the services browse gained two more.
// /saved, /host and /reservations each hand-rolled this header before that; a
// seventh copy was the point at which "the pages look alike" stopped being true
// by luck. Those three are deliberately left alone — this is for the new
// surfaces, and folding them in is a separate change with its own diff to read.
//
// A server component: it renders no interactivity, so it costs the client
// bundle nothing.
import type { ReactNode } from 'react'

export const FRAME_COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  ink: '#2A2220',
  muted: '#6B6055',
} as const

export const FRAME_FONT =
  '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

const BACK_LINK_STYLE = {
  color: FRAME_COLORS.burgundy,
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: 14,
} as const

export interface BackLink {
  href: string
  label: string
}

export function PageFrame({
  title,
  subtitle,
  backLinks,
  /** Rendered on the title's row, right-aligned — a primary action for the page. */
  action,
  /** Caps the content column. Wider for grids, narrower for a single column. */
  maxWidth = 1100,
  children,
}: {
  title: string
  subtitle?: ReactNode
  backLinks: readonly BackLink[]
  action?: ReactNode
  maxWidth?: number
  children: ReactNode
}) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: FRAME_COLORS.cream,
        color: FRAME_COLORS.ink,
        fontFamily: FRAME_FONT,
      }}
    >
      <header
        style={{
          background: `linear-gradient(180deg, ${FRAME_COLORS.tan} 0%, ${FRAME_COLORS.cream} 100%)`,
          borderBottom: '1px solid rgba(91,15,22,0.10)',
          padding: '20px 24px',
        }}
      >
        <div
          style={{
            maxWidth,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <a href="/explore" style={{ display: 'inline-flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="QuickIn"
              height={40}
              style={{ height: 40, width: 'auto', display: 'block' }}
            />
          </a>
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            {backLinks.map((link) => (
              <a key={link.href} href={link.href} style={BACK_LINK_STYLE}>
                ← {link.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <section style={{ maxWidth, margin: '0 auto', padding: '36px 24px 72px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
            marginBottom: 28,
          }}
        >
          <div>
            <h1
              style={{
                margin: '0 0 6px',
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: 'clamp(26px, 4vw, 34px)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: FRAME_COLORS.burgundy,
              }}
            >
              {title}
            </h1>
            {subtitle !== undefined && (
              <p style={{ margin: 0, fontSize: 15, color: FRAME_COLORS.muted }}>{subtitle}</p>
            )}
          </div>
          {action}
        </div>
        {children}
      </section>
    </main>
  )
}

/**
 * The white rounded panel the cream pages put content in. Same radius, border
 * and shadow the listing and reservation cards already use.
 */
export function Panel({
  padding = '22px 24px',
  children,
  style,
}: {
  padding?: string
  children: ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 22,
        border: '1px solid rgba(42,34,32,0.06)',
        boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** The centred "there is nothing here yet" panel, with an optional way out. */
export function EmptyPanel({
  title,
  hint,
  cta,
}: {
  title: string
  hint?: string
  cta?: { href: string; label: string }
}) {
  return (
    <Panel padding="48px 24px" style={{ textAlign: 'center', color: FRAME_COLORS.muted }}>
      <p style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: FRAME_COLORS.ink }}>
        {title}
      </p>
      {hint && <p style={{ margin: cta ? '0 0 18px' : 0, fontSize: 15 }}>{hint}</p>}
      {cta && (
        <a
          href={cta.href}
          style={{
            display: 'inline-block',
            color: '#fff',
            background: FRAME_COLORS.burgundy,
            textDecoration: 'none',
            fontWeight: 700,
            padding: '11px 24px',
            borderRadius: 999,
          }}
        >
          {cta.label}
        </a>
      )}
    </Panel>
  )
}
