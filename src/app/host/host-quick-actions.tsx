// The host dashboard's quick-action shelf: Review your guests, Analytics,
// Earnings and Services.
//
// This is what the parity ticket was actually about. iOS lists all four as
// cards on HostDashboardView and Android reaches them from Profile → Hosting;
// on the web they did not exist at all until now, so /host offered only the two
// tabs (listings, reservations) and a host had nowhere to go for their money.
//
// A server component — four links, no state.
import { FRAME_COLORS as C } from '@/components/layout/page-frame'

export interface QuickAction {
  href: string
  /** A single glyph. Deliberately text, not an icon set: this app ships no
   *  icon library, and four inline SVGs would be four more things to theme. */
  glyph: string
  label: string
  hint: string
}

export function HostQuickActions({ actions, ariaLabel }: { actions: readonly QuickAction[]; ariaLabel: string }) {
  return (
    <>
      <style>{`
        .qk-host-actions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        @media (max-width: 900px) { .qk-host-actions { grid-template-columns: 1fr 1fr !important; } }
        @media (max-width: 460px) { .qk-host-actions { grid-template-columns: 1fr !important; } }
      `}</style>
      <nav className="qk-host-actions" aria-label={ariaLabel} style={{ marginBottom: 26 }}>
        {actions.map((action) => (
          <a
            key={action.href}
            href={action.href}
            style={{
              display: 'block',
              textDecoration: 'none',
              background: '#fff',
              borderRadius: 18,
              border: '1px solid rgba(42,34,32,0.06)',
              boxShadow: '0 6px 24px rgba(42,34,32,0.06)',
              padding: '16px 18px',
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 38,
                height: 38,
                borderRadius: 12,
                background: C.tan,
                fontSize: 18,
                marginBottom: 10,
              }}
            >
              {action.glyph}
            </span>
            <span
              style={{
                display: 'block',
                fontSize: 15,
                fontWeight: 700,
                color: C.ink,
                marginBottom: 2,
              }}
            >
              {action.label}
            </span>
            <span style={{ display: 'block', fontSize: 13, color: C.muted, lineHeight: 1.4 }}>
              {action.hint}
            </span>
          </a>
        ))}
      </nav>
    </>
  )
}
