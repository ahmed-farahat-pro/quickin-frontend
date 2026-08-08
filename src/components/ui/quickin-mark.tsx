// The QuickIn "Q" that draws itself — the one place a logo spinner still earns its
// keep, now that route transitions are handled by <RouteProgress /> and skeletons.
//
// Use it for waits where there is genuinely nothing to skeleton yet: a cold app
// boot, or a sign-in screen that has no layout to hint at. Do NOT use it for a
// route transition inside an authenticated shell — replacing a populated screen
// with a centred spinner is exactly the behaviour this work set out to remove.
//
// The animation is one 2.4s cycle: the ring strokes on like a signature, the tail
// snaps in to complete the Q, the mark holds, then the whole thing fades and the
// cycle restarts. The fade at both ends is what makes it loop without a visible
// pop — a hard cut back to an empty ring reads as a stutter.
//
// Pure server-renderable markup: no 'use client', no hooks, no state.

const BURGUNDY = '#5B0F16'
const TAN = '#EFE6D8'

// Radius 19 on a 60-unit box: circumference is 2πr ≈ 119.4, so 120 is a dash long
// enough to hide the whole stroke at full offset with no sliver left showing.
const R = 19
const DASH = 120

const RING = 'qkMarkRing'
const TAIL = 'qkMarkTail'
const CYCLE = 'qkMarkCycle'

interface QuickInMarkProps {
  /** Rendered box in px. The artwork scales with it; 56 is the comfortable default. */
  size?: number
  /** Announced to screen readers. Pass null for a purely decorative instance sitting
   *  beside text that already says the page is loading. */
  label?: string | null
}

export function QuickInMark({ size = 56, label = 'Loading' }: QuickInMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 60 60"
      role={label ? 'img' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <style>{`
        @keyframes ${RING} {
          0%   { stroke-dashoffset: ${DASH}; }
          45%  { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes ${TAIL} {
          0%, 46%   { opacity: 0; transform: scale(0.55); }
          62%, 100% { opacity: 1; transform: scale(1); }
        }
        @keyframes ${CYCLE} {
          0%        { opacity: 0; }
          10%, 84%  { opacity: 1; }
          100%      { opacity: 0; }
        }
        /* Without motion the mark is simply the finished logo. A drawing animation
           has no meaningful static frame other than its last one. */
        @media (prefers-reduced-motion: reduce) {
          .qk-mark-cycle, .qk-mark-ring, .qk-mark-tail { animation: none !important; }
          .qk-mark-ring { stroke-dashoffset: 0 !important; }
          .qk-mark-tail { opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      <g className="qk-mark-cycle" style={{ animation: `${CYCLE} 2.4s ease-in-out infinite` }}>
        {/* The unfilled track: without it the mark visibly shrinks to nothing at the
            start of each cycle instead of reading as a ring being drawn. */}
        <circle cx="28" cy="28" r={R} fill="none" stroke={TAN} strokeWidth="4" />
        <circle
          className="qk-mark-ring"
          cx="28"
          cy="28"
          r={R}
          fill="none"
          stroke={BURGUNDY}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={DASH}
          style={{
            // Start the stroke at 12 o'clock rather than 3 o'clock, which is where
            // a hand would start drawing it.
            transform: 'rotate(-90deg)',
            transformOrigin: '28px 28px',
            animation: `${RING} 2.4s ease-in-out infinite`,
          }}
        />
        <line
          className="qk-mark-tail"
          x1="38"
          y1="40"
          x2="49"
          y2="52"
          stroke={BURGUNDY}
          strokeWidth="4.5"
          strokeLinecap="round"
          style={{
            transformOrigin: '38px 40px',
            animation: `${TAIL} 2.4s ease-in-out infinite`,
          }}
        />
      </g>
    </svg>
  )
}
