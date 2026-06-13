// Clean "no photo" placeholder shown wherever a listing/service has no image —
// replaces the old stock-photo fallback. A tan/cream box that fills its parent
// (so it matches the image's box exactly) with a centered house icon + label.
// Server-safe (no hooks / no 'use client').

const COLORS = {
  burgundy: '#5B0F16',
  cream: '#F6F1E6',
  tan: '#EFE6D8',
  muted: '#6B6055',
}

export default function ImagePlaceholder({
  label = 'No photo',
  iconSize = 34,
  fontSize = 13,
}: {
  label?: string
  iconSize?: number
  fontSize?: number
}) {
  return (
    <div
      role="img"
      aria-label={label}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        background: `linear-gradient(160deg, ${COLORS.tan} 0%, ${COLORS.cream} 100%)`,
        color: COLORS.muted,
        textAlign: 'center',
      }}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke={COLORS.burgundy}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ opacity: 0.55 }}
      >
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
        <path d="M9.5 21v-6h5v6" />
      </svg>
      <span style={{ fontSize, fontWeight: 600, letterSpacing: '0.01em' }}>
        {label}
      </span>
    </div>
  )
}
