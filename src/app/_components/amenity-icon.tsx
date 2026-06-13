// Maps an amenity label to a small inline SVG icon, used by the listing detail
// "What this place offers" grid. Server-safe (no hooks). Matches by a normalised
// label; anything unknown falls back to a generic check badge.

const STROKE = '#5B0F16'

function base(children: React.ReactNode) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={STROKE}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

// Canonical amenity → icon. Keyed by lowercased label.
const ICONS: Record<string, React.ReactNode> = {
  wifi: base(
    <>
      <path d="M5 12.55a11 11 0 0 1 14 0" />
      <path d="M1.5 9a16 16 0 0 1 21 0" />
      <path d="M8.5 16.1a6 6 0 0 1 7 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </>
  ),
  pool: base(
    <>
      <path d="M2 16c1.5 0 1.5 1.5 3 1.5S6.5 16 8 16s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5" />
      <path d="M2 20c1.5 0 1.5 1.5 3 1.5S6.5 20 8 20s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5" />
      <path d="M7 14V5a2 2 0 0 1 4 0M11 11h4" />
    </>
  ),
  kitchen: base(
    <>
      <path d="M8 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2M5 2v9M5 11v11" />
      <path d="M19 2c-1.7 0-3 2-3 5s1.3 4 3 4 3-1 3-4-1.3-5-3-5ZM19 11v11" />
    </>
  ),
  'air conditioning': base(
    <>
      <rect x="2" y="4" width="20" height="9" rx="2" />
      <path d="M6 17v2M12 17v3M18 17v2M6 9h.01M10 9h4" />
    </>
  ),
  'free parking': base(
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M9 17V7h4a3 3 0 0 1 0 6H9" />
    </>
  ),
  washer: base(
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <circle cx="12" cy="13" r="4" />
      <path d="M8 6h.01M11 6h.01" />
    </>
  ),
  tv: base(
    <>
      <rect x="2" y="5" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 18v3" />
    </>
  ),
  heating: base(
    <>
      <path d="M12 2s4 4 4 7a4 4 0 0 1-8 0c0-1 .5-2 1-2.5" />
      <path d="M12 22a5 5 0 0 0 5-5c0-2-1-3-1-3" />
    </>
  ),
  workspace: base(
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M2 20h20M8 16v4M16 16v4" />
    </>
  ),
  gym: base(
    <>
      <path d="M6.5 6.5 17.5 17.5M3 9l1.5-1.5M21 15l-1.5 1.5" />
      <rect x="2" y="7" width="4" height="10" rx="1" transform="rotate(45 4 12)" />
      <rect x="18" y="7" width="4" height="10" rx="1" transform="rotate(45 20 12)" />
    </>
  ),
  'beach access': base(
    <>
      <circle cx="12" cy="6" r="3" />
      <path d="M12 9v13M5 22a7 7 0 0 1 14 0" />
    </>
  ),
  'pets allowed': base(
    <>
      <circle cx="5.5" cy="11" r="1.6" />
      <circle cx="10" cy="7" r="1.6" />
      <circle cx="14.5" cy="7" r="1.6" />
      <circle cx="18.5" cy="11" r="1.6" />
      <path d="M8 14c-1.5 1-2.5 2.5-2.5 4A2.5 2.5 0 0 0 8 20.5c1 0 1.5-.5 4-.5s3 .5 4 .5a2.5 2.5 0 0 0 2.5-2.5c0-1.5-1-3-2.5-4-1-.7-2-1-4-1s-3 .3-4 1Z" />
    </>
  ),
  'hot tub': base(
    <>
      <path d="M3 13h18v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6Z" />
      <path d="M7 13V8a2 2 0 0 1 4 0M14 6v0M17 5v0M11 5v0" />
    </>
  ),
  'bbq grill': base(
    <>
      <path d="M4 7h16l-1.5 7a4 4 0 0 1-4 3H9.5a4 4 0 0 1-4-3L4 7Z" />
      <path d="M9 17l-1 4M15 17l1 4M10 4v0M13 3v0" />
    </>
  ),
  breakfast: base(
    <>
      <path d="M4 8h12a4 4 0 0 1 0 8h-1" />
      <path d="M4 8v6a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4" />
      <path d="M7 3v2M10 3v2M13 3v2" />
    </>
  ),
}

const DEFAULT = base(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </>
)

export default function AmenityIcon({ name }: { name: string }) {
  const key = name.trim().toLowerCase()
  return <>{ICONS[key] ?? DEFAULT}</>
}
