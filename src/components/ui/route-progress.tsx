// The thin burgundy bar that rides the top of the viewport while a route
// transition is in flight.
//
// There is no router subscription behind this, and deliberately so. A Next.js
// `loading.tsx` is mounted at exactly the moment a navigation starts and unmounted
// the moment the server payload lands — which is precisely the lifetime an
// nprogress-style bar wants. Rendering <RouteProgress /> inside every route
// skeleton therefore gives the same behaviour with no client JavaScript, no
// listeners to leak, and nothing to keep in sync with the App Router.
//
// It exists because the alternative was the fullscreen overlay in app/loading.tsx,
// which tore down the entire screen — /ops sidebar and top bar included — on every
// sidebar click, since no segment under /ops declared a loading boundary of its own.
//
// Pure server-renderable markup: no 'use client', no hooks, no state.

/** Brand burgundy. Matched to ops-theme.ts / skeleton-block.tsx rather than imported,
 *  so this component stays usable from every tree without dragging /ops into it. */
const BURGUNDY = '#5B0F16'

const ANIM = 'qkRouteProgress'

/**
 * An indeterminate progress bar pinned to the top of the viewport.
 *
 * Sits above the /ops sticky header (z-index 30) and the app's own overlays, so it
 * stays visible wherever it is dropped. Marked aria-hidden — the skeleton that
 * renders it owns the announcement (see the visually-hidden live region in
 * ops-skeleton.tsx), and a second one here would double up in a screen reader.
 */
export function RouteProgress() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        overflow: 'hidden',
        background: 'rgba(91,15,22,0.12)',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <style>{`
        @keyframes ${ANIM} {
          0%   { left: -38%; width: 38%; }
          50%  { left: 28%;  width: 46%; }
          100% { left: 100%; width: 38%; }
        }
        /* Reduced motion still needs to say "something is happening" — it just says
           it without travelling. A static stub reads as a stalled bar, so fade the
           whole track instead of sliding a segment across it. */
        @media (prefers-reduced-motion: reduce) {
          .qk-route-progress-bar {
            animation: none !important;
            left: 0 !important;
            width: 100% !important;
            opacity: 0.55;
          }
        }
      `}</style>
      <div
        className="qk-route-progress-bar"
        style={{
          position: 'absolute',
          top: 0,
          height: '100%',
          background: BURGUNDY,
          borderRadius: 999,
          animation: `${ANIM} 1.15s cubic-bezier(0.4, 0, 0.2, 1) infinite`,
        }}
      />
    </div>
  )
}
