// =============================================================================
// ROOT LOADING BOUNDARY
// =============================================================================
// The last-resort fallback: shown only when a route has no nearer loading.tsx of
// its own. In practice that now means a cold app boot and the handful of client-
// rendered guest screens (/login, /signup, /messages, /auth/*) whose payloads are
// small enough that this barely flashes.
//
// It used to be a dark, blurred, fullscreen overlay — and because /ops declared no
// loading boundary anywhere in its 16 pages, EVERY sidebar click in the console
// landed here and wiped the entire screen, sidebar and top bar included, before
// redrawing it. The console (and the guest routes that hit the DB) now own their
// own skeletons; this is left as the cold-boot screen it was always meant to be.
//
// Cream rather than dimmed black: dimming implies something is still behind it, and
// on a first load there is nothing behind it to dim.
// =============================================================================

import { QuickInMark } from '@/components/ui/quickin-mark'
import { RouteProgress } from '@/components/ui/route-progress'
import { getTranslations } from 'next-intl/server'

const C = { burgundy: '#5B0F16', cream: '#F6F1E6', muted: '#6B6055' }
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

export default async function Loading() {
  const t = await getTranslations('common')
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        background: C.cream,
        fontFamily: FONT,
      }}
    >
      <RouteProgress />

      <QuickInMark size={64} label={null} />

      <div style={{ textAlign: 'center' }}>
        <p
          style={{
            margin: 0,
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: C.burgundy,
          }}
        >
          {t('brand')}
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: C.muted }}>{t('loadingStays')}</p>
      </div>
    </div>
  )
}
